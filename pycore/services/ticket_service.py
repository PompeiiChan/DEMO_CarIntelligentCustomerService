"""
工单服务层（纯服务，无 FastAPI 依赖）。

提供工单创建、列表查询、详情查询功能。
"""

import datetime as dt
import random

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from pycore.core.settings import get_settings
from pycore.integrations.db.models import Message, Ticket


def _get_engine():  # type: ignore[no-untyped-def]
    settings = get_settings()
    return create_async_engine(
        f"sqlite+aiosqlite:///{settings.database_path}", echo=False
    )


_engine = _get_engine()
_session_maker = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)


# ---------------------------------------------------------------------------
# Ticket ID generator
# ---------------------------------------------------------------------------

def _make_ticket_id() -> str:
    now = dt.datetime.now().strftime("%Y%m%d%H%M%S")
    suffix = str(random.randint(1000, 9999))
    return f"T{now}{suffix}"


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------

PRIORITY_ORDER: dict[str, int] = {"high": 0, "medium": 1, "low": 2}


def _calc_wait_seconds(ticket: Ticket) -> int:
    """pending 状态动态计算等待秒数，其他状态返回 0。"""
    if ticket.status != "pending":
        return 0
    created = ticket.created_at
    if created is None:
        return 0
    # SQLite 存储 naive datetime，补充 UTC tzinfo
    if created.tzinfo is None:
        created = created.replace(tzinfo=dt.UTC)
    now = dt.datetime.now(dt.UTC)
    return max(0, int((now - created).total_seconds()))


def _serialize_ticket(ticket: Ticket) -> dict:
    return {
        "ticket_id": ticket.ticket_id,
        "session_id": ticket.session_id,
        "status": ticket.status,
        "priority": ticket.priority,
        "category": ticket.category,
        "emotion": ticket.emotion,
        "transfer_reason": ticket.transfer_reason,
        "preview": ticket.preview,
        "wait_seconds": _calc_wait_seconds(ticket),
        "round": ticket.round,
        "agent_id": ticket.agent_id,
        "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
        "assigned_at": ticket.assigned_at.isoformat() if ticket.assigned_at else None,
        "completed_at": ticket.completed_at.isoformat() if ticket.completed_at else None,
        "resolved_at": ticket.resolved_at.isoformat() if ticket.resolved_at else None,
    }


# ---------------------------------------------------------------------------
# Service functions
# ---------------------------------------------------------------------------

async def create_ticket(
    session_id: str,
    priority: str,
    category: str,
    emotion: str,
    transfer_reason: str | None,
    preview: str | None,
    round: int,
) -> dict:
    """创建工单，返回序列化字典。"""
    ticket_id = _make_ticket_id()
    async with _session_maker() as db:
        ticket_row = Ticket(
            ticket_id=ticket_id,
            session_id=session_id,
            status="pending",
            priority=priority,
            category=category,
            emotion=emotion,
            transfer_reason=transfer_reason,
            preview=preview,
            round=round,
        )
        db.add(ticket_row)
        await db.commit()
        await db.refresh(ticket_row)
        return _serialize_ticket(ticket_row)


async def list_tickets(
    status: str | None,
    category: str | None,
    emotion: str | None,
    sort: str,
    page: int,
    page_size: int,
) -> dict:
    """分页查询工单列表，返回 {items, total, page, page_size}。"""
    async with _session_maker() as db:
        stmt = select(Ticket)
        if status is not None:
            stmt = stmt.where(Ticket.status == status)
        if category is not None:
            stmt = stmt.where(Ticket.category == category)
        if emotion is not None:
            stmt = stmt.where(Ticket.emotion == emotion)

        result = await db.execute(stmt)
        all_tickets = list(result.scalars().all())
        total = len(all_tickets)

        # Python 层排序
        if sort == "priority_desc":
            all_tickets.sort(key=lambda t: PRIORITY_ORDER.get(t.priority, 1))
        elif sort == "created_asc":
            all_tickets.sort(
                key=lambda t: t.created_at if t.created_at else dt.datetime.min
            )
        else:
            # wait_time_desc: pending 工单等待时长降序，其他工单排后
            all_tickets.sort(key=lambda t: _calc_wait_seconds(t), reverse=True)

        # 分页
        offset = (page - 1) * page_size
        page_items = all_tickets[offset : offset + page_size]

        return {
            "items": [_serialize_ticket(t) for t in page_items],
            "total": total,
            "page": page,
            "page_size": page_size,
        }


