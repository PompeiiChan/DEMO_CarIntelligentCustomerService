"""
坐席 AI 建议回复动态生成服务。

根据工单对话历史 + 知识库检索，调 LLM 生成 3 条建议回复。
"""

import json
import logging

from pycore.integrations.llm.base import Message as LLMMessage
from pycore.integrations.llm.qwen_provider import get_llm_client
from pycore.services import retrieval_service, ticket_service

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
    "你是汽车客服坐席助手，帮助坐席快速回复用户。"
    "根据对话历史和知识库参考，生成 3 条简洁、专业的建议回复。"
    "每条不超过 80 字，只输出 JSON 数组，格式：[\"建议1\",\"建议2\",\"建议3\"]，不要其他文字。"
)

_ROLE_LABEL: dict[str, str] = {
    "user": "用户",
    "ai": "坐席",
    "agent": "坐席",
    "assistant": "坐席",
}


async def generate_suggestions(ticket_id: str, top_k: int = 3) -> list[str]:
    """根据工单历史动态生成 top_k 条坐席建议回复。

    工单不存在 / Key 缺失 / 超时 / 解析失败均返回空列表，不抛异常。
    """
    # 1. 获取工单
    ticket = await ticket_service.get_ticket(ticket_id)
    if ticket is None:
        return []

    # 2. 取最近 6 条非 system 消息（时间升序）
    history: list[dict] = ticket.get("history") or []
    non_system = [m for m in history if m.get("role") != "system"]
    recent = non_system[-6:]

    # 提取最后一条 role=user 的 content
    user_msg = ""
    for m in reversed(recent):
        if m.get("role") == "user":
            user_msg = m.get("content", "").strip()
            break

    if not user_msg:
        return []

    # 3. RAG 检索（失败时跳过）
    ref_text = ""
    try:
        chunks = await retrieval_service.retrieve(user_msg, intent="", top_k=3)
        parts = [c.get("content", "")[:300] for c in chunks if c.get("content")]
        if parts:
            ref_text = "\n".join(parts)
    except Exception as exc:  # noqa: BLE001
        logger.warning("suggest_service: retrieve 失败，跳过知识库参考: %s", exc)

    # 4. 拼 User Prompt
    history_lines = "\n".join(
        f"{_ROLE_LABEL.get(m.get('role', ''), '用户')}：{m.get('content', '')}"
        for m in recent
    )
    user_prompt_parts = [f"【对话历史】\n{history_lines}"]
    if ref_text:
        user_prompt_parts.append(f"【知识库参考】\n{ref_text}")
    user_prompt_parts.append("请生成 3 条建议回复，JSON 数组格式输出。")
    user_prompt = "\n".join(user_prompt_parts)

    # 5. 调 LLM
    try:
        llm = get_llm_client()
        messages = [
            LLMMessage.system(_SYSTEM_PROMPT),
            LLMMessage.user(user_prompt),
        ]
        resp = await llm.chat(messages)
        content = (resp.content or "").strip()
    except Exception as exc:  # noqa: BLE001
        logger.warning("suggest_service: LLM 调用失败: %s", exc)
        return []

    # 6. 提取第一个 [...] JSON 数组
    start = content.find("[")
    end = content.rfind("]")
    if start == -1 or end == -1 or end <= start:
        logger.warning("suggest_service: 未找到 JSON 数组，原始内容: %.200s", content)
        return []

    try:
        suggestions = json.loads(content[start : end + 1])
        if isinstance(suggestions, list):
            return [str(s) for s in suggestions[:top_k]]
    except json.JSONDecodeError as exc:
        logger.warning("suggest_service: JSON 解析失败: %s，原始: %.200s", exc, content)

    return []
