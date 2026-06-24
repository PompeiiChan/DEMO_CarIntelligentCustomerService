"""
RAG 混合检索服务（生产级）。

Pipeline：
  1. Qwen Embedding 向量化查询 → Chroma 召回 top-30
  2. BM25（字符级分词）→ 召回 top-30
  3. 历史 QA bigram 匹配（qa_pairs.json）→ top-10
  4. 结构化数据关键词匹配（cars.json）
  5. RRF 融合（k=60）→ 候选 top-20
  6. Qwen Reranker 精排 → top-5 拼入 Prompt

各路降级策略（均不抛异常）：
  - Embedding 不可用 → 跳过 Chroma 向量召回
  - BM25 store 为空 → 跳过 BM25
  - Reranker 不可用 → 直接用 RRF top-5
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from pycore.core.settings import get_settings
from pycore.integrations.embedding.qwen_embedding import embed_query
from pycore.integrations.rerank.qwen_reranker import rerank

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

Chunk = dict[str, Any]  # {"source": str, "content": str, "score": float}

# ---------------------------------------------------------------------------
# Data loading helpers (QA + Structured)
# ---------------------------------------------------------------------------

_QA_CACHE: list[dict[str, Any]] | None = None
_CARS_CACHE: list[dict[str, Any]] | None = None


def _load_qa() -> list[dict[str, Any]]:
    global _QA_CACHE
    if _QA_CACHE is None:
        qa_path = Path(__file__).parent.parent / "data" / "mock" / "qa_pairs.json"
        try:
            with open(qa_path, encoding="utf-8") as f:
                _QA_CACHE = json.load(f)
        except Exception:  # noqa: BLE001
            _QA_CACHE = []
    return _QA_CACHE


def _load_cars() -> list[dict[str, Any]]:
    global _CARS_CACHE
    if _CARS_CACHE is None:
        cars_path = Path(__file__).parent.parent / "data" / "mock" / "cars.json"
        try:
            with open(cars_path, encoding="utf-8") as f:
                _CARS_CACHE = json.load(f)
        except Exception:  # noqa: BLE001
            _CARS_CACHE = []
    return _CARS_CACHE


# ---------------------------------------------------------------------------
# BM25 index (lazy-loaded, rebuilt when store file changes)
# ---------------------------------------------------------------------------

_bm25_cache: Any = None  # BM25Okapi instance
_bm25_store_cache: list[dict[str, str]] = []


def _tokenize(text: str) -> list[str]:
    """字符级分词，适用于中文文本。"""
    return list(text)


def _get_bm25(persist_dir: str) -> tuple[Any, list[dict[str, str]]]:
    """
    加载或重建 BM25 索引。
    返回 (BM25Okapi | None, store_entries)。
    """
    global _bm25_cache, _bm25_store_cache

    store_path = Path(persist_dir) / "bm25_store.json"
    if not store_path.exists():
        return None, []

    try:
        with open(store_path, encoding="utf-8") as f:
            store: list[dict[str, str]] = json.load(f)
    except Exception:  # noqa: BLE001
        return None, []

    if not store:
        return None, []

    # Rebuild if store changed
    if store != _bm25_store_cache:
        try:
            from rank_bm25 import BM25Plus
            corpus = [_tokenize(entry["text"]) for entry in store]
            _bm25_cache = BM25Plus(corpus)
            _bm25_store_cache = store
        except Exception as exc:  # noqa: BLE001
            logger.warning("BM25 索引构建失败: %s", exc)
            return None, []

    return _bm25_cache, _bm25_store_cache


# ---------------------------------------------------------------------------
# Source 1: Chroma 向量检索
# ---------------------------------------------------------------------------

async def _chroma_retrieve(
    user_msg: str,
    query_vector: list[float] | None,
    persist_dir: str,
    n_results: int = 30,
) -> list[Chunk]:
    """Chroma 向量检索，Qwen 向量不可用时跳过（不回退 default embedding）。"""
    if query_vector is None:
        return []

    try:
        import chromadb

        client = chromadb.PersistentClient(path=persist_dir)
        try:
            collection = client.get_collection(name="knowledge")
        except Exception:  # noqa: BLE001
            return []

        count = collection.count()
        if count == 0:
            return []

        n = min(n_results, count)
        result = collection.query(query_embeddings=[query_vector], n_results=n)  # type: ignore[arg-type]

        docs_raw: list[list[str]] = result.get("documents") or []
        dists_raw: list[list[float]] = result.get("distances") or []
        docs: list[str] = docs_raw[0] if docs_raw else []
        dists: list[float] = dists_raw[0] if dists_raw else []

        return [
            {"source": "knowledge_vec", "content": doc, "score": 1.0 / (1.0 + dist)}
            for doc, dist in zip(docs, dists, strict=False)
            if doc
        ]
    except Exception as exc:  # noqa: BLE001
        logger.debug("Chroma 向量检索降级: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Source 2: BM25 检索
# ---------------------------------------------------------------------------

def _bm25_retrieve(user_msg: str, persist_dir: str, top_k: int = 30) -> list[Chunk]:
    """BM25 关键词检索（字符级分词）。"""
    bm25, store = _get_bm25(persist_dir)
    if bm25 is None or not store:
        return []

    try:
        query_tokens = _tokenize(user_msg)
        scores: list[float] = bm25.get_scores(query_tokens).tolist()
        indexed = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)[:top_k]
        return [
            {"source": "knowledge_bm25", "content": store[i]["text"], "score": score}
            for i, score in indexed
            if score > 0.0
        ]
    except Exception as exc:  # noqa: BLE001
        logger.warning("BM25 检索失败: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Source 3: 历史 QA bigram 检索
# ---------------------------------------------------------------------------

def _ngrams(text: str, n: int) -> set[str]:
    return {text[i : i + n] for i in range(len(text) - n + 1)}


_INTENT_TO_QA_CATS: dict[str, list[str]] = {
    "价格咨询": ["价格咨询"],
    "车型推荐": ["车型咨询", "价格咨询"],
    "车型信息咨询": ["车型咨询"],
    "车型对比": ["车型咨询", "价格咨询"],
    "试驾预约": ["试驾预约"],
    "门店与销售咨询": ["试驾预约"],
    "保养服务": ["保养咨询"],
    "故障咨询与维修": ["故障排查", "维修咨询"],
    "充电与新能源使用": ["保养咨询", "车型咨询"],
    "保修与政策": ["车型咨询"],
    "旧车置换咨询": [],
    "购车流程咨询": [],
    "金融贷款咨询": [],
    "库存咨询": [],
}


def _qa_retrieve(user_msg: str, intent: str = "", top_k: int = 10) -> list[Chunk]:
    """基于 bigram 重叠度检索 QA 对，按意图过滤。"""
    qa_list = _load_qa()
    if not qa_list:
        return []

    allowed_cats = _INTENT_TO_QA_CATS.get(intent)
    if allowed_cats is not None and len(allowed_cats) == 0:
        return []

    candidates = qa_list
    if allowed_cats:
        candidates = [qa for qa in qa_list if qa.get("category") in allowed_cats]
    if not candidates:
        candidates = qa_list

    user_bi = _ngrams(user_msg, 2)
    user_uni = set(user_msg)
    scored: list[tuple[float, Chunk]] = []
    for qa in candidates:
        q_bi = _ngrams(qa["question"], 2)
        q_uni = set(qa["question"])
        raw = len(user_bi & q_bi) * 2.0 + len(user_uni & q_uni) * 0.5
        if raw > 1.0:
            scored.append((raw, {"source": "qa", "content": qa["answer"], "score": raw}))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [chunk for _, chunk in scored[:top_k]]


# ---------------------------------------------------------------------------
# Source 4: 结构化数据检索
# ---------------------------------------------------------------------------

def _structured_retrieve(user_msg: str) -> list[Chunk]:
    """从 cars.json 精确匹配车型名称。"""
    cars = _load_cars()
    results: list[Chunk] = []
    for car in cars:
        model: str = car.get("model", "")
        if model and model.replace(" ", "") in user_msg.replace(" ", ""):
            highlights = "、".join(car.get("highlights", []))
            price_wan = car.get("price_from", 0) / 10000
            content = (
                f"{model}：起售价 {price_wan:.1f} 万元，"
                f"续航 {car.get('range_km', 0)}km。"
                f"{car.get('description', '')} 亮点：{highlights}"
            )
            results.append({"source": "structured", "content": content, "score": 5.0})
    return results[:2]


# ---------------------------------------------------------------------------
# RRF 融合
# ---------------------------------------------------------------------------

def _rrf_fuse(ranked_lists: list[list[Chunk]], top_n: int = 20, k: int = 60) -> list[Chunk]:
    """
    Reciprocal Rank Fusion。
    对多路检索结果按内容去重后融合，score = Σ 1/(k + rank)。
    """
    content_to_score: dict[str, float] = {}
    content_to_chunk: dict[str, Chunk] = {}

    for ranked in ranked_lists:
        for rank, chunk in enumerate(ranked, start=1):
            content = chunk["content"]
            rrf_score = 1.0 / (k + rank)
            content_to_score[content] = content_to_score.get(content, 0.0) + rrf_score
            if content not in content_to_chunk:
                content_to_chunk[content] = chunk

    fused = sorted(content_to_score.items(), key=lambda x: x[1], reverse=True)[:top_n]
    return [
        {**content_to_chunk[content], "score": score}
        for content, score in fused
    ]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def retrieve(
    user_msg: str,
    intent: str = "",
    persist_dir: str = "",
    top_k: int = 5,
) -> list[Chunk]:
    """
    混合检索 + 精排，返回最相关的 top_k 个片段。
    各路降级均不抛异常。
    """
    if not persist_dir:
        persist_dir = get_settings().chroma_persist_dir

    # 1. 获取查询向量（Embedding Key 缺失时为 None）
    query_vector = await embed_query(user_msg)

    # 2. 各路召回
    vec_results = await _chroma_retrieve(user_msg, query_vector, persist_dir, n_results=30)
    bm25_results = _bm25_retrieve(user_msg, persist_dir, top_k=30)
    qa_results = _qa_retrieve(user_msg, intent=intent, top_k=10)
    struct_results = _structured_retrieve(user_msg)

    # 3. RRF 融合 → top-20 候选
    candidates = _rrf_fuse([vec_results, bm25_results, qa_results, struct_results], top_n=20)

    if not candidates:
        return []

    # 4. Reranker 精排 → top_k
    candidate_texts = [c["content"] for c in candidates]
    ranked_pairs = await rerank(user_msg, candidate_texts, top_n=top_k)

    if all(score == 0.0 for _, score in ranked_pairs):
        # Reranker 不可用，直接返回 RRF top_k
        return candidates[:top_k]

    return [
        {**candidates[idx], "score": score}
        for idx, score in ranked_pairs
    ]
