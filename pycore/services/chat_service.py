"""
AI 对话 Pipeline 服务。

完整流程：用户消息 → 情绪识别 → 意图识别 → 路由决策 → 回复生成 → 持久化
"""

import json
import random
import re
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from pycore.core.settings import get_settings
from pycore.integrations.db.models import Message, Session
from pycore.integrations.llm.base import Message as LLMMessage
from pycore.integrations.llm.qwen_provider import get_llm_client
from pycore.services import retrieval_service, ticket_service

# ---------------------------------------------------------------------------
# DB session factory
# ---------------------------------------------------------------------------

def _get_engine():
    settings = get_settings()
    return create_async_engine(
        f"sqlite+aiosqlite:///{settings.database_path}", echo=False
    )


_engine = _get_engine()
_session_maker = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# 直接触发转人工的关键词（无需 LLM）
TRANSFER_KEYWORDS = ["转人工", "找人工", "要人工", "转接人工", "要真人", "找真人"]

# 高风险售后场景直接触发转人工（无需 LLM）
CRITICAL_SERVICE_KEYWORDS = [
    "抛锚", "无法启动", "启动不了", "打不着车", "趴窝",
    "充不了电", "充不进电", "充电故障", "无法充电",
    "刹车失灵", "刹车故障", "方向失控", "失控",
    "事故", "碰撞", "撞车", "爆胎", "冒烟", "起火", "漏电",
    "救援", "拖车", "红色报警", "紧急",
]

# 路由分类
ROUTES = ["售前", "售中", "售后"]

# 各路由下的一级意图
PRESALE_L1 = [
    "购车需求澄清", "车型推荐", "车型信息咨询", "车型对比",
    "价格咨询", "优惠活动咨询", "金融贷款咨询", "旧车置换咨询",
    "试驾预约", "门店与销售咨询", "库存咨询", "购车流程咨询",
]
MIDSAL_L1 = [
    "订单状态查询", "生产排期查询", "物流运输查询", "交付时间确认",
    "订单变更", "付款与金融手续", "合同与票据", "交付准备", "交付异常",
]
AFTSALE_L1 = [
    "车辆使用咨询", "故障咨询与维修", "维修进度查询", "保养服务",
    "售后活动咨询", "道路救援", "事故处理", "保险理赔", "保修与政策",
    "召回与软件升级", "充电与新能源使用", "车主信息与账户", "配件与精品",
    "投诉与人工服务", "兜底澄清",
]
ALL_L1 = PRESALE_L1 + MIDSAL_L1 + AFTSALE_L1

# 售中路由整体转人工（暂无订单后端）
MIDSAL_TRANSFER_REASON = "订单查询需人工核实"

# 高优先级关键词
HIGH_PRIORITY_KEYWORDS = ["故障", "异响", "维修", "刹车", "碰撞", "事故", "紧急", "救援", "爆胎"]

SYSTEM_PROMPT = (
    "你是极氪汽车的智能客服助手，服务极氪车主和潜在购车用户。\n"
    "用简洁、专业、友好的语气回答用户问题。\n"
    "要求：\n"
    "1. 直接回答，不重复用户的话\n"
    "2. 中文，不超过 150 字\n"
    "3. 有参考信息时自然融入，不加引用格式\n"
    "4. 涉及价格/配置时给出具体数字\n"
    "5. 确实不清楚时说明并引导到店或人工客服\n"
    "6. 需要澄清时用自然语气提一个问题，不要列举选项\n"
    "7. 纯电车型（001、007、007GT、009、009光辉、7X、MIX、X）没有发动机，"
    "被问到机油/机滤更换时，须明确告知「纯电车型无需更换机油机滤」，"
    "不要回避或转移话题；仅插混车型（8X、9X）需要机油保养\n"
    "8. 参考信息标注【权威】的条目是最终答案，必须原文引用，禁止根据其他参考自行归纳、"
    "增删或重新统计；尤其是车型列表、质保年限、价格等数字型事实"
)

