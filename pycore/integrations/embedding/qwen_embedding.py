"""
Qwen Embedding 客户端封装（硅基流动 OpenAI 兼容接口）。

- EMBEDDING_API_KEY 缺失时返回 None，调用方负责降级处理
- 批量向量化每批最多 32 个文本，避免超限
- trust_env=False 禁用环境代理
"""

from __future__ import annotations

import logging

import httpx
from openai import AsyncOpenAI

from pycore.core.settings import get_settings

logger = logging.getLogger(__name__)

_BATCH_SIZE = 32


def _get_client() -> AsyncOpenAI | None:
    settings = get_settings()
    if not settings.embedding_api_key:
        return None
    http_client = httpx.AsyncClient(trust_env=False)
    return AsyncOpenAI(
        api_key=settings.embedding_api_key,
        base_url=settings.embedding_base_url,
        timeout=60.0,
        max_retries=0,
        http_client=http_client,
    )


async def embed_texts(texts: list[str]) -> list[list[float]] | None:
    """
    批量向量化文本列表。
    Key 缺失或 API 调用失败时返回 None（调用方应降级处理）。
    """
    client = _get_client()
    if client is None:
        logger.debug("EMBEDDING_API_KEY 未配置，跳过向量化")
        return None

    settings = get_settings()
    all_vectors: list[list[float]] = []

    try:
        for i in range(0, len(texts), _BATCH_SIZE):
            batch = texts[i : i + _BATCH_SIZE]
            response = await client.embeddings.create(
                model=settings.embedding_model,
                input=batch,
            )
            all_vectors.extend(item.embedding for item in response.data)
        return all_vectors
    except Exception as exc:  # noqa: BLE001
        logger.warning("Embedding API 调用失败: %s", exc)
        return None


async def embed_query(text: str) -> list[float] | None:
    """
    向量化单条查询文本。
    Key 缺失或失败时返回 None。
    """
    result = await embed_texts([text])
    if result:
        return result[0]
    return None
