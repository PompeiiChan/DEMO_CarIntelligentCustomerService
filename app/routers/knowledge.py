"""
知识库管理 API 路由。
"""

from fastapi import APIRouter, Form, HTTPException, Query, UploadFile

from pycore.services import knowledge_service

router = APIRouter(prefix="/api/v1/knowledge", tags=["knowledge"])

_MAX_SIZE = 10 * 1024 * 1024  # 10 MB


@router.get("/documents")
async def list_documents(
    category: str | None = Query(None),
    q: str | None = Query(None),
    sort: str = Query("created_desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> dict:
    data = await knowledge_service.list_documents(category, q, sort, page, page_size)
    return {"code": 200, "message": "success", "data": data}


@router.post("/documents")
async def upload_document(
    file: UploadFile,
    category: str = Form(...),
) -> dict:
    # 仅允许 .md 文件
    filename = file.filename or "unknown.md"
    if not filename.endswith(".md"):
        raise HTTPException(status_code=400, detail="仅支持 .md 格式文件")

    raw = await file.read()
    if len(raw) > _MAX_SIZE:
        raise HTTPException(status_code=400, detail="文件大小不能超过 10MB")

    content = raw.decode("utf-8", errors="replace")
    data = await knowledge_service.upload_document(
        filename=filename,
        category=category,
        content=content,
        file_size=len(raw),
    )
    return {"code": 200, "message": "上传成功，正在处理", "data": data}


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str) -> dict:
    result = await knowledge_service.delete_document(doc_id)
    if result is None:
        return {"code": 404, "message": "文档不存在", "data": None}
    return {"code": 200, "message": "删除成功", "data": result}


@router.get("/documents/{doc_id}/status")
async def get_document_status(doc_id: str) -> dict:
    result = await knowledge_service.get_document_status(doc_id)
    if result is None:
        return {"code": 404, "message": "文档不存在", "data": None}
    return {"code": 200, "message": "success", "data": result}
