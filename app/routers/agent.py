"""
坐席端 WebSocket 路由。

/ws/agent/{agent_id} — 坐席实时通道。
连接后推送当前所有 pending 工单；有新工单/用户消息时推送事件。
"""

import contextlib
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from pycore.core.settings import get_settings
from pycore.integrations.db.models import Ticket

settings = get_settings()

ws_router = APIRouter(tags=["agent-ws"])

# 全局代理 WS 注册表，agent_id -> WebSocket
_agent_ws: dict[str, WebSocket] = {}

# 供 chat 路由调用：转发用户消息给坐席
_ticket_to_agent: dict[str, str] = {}  # ticket_id -> agent_id


def _get_engine() -> "AsyncEngine":
    return create_async_engine(
        f"sqlite+aiosqlite:///{settings.database_path}", echo=False
    )


_engine = _get_engine()
_session_maker = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)


async def push_to_agent(agent_id: str, event: dict) -> None:
    """向指定坐席推送事件（供其他路由调用）。"""
    ws = _agent_ws.get(agent_id)
    if ws:
        with contextlib.suppress(Exception):
            await ws.send_json(event)


async def push_user_message_to_agents(ticket_id: str, content: str, session_id: str) -> None:
    """将用户新消息推送给负责该工单的坐席（供 chat 路由调用）。"""
    agent_id = _ticket_to_agent.get(ticket_id)
    if agent_id:
        await push_to_agent(agent_id, {
            "type": "user_message",
            "ticket_id": ticket_id,
            "session_id": session_id,
            "content": content,
        })


def register_ticket_agent(ticket_id: str, agent_id: str) -> None:
    """坐席接单时注册工单→坐席映射。"""
    _ticket_to_agent[ticket_id] = agent_id


def unregister_ticket_agent(ticket_id: str) -> None:
    """工单结束时清理映射。"""
    _ticket_to_agent.pop(ticket_id, None)


@ws_router.websocket("/ws/agent/{agent_id}")
async def agent_websocket(websocket: WebSocket, agent_id: str) -> None:
    """
    坐席实时通道。

    连接后立即推送所有 pending 工单。
    服务端推送事件：
        {"type": "pending_tickets", "tickets": [...]}  — 初始化全量
        {"type": "new_ticket", "ticket": {...}}         — 新工单到达
        {"type": "user_message", "ticket_id": "...", "content": "..."}  — 用户发新消息
    """
    await websocket.accept()
    _agent_ws[agent_id] = websocket

    def _serialize(t: Ticket) -> dict:
        return {
            "ticket_id": t.ticket_id,
            "session_id": t.session_id,
            "status": t.status,
            "priority": t.priority,
            "category": t.category,
            "emotion": t.emotion,
            "transfer_reason": t.transfer_reason,
            "preview": t.preview,
            "wait_seconds": t.wait_seconds,
            "round": t.round,
            "agent_id": t.agent_id,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }

    try:
        # 推送当前所有 pending + processing 工单（按转入时间升序）
        async with _session_maker() as db:
            stmt = (
                select(Ticket)
                .where(Ticket.status.in_(["pending", "processing"]))
                .order_by(Ticket.created_at.asc())
            )
            result = await db.execute(stmt)
            all_tickets = result.scalars().all()

        await websocket.send_json({
            "type": "pending_tickets",
            "tickets": [_serialize(t) for t in all_tickets],
        })

        # 保持连接，处理心跳/ping
        while True:
            try:
                raw = await websocket.receive_text()
                payload = json.loads(raw)
                if payload.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except Exception:
                break

    except WebSocketDisconnect:
        pass
    finally:
        if _agent_ws.get(agent_id) is websocket:
            _agent_ws.pop(agent_id, None)