def _build_context(chunks: list) -> str:
    """构建 RAG 上下文字符串。
    若存在置信度极高（score≥0.99）的 qa 命中，则仅返回 qa 片段，
    避免补充参考中的噪声车型名称干扰 LLM 对权威答案的采纳。
    """
    qa_chunks = [c for c in chunks if c.get("source") == "qa"]
    other_chunks = [c for c in chunks if c.get("source") != "qa"]

    # 高置信 qa：直接只用 qa，彻底去掉可能引入干扰的补充参考
    if qa_chunks and max(c.get("score", 0) for c in qa_chunks) >= 0.99:
        return "\n".join(c["content"] for c in qa_chunks)

    # 正常情况：qa 优先区 + 补充参考
    sections: list[str] = []
    if qa_chunks:
        sections.append(
            "【权威答案，直接引用】\n" + "\n".join(c["content"] for c in qa_chunks)
        )
    if other_chunks:
        sections.append(
            "【补充参考】\n"
            + "\n".join(f"参考{i+1}：{t}" for i, t in enumerate(other_chunks))
        )
    return "\n\n".join(sections)


# 单次 LLM 分类 prompt（情绪 + 路由 + 一级意图 + 是否需要澄清）
_L1_LIST = "|".join(ALL_L1)
CLASSIFY_PROMPT_TMPL = (
    "分析用户消息，只返回 JSON，不要其他文字。\n"
    "字段说明：\n"
    '  route: "售前"|"售中"|"售后"\n'
    f'  intent_l1: 一级意图，从以下选择最匹配的一个：{_L1_LIST}\n'
    '  confidence: 意图置信度 0.0-1.0\n'
    '  need_clarify: 意图真正模糊时为 true（仅兜底澄清场景），否则 false\n'
    '  clarify_question: need_clarify=true 时填一个澄清问题，否则为 null\n'
    '  emotion: "positive"|"neutral"|"negative"\n'
    '  emotion_score: 负面情绪概率 0.0-1.0\n'
    '  need_human: 用户明确要人工/投诉升级时为 true，否则 false\n\n'
    "用户消息：{msg}"
)


def _count_unmatched_user_messages(messages: list[Message]) -> int:
    """Count prior user turns that should contribute to auto-transfer."""
    return sum(
        1
        for m in messages
        if m.role == "user"
        and (
            m.intent == "兜底澄清"
            or (
                m.intent_confidence is not None
                and m.intent_confidence < 0.4
            )
        )
    )


# ---------------------------------------------------------------------------
# LLM helpers
# ---------------------------------------------------------------------------

async def _call_llm_json(
    llm,
    prompt: str,
    default: dict,
) -> dict:
    """调用 LLM 并解析 JSON，解析失败返回 default。"""
    try:
        resp = await llm.chat([LLMMessage.user(prompt)])
        content = (resp.content or "").strip()
        # 尝试从 markdown code block 中提取
        match = re.search(r"```(?:json)?\s*([\s\S]*?)```", content)
        if match:
            content = match.group(1).strip()
        return json.loads(content)
    except Exception:
        return default


# ---------------------------------------------------------------------------
# Core pipeline
# ---------------------------------------------------------------------------

