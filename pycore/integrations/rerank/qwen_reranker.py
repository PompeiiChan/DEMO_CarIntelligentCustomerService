"""
Qwen Reranker 客户端封装（硅基流动 /rerank 接口）。

接口不兼容 OpenAI，使用 httpx 直接调用。
- RERANK_API_KEY 缺失时返回原始顺序（0-based index, score=0.0）
- API 调用失败时同样返回原始顺序，不抛异常
- trust_env=False 禁用环境代理
"""

from __future__ import annotations

import logging

import httpx

from pycore.core.settings import get_settings

logger = logging.getLogger(__name__)


async def rerank(
    query: str,
    documents: list[str],
    top_n: int | None = None,
) -> list[tuple[int, float]]:
    """
    精排文档列表，返回 [(原始索引, 相关性得分), ...] 按得分降序。

    API 不可用时返回原始顺序（score=0.0），调用方按原顺序截取 top_n。
    """
    if not documents:
        return []

    settings = get_settings()
    effective_top_n = top_n if top_n is not None else settings.rerank_top_n

    if not settings.rerank_api_key:
        logger.debug("RERANK_API_KEY 未配置，跳过精排")
        return [(i, 0.0) for i in range(min(len(documents), effective_top_n))]

    try:
        async with httpx.AsyncClient(trust_env=False, timeout=30.0) as client:
            resp = await client.post(
                f"{settings.rerank_base_url}/rerank",
                headers={
                    "Authorization": f"Bearer {settings.rerank_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.rerank_model,
                    "query": query,
                    "documents": documents,
                    "top_n": effective_top_n,
                    "return_documents": False,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            results: list[dict] = data.get("results", [])
            return [
                (int(r["index"]), float(r["relevance_score"]))
                for r in results
            ]
    except Exception as exc:  # noqa: BLE001
        logger.warning("Reranker API 调用失败，使用原始顺序: %s", exc)
        return [(i, 0.0) for i in range(min(len(documents), effective_top_n))]
