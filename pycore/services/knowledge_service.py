"""
知识库服务层。

提供文档上传、处理 Pipeline、列表查询、删除、进度查询功能。
Pipeline 步骤：
  1. 文档切片（按段落分割）
  2. 向量化（Chroma；不可用时降级关键词索引）
  3. 元数据提取（标题/摘要）
  4. QA 提取（关键词；LLM Key 缺失时降级 Mock）
"""

import asyncio
import datetime as dt
import json
import logging
import re
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from pycore.core.settings import get_settings
from pycore.integrations.db.models import Document
from pycore.integrations.embedding.qwen_embedding import embed_texts

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# DB engine (module-level, reused across calls)
# ---------------------------------------------------------------------------

def _get_engine():  # type: ignore[no-untyped-def]
    settings = get_settings()
    return create_async_engine(
        f"sqlite+aiosqlite:///{settings.database_path}", echo=False
    )


_engine = _get_engine()
_session_maker = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------

def _serialize_doc(doc: Document) -> dict[str, Any]:
    return {
        "doc_id": doc.doc_id,
        "filename": doc.filename,
        "category": doc.category,
        "status": doc.status,
        "chunk_count": doc.chunk_count,
        "qa_count": doc.qa_count,
        "file_size": doc.file_size,
        "error_msg": doc.error_msg,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
        "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
    }


def _serialize_status(doc: Document) -> dict[str, Any]:
    """返回进度查询响应体的 data 部分。"""
    steps_raw: list[dict[str, Any]] = []
    if doc.pipeline_steps:
        try:
            steps_raw = json.loads(doc.pipeline_steps)
        except Exception:  # noqa: BLE001
            steps_raw = []

    # 根据 steps 计算 progress_pct
    done_count = sum(1 for s in steps_raw if s.get("status") == "done")
    progress_pct = int(done_count / 4 * 100) if steps_raw else 0

    return {
        "doc_id": doc.doc_id,
        "status": doc.status,
        "progress_pct": progress_pct,
        "steps": steps_raw,
    }


# ---------------------------------------------------------------------------
# Pipeline helpers
# ---------------------------------------------------------------------------

_FRONT_MATTER_RE = re.compile(r"^---\n.*?\n---\n?", re.DOTALL)


def _strip_front_matter(content: str) -> str:
    """剥离 YAML front matter（---...---），返回剩余正文。"""
    return _FRONT_MATTER_RE.sub("", content, count=1).lstrip("\n")


def _is_table_row(line: str) -> bool:
    s = line.strip()
    return s.startswith("|") and s.endswith("|") and len(s) > 2


def _is_separator_row(line: str) -> bool:
    if not _is_table_row(line):
        return False
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    return bool(cells) and all(re.match(r"^[-: ]+$", c) for c in cells if c)


def _split_table_chunk(chunk: str) -> list[str]:
    """
    将含 Markdown 表格的大块按数据行切分。
    每个子块 = 表格前非表格前缀（如标题）+ 表头行 + 分隔行 + 单条数据行。
    """
    lines = chunk.split("\n")

    table_start = next((i for i, l in enumerate(lines) if _is_table_row(l)), -1)
    if table_start == -1:
        return [chunk]

    sep_idx = next(
        (i for i in range(table_start, len(lines)) if _is_separator_row(lines[i])), -1
    )
    if sep_idx == -1:
        return [chunk]

    prefix = "\n".join(lines[:table_start]).strip()
    header = "\n".join(lines[table_start : sep_idx + 1])
    data_rows = [
        l for l in lines[sep_idx + 1:]
        if _is_table_row(l) and not _is_separator_row(l)
    ]

    if not data_rows:
        return [chunk]

    results = []
    for row in data_rows:
        parts: list[str] = []
        if prefix:
            parts.append(prefix)
        parts.append(header)
        parts.append(row)
        results.append("\n".join(parts))
    return results


