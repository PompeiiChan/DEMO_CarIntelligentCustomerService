"""
工单 API 路由。
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel

from pycore.services import ticket_service

router = APIRouter(prefix="/api/v1/tickets", tags=["tickets"])


class CreateTicketRequest(BaseModel):
    session_id: str
    priority: str = "medium"
    category: str
    emotion: str = "neutral"
    transfer_reason: str | None = None
    preview: str | None = None
    round: int = 0


@router.post("")
async def create_ticket_endpoint(req: CreateTicketRequest) -> dict:
    data = await ticket_service.create_ticket(
        session_id=req.session_id,
        priority=req.priority,
        category=req.category,
        emotion=req.emotion,
        transfer_reason=req.transfer_reason,
        preview=req.preview,
        round=req.round,
    )
    return {"code": 200, "message": "success", "data": data}


@router.get("")
async def get_tickets(
    status: str | None = Query(None),
    category: str | None = Query(None),
    emotion: str | None = Query(None),
    sort: str = Query("wait_time_desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> dict:
    data = await ticket_service.list_tickets(status, category, emotion, sort, page, page_size)
    return {"code": 200, "message": "success", "data": data}


@router.get("/{ticket_id}")
async def get_ticket_endpoint(ticket_id: str) -> dict:
    data = await ticket_service.get_ticket(ticket_id)
    if data is None:
        return {"code": 404, "message": "工单不存在", "data": None}
    return {"code": 200, "message": "success", "data": data}


class AssignRequest(BaseModel):
    agent_id: str


@router.patch("/{ticket_id}/assign")
async def assign_ticket_endpoint(ticket_id: str, req: AssignRequest) -> dict:
    data = await ticket_service.assign_ticket(ticket_id, req.agent_id)
    if data is None:
        return {"code": 404, "message": "工单不存在", "data": None}
    # 延迟导入避免循环依赖
    from app.routers.agent import register_ticket_agent  # noqa: PLC0415
    register_ticket_agent(ticket_id, req.agent_id)
    return {"code": 200, "message": "success", "data": data}


class ResolveRequest(BaseModel):
    agent_id: str = "A001"


@router.patch("/{ticket_id}/resolve")
async def resolve_ticket_endpoint(ticket_id: str, req: ResolveRequest) -> dict:
    data = await ticket_service.resolve_ticket(ticket_id)
    if data is None:
        return {"code": 404, "message": "工单不存在", "data": None}

    import contextlib  # noqa: PLC0415, I001
    from app.routers.chat import _chat_ws  # noqa: PLC0415

    session_id: str = data["session_id"]
    ws = _chat_ws.get(session_id)
    if ws:
        with contextlib.suppress(Exception):
            await ws.send_json({
                "type": "ticket_closed",
                "content": "本次服务已结束，感谢您的耐心等待。如有其他问题，欢迎继续提问。",
            })

    return {"code": 200, "message": "success", "data": data}


class TransferAiRequest(BaseModel):
    agent_id: str = "A001"


@router.patch("/{ticket_id}/transfer-ai")
async def transfer_ai_endpoint(ticket_id: str, req: TransferAiRequest) -> dict:
    result = await ticket_service.transfer_ticket_to_ai(ticket_id)
    if result is None:
        return {"code": 404, "message": "工单不存在", "data": None}

    # 延迟导入，避免循环依赖（与现有 assign 路由保持一致）
    import contextlib  # noqa: PLC0415, I001
    from app.routers.chat import _chat_ws  # noqa: PLC0415

    session_id: str = result["session_id"]
    ws = _chat_ws.get(session_id)
    if ws:
        with contextlib.suppress(Exception):
            await ws.send_json({
                "type": "agent_message",
                "content": "您好，AI 客服已重新为您服务，如有其他问题请继续提问。",
                "agent_id": "system",
                "timestamp": result["ticket"].get("resolved_at"),
            })

    return {"code": 200, "message": "success", "data": result["ticket"]}


class BadCaseRequest(BaseModel):
    agent_id: str
    note: str | None = None


@router.post("/{ticket_id}/bad-case")
async def mark_bad_case_endpoint(ticket_id: str, req: BadCaseRequest) -> dict:
    data = await ticket_service.mark_bad_case(ticket_id, req.agent_id, req.note)
    if data is None:
        return {"code": 404, "message": "工单不存在", "data": None}
    return {"code": 200, "message": "success", "data": data}


class PostMessageRequest(BaseModel):
    agent_id: str
    content: str


@router.post("/{ticket_id}/messages")
async def post_message_endpoint(ticket_id: str, req: PostMessageRequest) -> dict:
    data = await ticket_service.post_agent_message(ticket_id, req.agent_id, req.content)
    if data is None:
        return {"code": 404, "message": "工单不存在", "data": None}
    # 向 C01 客户端推送 agent_message 事件
    session_id: str = data["session_id"]
    import contextlib  # noqa: PLC0415, I001
    from app.routers.chat import _chat_ws  # noqa: PLC0415
    ws = _chat_ws.get(session_id)
    if ws:
        with contextlib.suppress(Exception):
            await ws.send_json({
                "type": "agent_message",
                "content": req.content,
                "agent_id": req.agent_id,
                "timestamp": data["timestamp"],
            })
    return {"code": 200, "message": "success", "data": data}


class SuggestRequest(BaseModel):
    agent_id: str = "A001"


async def _build_ticket_suggestions(ticket_id: str) -> list[str]:
    from pycore.services import suggest_service  # noqa: PLC0415
    return await suggest_service.generate_suggestions(ticket_id)


@router.post("/{ticket_id}/suggest")
async def post_ticket_suggest(ticket_id: str, req: SuggestRequest) -> dict:
    """生成坐席 AI 建议回复（LLM 动态生成）。"""
    suggestions = await _build_ticket_suggestions(ticket_id)
    return {"code": 200, "message": "success", "data": {"suggestions": suggestions}}


@router.get("/{ticket_id}/suggestions")
async def get_ticket_suggestions(ticket_id: str) -> dict:
    """兼容旧路径：获取坐席 AI 建议回复。"""
    suggestions = await _build_ticket_suggestions(ticket_id)
    return {"code": 200, "message": "success", "data": {"suggestions": suggestions}}