async def process_message(
    session_id: str,
    user_msg: str,
) -> dict[str, Any]:
    """
    完整 AI Pipeline，返回接口数据字典。
    不抛出异常，所有错误内部处理。
    """
    llm = get_llm_client()

    async with _session_maker() as db:
        # ----------------------------------------------------------------
        # 1. 加载或创建会话
        # ----------------------------------------------------------------
        session_row = await db.get(Session, session_id)
        if session_row is None:
            session_row = Session(session_id=session_id, status="ai_serving", round=0)
            db.add(session_row)
            await db.flush()

        current_round = session_row.round + 1
        session_row.round = current_round

        # ----------------------------------------------------------------
        # 2. 加载最近 10 条历史消息（5 轮）
        # ----------------------------------------------------------------
        stmt = (
            select(Message)
            .where(Message.session_id == session_id)
            .order_by(Message.id.desc())
            .limit(10)
        )
        result = await db.execute(stmt)
        recent_msgs = list(reversed(result.scalars().all()))

        history_llm: list[LLMMessage] = []
        for m in recent_msgs:
            if m.role == "user":
                history_llm.append(LLMMessage.user(m.content))
            elif m.role == "assistant":
                history_llm.append(LLMMessage.assistant(m.content))

        # ----------------------------------------------------------------
        # 3. 关键词检测（优先级最高，无需 LLM）
        # ----------------------------------------------------------------
        need_human = False
        transfer_reason: str | None = None

        for kw in TRANSFER_KEYWORDS:
            if kw in user_msg:
                need_human = True
                transfer_reason = "用户要求"
                break

        if not need_human:
            for kw in CRITICAL_SERVICE_KEYWORDS:
                if kw in user_msg:
                    need_human = True
                    transfer_reason = "高风险售后"
                    break

        # ----------------------------------------------------------------
        # 4. 单次 LLM 调用：情绪 + 路由 + 一级意图 + 是否澄清
        # ----------------------------------------------------------------
        emotion = "neutral"
        emotion_score = 0.0
        route = "售后"
        intent = "兜底澄清"
        intent_confidence = 0.5
        need_clarify = False
        clarify_question: str | None = None

        low_conf_count = _count_unmatched_user_messages(recent_msgs)

        if not need_human:
            classify_result = await _call_llm_json(
                llm,
                CLASSIFY_PROMPT_TMPL.format(msg=user_msg),
                {"route": "售后", "intent_l1": "兜底澄清", "confidence": 0.5,
                 "need_clarify": False, "clarify_question": None,
                 "emotion": "neutral", "emotion_score": 0.0, "need_human": False},
            )
            emotion = classify_result.get("emotion", "neutral")
            if emotion not in ("positive", "neutral", "negative"):
                emotion = "neutral"
            try:
                emotion_score = float(classify_result.get("emotion_score", 0.0))
            except (TypeError, ValueError):
                emotion_score = 0.0

            route = classify_result.get("route", "售后")
            if route not in ROUTES:
                route = "售后"

            intent = classify_result.get("intent_l1", "兜底澄清")
            if intent not in ALL_L1:
                intent = "兜底澄清"

            try:
                intent_confidence = float(classify_result.get("confidence", 0.5))
            except (TypeError, ValueError):
                intent_confidence = 0.5

            need_clarify = bool(classify_result.get("need_clarify", False))
            clarify_question = classify_result.get("clarify_question")

            # LLM 判断需要人工（投诉升级等）
            if classify_result.get("need_human"):
                need_human = True
                transfer_reason = "投诉升级"

            # 高负面情绪转人工
            if emotion == "negative" and emotion_score > 0.6:
                need_human = True
                transfer_reason = "情绪负面"

            # 售中路由整体转人工（订单后端尚未上线）
            if route == "售中" and not need_human:
                need_human = True
                transfer_reason = MIDSAL_TRANSFER_REASON

            # 投诉与人工服务一级意图直接转人工
            if intent == "投诉与人工服务" and not need_human:
                need_human = True
                transfer_reason = "用户要求"

        current_unmatched = (
            intent == "兜底澄清"
            or intent_confidence < 0.4
            or need_clarify
        )
        if not need_human and current_unmatched and low_conf_count + 1 >= 3:
            need_human = True
            need_clarify = False
            transfer_reason = "连续3次未匹配"

        # ----------------------------------------------------------------
        # 5. 路由决策
        # ----------------------------------------------------------------
        reply = ""

        if need_human:
            reply = "好的，正在为您转接人工客服，请稍候。"
        elif need_clarify and clarify_question:
            # 真正意图不明确时才澄清
            reply = clarify_question
        else:
            # RAG 检索 + 生成回复
            top_chunks = await retrieval_service.retrieve(user_msg, intent=intent)
            context_str = _build_context(top_chunks)

            messages_for_reply: list[LLMMessage] = [LLMMessage.system(SYSTEM_PROMPT)]
            messages_for_reply.extend(history_llm)
            # 在 user content 前注入意图标签，锚定 LLM 理解
            intent_prefix = f"[用户意图：{route}·{intent}]\n" if intent and route else ""
            user_content = f"{intent_prefix}{user_msg}"
            if context_str:
                user_content += f"\n\n{context_str}"
            messages_for_reply.append(LLMMessage.user(user_content))

            try:
                resp = await llm.chat(messages_for_reply)
                reply = (resp.content or "").strip()
            except Exception:
                reply = "抱歉，我暂时无法回答，请稍后再试或联系人工客服。"

        # ----------------------------------------------------------------
        # 6. 优先级 & 工单分类
        # ----------------------------------------------------------------
        priority = "medium"
        if (emotion == "negative" and emotion_score > 0.6) or any(
            kw in user_msg for kw in HIGH_PRIORITY_KEYWORDS
        ):
            priority = "high"

        # 工单分类取路由
        category = route if route in ("售前", "售后") else "售后"

        # ----------------------------------------------------------------
        # 8. 持久化用户消息
        # ----------------------------------------------------------------
        user_msg_row = Message(
            session_id=session_id,
            role="user",
            content=user_msg,
            intent=intent,
            intent_confidence=intent_confidence,
            emotion=emotion,
            emotion_score=emotion_score,
        )
        db.add(user_msg_row)

        # ----------------------------------------------------------------
        # 9. 持久化 AI 回复
        # ----------------------------------------------------------------
        ai_msg_row = Message(
            session_id=session_id,
            role="assistant",
            content=reply,
        )
        db.add(ai_msg_row)

        # ----------------------------------------------------------------
        # 10. 创建工单（需要转人工时）
        # ----------------------------------------------------------------
        ticket_id: str | None = None
        queue_position: int | None = None

        await db.commit()

    if need_human and session_row.ticket_id is None:
        ticket_data = await ticket_service.create_ticket(
            session_id=session_id,
            priority=priority,
            category=category,
            emotion=emotion,
            transfer_reason=transfer_reason,
            preview=user_msg[:100],
            round=current_round,
        )
        ticket_id = ticket_data["ticket_id"]
        async with _session_maker() as db2:
            session_row2 = await db2.get(Session, session_id)
            if session_row2 is not None:
                session_row2.ticket_id = ticket_id
                session_row2.status = "transferring"
                await db2.commit()
        queue_position = random.randint(1, 5)
        # 推送 new_ticket 给坐席（延迟导入避免循环依赖）
        try:
            import asyncio  # noqa: PLC0415, I001
            from app.routers.agent import push_to_agent  # noqa: PLC0415
            asyncio.ensure_future(push_to_agent("A001", {
                "type": "new_ticket",
                "ticket": ticket_data,
            }))
        except Exception:
            pass
    elif need_human and session_row.ticket_id:
        ticket_id = session_row.ticket_id

    return {
        "reply": reply,
        "session_id": session_id,
        "intent": intent,
        "intent_confidence": intent_confidence,
        "emotion": emotion,
        "emotion_score": emotion_score,
        "need_human": need_human,
        "ticket_id": ticket_id,
        "transfer_reason": transfer_reason,
        "queue_position": queue_position,
        "round": current_round,
    }