def _split_chunks(content: str) -> list[str]:
    """
    Markdown-aware 分块器：
    1. 剥离 YAML front matter（不进索引）
    2. 按 \\n\\n 分段
    3. 孤立标题行（无换行且 < 60 字）合并到下一段
    4. 大段落（> 600 字）含 Markdown 表格时按行切分，每行保留表头前缀
    5. 过滤 < 10 字的噪声段落
    """
    text = _strip_front_matter(content)
    raw_parts = [p.strip() for p in text.split("\n\n") if p.strip()]

    # 合并孤立标题到下一段
    merged: list[str] = []
    i = 0
    while i < len(raw_parts):
        part = raw_parts[i]
        is_heading_only = (
            bool(re.match(r"^#{1,6}\s+\S", part))
            and "\n" not in part
            and len(part) < 60
        )
        if is_heading_only and i + 1 < len(raw_parts):
            merged.append(part + "\n\n" + raw_parts[i + 1])
            i += 2
        else:
            merged.append(part)
            i += 1

    # 数据行 >= 4 行的表格按行切分（小表格和 key-value 表保持整体）
    final: list[str] = []
    for part in merged:
        part_lines = part.split("\n")
        data_row_count = sum(
            1 for l in part_lines
            if _is_table_row(l) and not _is_separator_row(l)
        )
        if data_row_count >= 4:
            final.extend(_split_table_chunk(part))
        else:
            final.append(part)

    result = [c for c in final if len(c.strip()) >= 10]
    return result or [content[:200]]


def _extract_metadata(content: str) -> dict[str, str]:
    """从 Markdown 提取标题和摘要（先剥离 front matter）。"""
    title = ""
    summary = ""
    text = _strip_front_matter(content)
    for line in text.splitlines():
        stripped = line.strip()
        if not title and stripped.startswith("#"):
            title = stripped.lstrip("#").strip()
        elif title and not summary and stripped and not stripped.startswith("#"):
            summary = stripped[:200]
        if title and summary:
            break
    return {"title": title or "未知标题", "summary": summary or ""}