async def assign_ticket(ticket_id: str, agent_id: str) -> dict | None:
    """坐席接单：更新 tickets.status = 'processing'，写 agent_id 和 assigned_at。"""
    async with _session_maker() as db:
        ticket = await db.get(Ticket, ticket_id)
        if ticket is None:
            return None
        ticket.status = "processing"
        ticket.agent_id = agent_id
        ticket.assigned_at = dt.datetime.now(dt.UTC)
        await db.commit()
        await db.refresh(ticket)
        return _serialize_ticket(ticket)


async def post_agent_message(ticket_id: str, agent_id: str, content: str) -> dict | None:
    """坐席发消息：写 messages 表（role='agent'），返回 message_id/session_id/timestamp。"""
    async with _session_maker() as db:
        ticket = await db.get(Ticket, ticket_id)
        if ticket is None:
            return None
        session_id = ticket.session_id
        msg = Message(
            session_id=session_id,
            role="agent",
            content=content,
        )
        db.add(msg)
        await db.commit()
        await db.refresh(msg)
        return {
            "message_id": msg.id,
            "session_id": session_id,
            "ticket_id": ticket_id,
            "agent_id": agent_id,
            "content": content,
            "timestamp": msg.timestamp.isoformat() if msg.timestamp else None,
        }


async def resolve_ticket(ticket_id: str) -> dict | None:
    """结束工单：tickets.status → 'completed'，写 completed_at；
    同时清空 session.ticket_id 并恢复 session.status = 'ai_serving'，
    使用户后续仍可触发新一轮转人工。
    """
    async with _session_maker() as db:
        ticket = await db.get(Ticket, ticket_id)
        if ticket is None:
            return None
        ticket.status = "completed"
        ticket.completed_at = dt.datetime.now(dt.UTC)

        from pycore.integrations.db.models import Session as SessionModel  # noqa: PLC0415
        sess = await db.get(SessionModel, ticket.session_id)
        if sess is not None:
            sess.ticket_id = None
            sess.status = "ai_serving"

        await db.commit()
        await db.refresh(ticket)
        return _serialize_ticket(ticket)


async def transfer_ticket_to_ai(ticket_id: str) -> dict | None:
    """转回AI：tickets.status → 'resolved'，sessions.status → 'ai_serving'，写 resolved_at。"""
    async with _session_maker() as db:
        ticket = await db.get(Ticket, ticket_id)
        if ticket is None:
            return None
        session_id = ticket.session_id

        # 更新工单状态
        ticket.status = "resolved"
        ticket.resolved_at = dt.datetime.now(dt.UTC)

        # 更新会话状态：清空 ticket_id 使下次可重新转人工
        from pycore.integrations.db.models import Session as SessionModel  # noqa: PLC0415
        sess = await db.get(SessionModel, session_id)
        if sess is not None:
            sess.ticket_id = None
            sess.status = "ai_serving"

        await db.commit()
        await db.refresh(ticket)
        return {"ticket": _serialize_ticket(ticket), "session_id": session_id}


async def mark_bad_case(ticket_id: str, agent_id: str, note: str | None) -> dict | None:
    """Bad Case 标注：写入 bad_cases 表，返回 marked_at。"""
    from pycore.integrations.db.models import BadCase  # noqa: PLC0415

    async with _session_maker() as db:
        ticket = await db.get(Ticket, ticket_id)
        if ticket is None:
            return None
        marked_at = dt.datetime.now(dt.UTC)
        bad_case_row = BadCase(
            ticket_id=ticket_id,
            agent_id=agent_id,
            note=note,
            marked_at=marked_at,
        )
        db.add(bad_case_row)
        await db.commit()
        await db.refresh(bad_case_row)
        return {
            "ticket_id": ticket_id,
            "agent_id": agent_id,
            "note": note,
            "marked_at": bad_case_row.marked_at.isoformat() if bad_case_row.marked_at else None,
        }


async def get_ticket(ticket_id: str) -> dict | None:
    """获取工单全字段 + 会话历史消息，不存在返回 None。"""
    async with _session_maker() as db:
        ticket = await db.get(Ticket, ticket_id)
        if ticket is None:
            return None

        # 查询对应 session 的所有消息，按 id 升序
        stmt = (
            select(Message)
            .where(Message.session_id == ticket.session_id)
            .order_by(Message.id.asc())
        )
        result = await db.execute(stmt)
        messages = list(result.scalars().all())

        data = _serialize_ticket(ticket)
        data["history"] = [
            {
                "role": m.role,
                "content": m.content,
                "timestamp": m.timestamp.isoformat() if m.timestamp else None,
            }
            for m in messages
        ]
        return data
