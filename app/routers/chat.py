"""
Chat 路由：HTTP 版、WebSocket 流式版、会话历史查询。
"""


from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from pycore.services.chat_service import (
    get_session_history,
    process_message,
    stream_reply,
)

# HTTP router
router = APIRouter(prefix="/api/v1/chat", tags=["chat"])

# WebSocket router（单独注册，prefix 为空以支持 /ws/... 路径）
ws_router = APIRouter(tags=["chat-ws"])

# 全局 WebSocket 连接注册表，session_id -> WebSocket
_chat_ws: dict[str, WebSocket] = {}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ChatRequest(BaseModel):
    session_id: str
    message: str


class ChatResponse(BaseModel):
    reply: str
    session_id: str
    intent: str
    intent_confidence: float
    emotion: str
    emotion_score: float
    need_human: bool
    ticket_id: str | None = None
    transfer_reason: str | None = None
    queue_position: int | None = None
    round: int


# ---------------------------------------------------------------------------
# HTTP 版
# ---------------------------------------------------------------------------


@router.post("/message", response_model=ChatResponse)
async def chat_message(req: ChatRequest) -> ChatResponse:
    """HTTP 版对话接口，同步返回完整结果。"""
    result = await process_message(req.session_id, req.message)
    return ChatResponse(**result)


# ---------------------------------------------------------------------------
# 会话历史
# ---------------------------------------------------------------------------


@router.get("/session/{session_id}")
async def get_session(session_id: str) -> dict:
    """获取会话历史消息。"""
    return await get_session_history(session_id)


# ---------------------------------------------------------------------------
# WebSocket 流式版
# ---------------------------------------------------------------------------


@ws_router.websocket("/ws/chat/{session_id}")
async def chat_websocket(websocket: WebSocket, session_id: str) -> None:
    """
    WebSocket 流式对话。

    客户端发送：{"message": "用户消息"}
    服务端推送：
        {"type": "delta", "content": "..."} — 逐字流式
        {"type": "done", "data": {...}}      — 完整元数据
        {"type": "transfer", "data": {...}}  — 转人工
        {"type": "error", "message": "..."}  — 错误
    """
    await websocket.accept()
    _chat_ws[session_id] = websocket

    try:
        while True:
            raw = await websocket.receive_text()

            try:
                import json

                payload = json.loads(raw)
                user_msg = payload.get("message", "").strip()
            except Exception:
                await websocket.send_json(
                    {"type": "error", "message": "消息格式错误，请发送 JSON"}
                )
                continue

            if not user_msg:
                await websocket.send_json(
                    {"type": "error", "message": "消息内容不能为空"}
                )
                continue

            try:
                ticket_id_for_push: str | None = None
                async for event in stream_reply(session_id, user_msg):
                    await websocket.send_json(event)
                    # 记录 ticket_id（来自 done 或 transfer 事件的元数据）
                    if event.get("type") in ("done", "transfer"):
                        ticket_id_for_push = event.get("data", {}).get("ticket_id")

                # 如果本轮没有新 ticket_id，尝试从会话历史获取
                if not ticket_id_for_push:
                    try:
                        session_info = await get_session_history(session_id)
                        ticket_id_for_push = session_info.get("ticket_id")
                    except Exception:
                        pass

                # 推送用户消息给负责该工单的坐席（如已接单）
                if ticket_id_for_push:
                    from app.routers.agent import push_user_message_to_agents  # noqa: PLC0415
                    await push_user_message_to_agents(ticket_id_for_push, user_msg, session_id)
            except Exception as exc:
                await websocket.send_json(
                    {"type": "error", "message": f"服务异常：{str(exc)}"}
                )

    except WebSocketDisconnect:
        pass
    finally:
        # 只在字典里还是本 WS 实例时才移除，避免 React StrictMode 双挂载时
        # 第一个 WS 关闭把第二个正在用的连接意外删掉。
        if _chat_ws.get(session_id) is websocket:
            _chat_ws.pop(session_id, None)