def _extract_qa_mock(content: str, chunk_count: int) -> list[dict[str, str]]:
    """
    简单关键词抽取生成 QA 对（LLM 不可用时的降级）。
    从文档标题和首段生成伪 QA 条目。
    """
    meta = _extract_metadata(content)
    title = meta["title"]
    summary = meta["summary"]
    qa_list = []
    if title and title != "未知标题":
        qa_list.append({
            "question": f"关于{title}有哪些重要信息？",
            "answer": summary[:100] if summary else "请参阅完整文档。",
        })
    # 每 10 片段生成 1 个额外 QA，最多 10 个
    extra = min(max(1, chunk_count // 10), 10)
    for i in range(extra):
        qa_list.append({
            "question": f"第 {i + 1} 个常见问题",
            "answer": f"相关信息已从文档提取，共 {chunk_count} 个片段。",
        })
    return qa_list


async def _try_chroma_index(
    chunks: list[str],
    doc_id: str,
    persist_dir: str,
) -> tuple[bool, bool]:
    """
    尝试将 chunks 写入 Chroma。
    先调 Qwen Embedding API 获取向量；Key 缺失或 API 失败时跳过 Chroma（降级 BM25-only）。
    返回 (chroma_success, used_qwen_embedding)。
    """
    vectors = await embed_texts(chunks)
    if vectors is None:
        logger.info("Embedding 不可用，doc %s 跳过 Chroma 入库，仅建 BM25 索引", doc_id)
        return False, False

    try:
        import chromadb
        client = chromadb.PersistentClient(path=persist_dir)
        collection = client.get_or_create_collection(name="knowledge")
        ids = [f"{doc_id}_chunk_{i}" for i in range(len(chunks))]
        try:
            collection.add(documents=chunks, embeddings=vectors, ids=ids)
        except Exception as inner_exc:  # noqa: BLE001
            # 维度不匹配时（旧 collection 使用了不同维度的 embedding）删除并重建
            if "dimension" in str(inner_exc).lower():
                logger.warning(
                    "Chroma 维度不匹配，删除旧 collection 并重建: %s", inner_exc
                )
                client.delete_collection("knowledge")
                collection = client.create_collection("knowledge")
                collection.add(documents=chunks, embeddings=vectors, ids=ids)
            else:
                raise
        return True, True
    except Exception as exc:  # noqa: BLE001
        logger.warning("Chroma 入库失败，doc %s 降级仅 BM25: %s", doc_id, exc)
        return False, False


def _bm25_store_path(persist_dir: str) -> Path:
    return Path(persist_dir) / "bm25_store.json"


def _load_bm25_store(persist_dir: str) -> list[dict[str, str]]:
    """加载 BM25 存储文件，不存在时返回空列表。"""
    path = _bm25_store_path(persist_dir)
    if not path.exists():
        return []
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)  # type: ignore[no-any-return]
    except Exception:  # noqa: BLE001
        return []


def _save_bm25_store(persist_dir: str, store: list[dict[str, str]]) -> None:
    """保存 BM25 存储文件，失败时静默。"""
    path = _bm25_store_path(persist_dir)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(store, f, ensure_ascii=False)
    except Exception as exc:  # noqa: BLE001
        logger.warning("BM25 store 写入失败: %s", exc)


def _update_bm25_store(chunks: list[str], doc_id: str, persist_dir: str) -> None:
    """追加文档 chunks 到 BM25 存储文件。"""
    store = _load_bm25_store(persist_dir)
    for i, text in enumerate(chunks):
        store.append({"chunk_id": f"{doc_id}_chunk_{i}", "doc_id": doc_id, "text": text})
    _save_bm25_store(persist_dir, store)


def _remove_from_bm25_store(doc_id: str, persist_dir: str) -> None:
    """从 BM25 存储文件中移除指定文档的所有 chunk。"""
    store = _load_bm25_store(persist_dir)
    store = [entry for entry in store if entry.get("doc_id") != doc_id]
    _save_bm25_store(persist_dir, store)


async def _delete_from_chroma(doc_id: str, persist_dir: str) -> None:
    """从 Chroma 和 BM25 存储中删除文档，失败时静默。"""
    try:
        import chromadb
        client = chromadb.PersistentClient(path=persist_dir)
        collection = client.get_or_create_collection(name="knowledge")
        all_ids: list[str] = collection.get()["ids"]  # type: ignore[assignment]
        to_delete = [i for i in all_ids if i.startswith(f"{doc_id}_chunk_")]
        if to_delete:
            collection.delete(ids=to_delete)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Chroma 删除失败（静默）: %s", exc)

    _remove_from_bm25_store(doc_id, persist_dir)


def _make_initial_steps() -> list[dict[str, Any]]:
    return [
        {"step": 1, "name": "文档切片", "status": "waiting", "detail": None},
        {"step": 2, "name": "向量化入库", "status": "waiting", "detail": None},
        {"step": 3, "name": "元数据提取", "status": "waiting", "detail": None},
        {"step": 4, "name": "QA自动提取", "status": "waiting", "detail": None},
    ]


async def _run_pipeline(doc_id: str, content: str) -> None:
    """
    后台异步 4 步 Pipeline，写入 documents 表 pipeline_steps / status / chunk_count / qa_count。
    每一步都在操作前将本步 status 置为 running，完成后置为 done。
    任何异常均捕获，将文档 status 置为 failed。
    """
    settings = get_settings()

    async def _update_steps(
        steps: list[dict[str, Any]],
        doc_status: str = "processing",
        chunk_count: int | None = None,
        qa_count: int | None = None,
        error_msg: str | None = None,
    ) -> None:
        async with _session_maker() as db:
            result = await db.execute(select(Document).where(Document.doc_id == doc_id))
            doc = result.scalar_one_or_none()
            if doc is None:
                return
            doc.pipeline_steps = json.dumps(steps, ensure_ascii=False)
            doc.status = doc_status
            if chunk_count is not None:
                doc.chunk_count = chunk_count
            if qa_count is not None:
                doc.qa_count = qa_count
            if error_msg is not None:
                doc.error_msg = error_msg
            await db.commit()

    steps = _make_initial_steps()

    try:
        # Step 1: 文档切片
        steps[0]["status"] = "running"
        await _update_steps(steps)
        await asyncio.sleep(0.3)
        chunks = _split_chunks(content)
        steps[0]["status"] = "done"
        steps[0]["detail"] = f"{len(chunks)} 片段"
        await _update_steps(steps, chunk_count=len(chunks))

        # Step 2: 向量化入库（Chroma + BM25）
        steps[1]["status"] = "running"
        await _update_steps(steps)
        await asyncio.sleep(0.5)
        chroma_ok, used_qwen = await _try_chroma_index(chunks, doc_id, settings.chroma_persist_dir)
        _update_bm25_store(chunks, doc_id, settings.chroma_persist_dir)
        steps[1]["status"] = "done"
        if chroma_ok and used_qwen:
            steps[1]["detail"] = "Qwen 向量已入库 + BM25 索引"
        elif chroma_ok:
            steps[1]["detail"] = "Chroma 默认向量已入库 + BM25 索引"
        else:
            steps[1]["detail"] = "降级：仅 BM25 索引（Embedding Key 缺失）"
        await _update_steps(steps)

        # Step 3: 元数据提取
        steps[2]["status"] = "running"
        await _update_steps(steps)
        await asyncio.sleep(0.2)
        meta = _extract_metadata(content)
        steps[2]["status"] = "done"
        steps[2]["detail"] = f"标题：{meta['title'][:30]}"
        await _update_steps(steps)

        # Step 4: QA 提取
        steps[3]["status"] = "running"
        await _update_steps(steps)
        await asyncio.sleep(0.2)
        qa_list = _extract_qa_mock(content, len(chunks))
        steps[3]["status"] = "done"
        steps[3]["detail"] = f"{len(qa_list)} 条 QA"
        await _update_steps(
            steps,
            doc_status="indexed",
            qa_count=len(qa_list),
        )

    except Exception as exc:  # noqa: BLE001
        logger.error("Pipeline 处理失败 doc_id=%s: %s", doc_id, exc)
        for s in steps:
            if s["status"] == "running":
                s["status"] = "failed"
                s["detail"] = str(exc)[:100]
        await _update_steps(steps, doc_status="failed", error_msg=str(exc)[:200])


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------

async def upload_document(
    filename: str,
    category: str,
    content: str,
    file_size: int,
) -> dict[str, Any]:
    """
    写入 documents 表（status=processing），触发后台 Pipeline。
    返回上传响应 DTO（doc_id/filename/category/status/file_size）。
    """
    settings = get_settings()
    doc_id = f"doc-{uuid.uuid4().hex[:12]}"

    # 确保上传目录存在
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)

    # 保存原始文件
    upload_path = Path(settings.upload_dir) / f"{doc_id}.md"
    upload_path.write_text(content, encoding="utf-8")

    initial_steps = _make_initial_steps()

    async with _session_maker() as db:
        doc = Document(
            doc_id=doc_id,
            filename=filename,
            category=category,
            status="processing",
            file_size=file_size,
            chunk_count=0,
            qa_count=0,
        )
        doc.pipeline_steps = json.dumps(initial_steps, ensure_ascii=False)
        db.add(doc)
        await db.commit()
        await db.refresh(doc)

    # 后台异步 Pipeline（不 await，不阻塞上传响应）
    asyncio.ensure_future(_run_pipeline(doc_id, content))

    return {
        "doc_id": doc_id,
        "filename": filename,
        "category": category,
        "status": "processing",
        "file_size": file_size,
    }