async def stream_reply(
    session_id: str,
    user_msg: str,
) -> AsyncIterator[dict[str, Any]]:
    """
    流式版本，先 yield delta 事件逐字输出，最后 yield done/transfer 元数据。
    """
    llm = get_llm_client()

    async with _session_maker() as db:
        # 加载或创建会话
        session_row = await db.get(Session, session_id)
        if session_row is None:
            session_row = Session(session_id=session_id, status="ai_serving", round=0)
            db.add(session_row)
            await db.flush()

        current_round = session_row.round + 1
        session_row.round = current_round

        # ----------------------------------------------------------------
        # 已转人工：跳过 AI 流程，仅持久化用户消息并通知坐席
        # ----------------------------------------------------------------
        if session_row.status == "transferring":
            user_msg_row = Message(
                session_id=session_id,
                role="user",
                content=user_msg,
            )
            db.add(user_msg_row)
            await db.commit()
            existing_ticket_id = session_row.ticket_id
            yield {"type": "done", "data": {"ticket_id": existing_ticket_id}}
            return

        # 历史消息
        stmt = (
            select(Message)
            .where(Message.session_id == session_id)
            .order_by(Message.id.desc())
            .limit(10)
        )
        result = await db.execute(stmt)
        recent_msgs = list(reversed(result.scalars().all()))

        history_llm: list[LLMMessage] = []
        for m in recent_msgs:
            if m.role == "user":
                history_llm.append(LLMMessage.user(m.content))
            elif m.role == "assistant":
                history_llm.append(LLMMessage.assistant(m.content))

        # 关键词检测
        need_human = False
        transfer_reason: str | None = None
        for kw in TRANSFER_KEYWORDS:
            if kw in user_msg:
                need_human = True
                transfer_reason = "用户要求"
                break

        if not need_human:
            for kw in CRITICAL_SERVICE_KEYWORDS:
                if kw in user_msg:
                    need_human = True
                    transfer_reason = "高风险售后"
                    break

        # 单次 LLM 分类
        emotion = "neutral"
        emotion_score = 0.0
        route = "售后"
        intent = "兜底澄清"
        intent_confidence = 0.5
        need_clarify = False
        clarify_question: str | None = None

        low_conf_count = _count_unmatched_user_messages(recent_msgs)

        if not need_human:
            classify_result = await _call_llm_json(
                llm,
                CLASSIFY_PROMPT_TMPL.format(msg=user_msg),
                {"route": "售后", "intent_l1": "兜底澄清", "confidence": 0.5,
                 "need_clarify": False, "clarify_question": None,
                 "emotion": "neutral", "emotion_score": 0.0, "need_human": False},
            )
            emotion = classify_result.get("emotion", "neutral")
            if emotion not in ("positive", "neutral", "negative"):
                emotion = "neutral"
            try:
                emotion_score = float(classify_result.get("emotion_score", 0.0))
            except (TypeError, ValueError):
                emotion_score = 0.0

            route = classify_result.get("route", "售后")
            if route not in ROUTES:
                route = "售后"
            intent = classify_result.get("intent_l1", "兜底澄清")
            if intent not in ALL_L1:
                intent = "兜底澄清"
            try:
                intent_confidence = float(classify_result.get("confidence", 0.5))
            except (TypeError, ValueError):
                intent_confidence = 0.5

            need_clarify = bool(classify_result.get("need_clarify", False))
            clarify_question = classify_result.get("clarify_question")

            if classify_result.get("need_human"):
                need_human = True
                transfer_reason = "投诉升级"
            if emotion == "negative" and emotion_score > 0.6:
                need_human = True
                transfer_reason = "情绪负面"
            if route == "售中" and not need_human:
                need_human = True
                transfer_reason = MIDSAL_TRANSFER_REASON
            if intent == "投诉与人工服务" and not need_human:
                need_human = True
                transfer_reason = "用户要求"

        current_unmatched = (
            intent == "兜底澄清"
            or intent_confidence < 0.4
            or need_clarify
        )
        if not need_human and current_unmatched and low_conf_count + 1 >= 3:
            need_human = True
            need_clarify = False
            transfer_reason = "连续3次未匹配"

        # 优先级 & 工单分类
        priority = "medium"
        if (emotion == "negative" and emotion_score > 0.6) or any(
            kw in user_msg for kw in HIGH_PRIORITY_KEYWORDS
        ):
            priority = "high"
        category = route if route in ("售前", "售后") else "售后"

        ticket_id: str | None = None
        queue_position: int | None = None

        if need_human:
            reply_full = "好的，正在为您转接人工客服，请稍候。"
            yield {"type": "delta", "content": reply_full}
        elif need_clarify and clarify_question:
            reply_full = clarify_question
            yield {"type": "delta", "content": reply_full}
        else:
            top_chunks = await retrieval_service.retrieve(user_msg, intent=intent)
            context_str = _build_context(top_chunks)

            messages_for_reply: list[LLMMessage] = [LLMMessage.system(SYSTEM_PROMPT)]
            messages_for_reply.extend(history_llm)
            intent_prefix = f"[用户意图：{route}·{intent}]\n" if intent and route else ""
            user_content = f"{intent_prefix}{user_msg}"
            if context_str:
                user_content += f"\n\n{context_str}"
            messages_for_reply.append(LLMMessage.user(user_content))

            # 流式输出
            collected = []
            try:
                async for chunk in llm.chat_stream(messages_for_reply):
                    if chunk:
                        collected.append(chunk)
                        yield {"type": "delta", "content": chunk}
            except Exception:
                fallback = "抱歉，我暂时无法回答，请稍后再试或联系人工客服。"
                yield {"type": "delta", "content": fallback}
                collected = [fallback]
            reply_full = "".join(collected)

        # 持久化
        user_msg_row = Message(
            session_id=session_id,
            role="user",
            content=user_msg,
            intent=intent,
            intent_confidence=intent_confidence,
            emotion=emotion,
            emotion_score=emotion_score,
        )
        db.add(user_msg_row)
        ai_msg_row = Message(
            session_id=session_id,
            role="assistant",
            content=reply_full,
        )
        db.add(ai_msg_row)

        await db.commit()

    if need_human and session_row.ticket_id is None:
        ticket_data = await ticket_service.create_ticket(
            session_id=session_id,
            priority=priority,
            category=category,
            emotion=emotion,
            transfer_reason=transfer_reason,
            preview=user_msg[:100],
            round=current_round,
        )
        ticket_id = ticket_data["ticket_id"]
        async with _session_maker() as db2:
            session_row2 = await db2.get(Session, session_id)
            if session_row2 is not None:
                session_row2.ticket_id = ticket_id
                session_row2.status = "transferring"
                await db2.commit()
        queue_position = random.randint(1, 5)
        # 推送 new_ticket 给坐席（延迟导入避免循环依赖）
        try:
            import asyncio  # noqa: PLC0415, I001
            from app.routers.agent import push_to_agent  # noqa: PLC0415
            asyncio.ensure_future(push_to_agent("A001", {
                "type": "new_ticket",
                "ticket": ticket_data,
            }))
        except Exception:
            pass
    elif need_human and session_row.ticket_id:
        ticket_id = session_row.ticket_id

    meta = {
        "reply": reply_full,
        "session_id": session_id,
        "intent": intent,
        "intent_confidence": intent_confidence,
        "emotion": emotion,
        "emotion_score": emotion_score,
        "need_human": need_human,
        "ticket_id": ticket_id,
        "transfer_reason": transfer_reason,
        "queue_position": queue_position,
        "round": current_round,
    }

    if need_human:
        yield {"type": "transfer", "data": meta}
    else:
        yield {"type": "done", "data": meta}


async def get_session_history(session_id: str) -> dict[str, Any]:
    """获取会话历史消息。"""
    async with _session_maker() as db:
        session_row = await db.get(Session, session_id)
        if session_row is None:
            return {"session_id": session_id, "status": "not_found", "messages": []}

        stmt = (
            select(Message)
            .where(Message.session_id == session_id)
            .order_by(Message.id.asc())
        )
        result = await db.execute(stmt)
        msgs = result.scalars().all()

        return {
            "session_id": session_id,
            "status": session_row.status,
            "round": session_row.round,
            "ticket_id": session_row.ticket_id,
            "messages": [
                {
                    "id": m.id,
                    "role": m.role,
                    "content": m.content,
                    "intent": m.intent,
                    "intent_confidence": m.intent_confidence,
                    "emotion": m.emotion,
                    "emotion_score": m.emotion_score,
                    "timestamp": m.timestamp.isoformat() if m.timestamp else None,
                }
                for m in msgs
            ],
        }