async def list_documents(
    category: str | None,
    q: str | None,
    sort: str,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    """分页查询文档列表。"""
    async with _session_maker() as db:
        stmt = select(Document)
        if category:
            stmt = stmt.where(Document.category == category)
        if q:
            stmt = stmt.where(Document.filename.contains(q))

        result = await db.execute(stmt)
        all_docs = list(result.scalars().all())
        total = len(all_docs)

        # Python 层排序
        if sort == "name_asc":
            all_docs.sort(key=lambda d: d.filename)
        elif sort == "category_asc":
            all_docs.sort(key=lambda d: d.category)
        else:  # created_desc (default)
            all_docs.sort(
                key=lambda d: d.created_at or dt.datetime.min,
                reverse=True,
            )

        offset = (page - 1) * page_size
        page_docs = all_docs[offset: offset + page_size]

        return {
            "items": [_serialize_doc(d) for d in page_docs],
            "total": total,
            "page": page,
            "page_size": page_size,
        }


async def delete_document(doc_id: str) -> dict[str, Any] | None:
    """删除文档记录及 Chroma 向量数据，不存在时返回 None。"""
    settings = get_settings()
    async with _session_maker() as db:
        result = await db.execute(select(Document).where(Document.doc_id == doc_id))
        doc = result.scalar_one_or_none()
        if doc is None:
            return None
        await db.delete(doc)
        await db.commit()

    # 清理 Chroma（失败静默）
    await _delete_from_chroma(doc_id, settings.chroma_persist_dir)

    # 清理上传文件（失败静默）
    try:
        upload_path = Path(settings.upload_dir) / f"{doc_id}.md"
        if upload_path.exists():
            upload_path.unlink()
    except Exception:  # noqa: BLE001
        pass

    return {"doc_id": doc_id}


async def get_document_status(doc_id: str) -> dict[str, Any] | None:
    """查询单文档处理进度，不存在时返回 None。"""
    async with _session_maker() as db:
        result = await db.execute(select(Document).where(Document.doc_id == doc_id))
        doc = result.scalar_one_or_none()
        if doc is None:
            return None
        return _serialize_status(doc)
