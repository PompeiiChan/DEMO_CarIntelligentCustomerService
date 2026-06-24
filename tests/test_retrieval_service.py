"""
retrieval_service 单元测试（P7b 版本）。

覆盖：
- QA bigram 检索
- 结构化数据检索
- BM25 加载（store 不存在时不崩溃）
- RRF 融合逻辑（去重 + 得分合并）
- retrieve() 全降级路径（无 Embedding Key、无 BM25、无 Reranker）
"""

import json
import tempfile
from pathlib import Path

import pytest

from pycore.services.retrieval_service import (
    _bm25_retrieve,
    _ngrams,
    _qa_retrieve,
    _rrf_fuse,
    _structured_retrieve,
    retrieve,
)


class TestNgrams:
    def test_basic(self) -> None:
        result = _ngrams("极氪001", 2)
        assert "极氪" in result
        assert "氪0" in result


class TestQaRetrieve:
    def test_matches_price_query(self) -> None:
        results = _qa_retrieve("极氪001多少钱", intent="价格咨询")
        assert len(results) >= 1
        assert all(r["source"] == "qa" for r in results)

    def test_empty_intent_uses_all(self) -> None:
        results = _qa_retrieve("极氪001多少钱", intent="")
        assert len(results) >= 1

    def test_no_qa_intent_returns_empty(self) -> None:
        results = _qa_retrieve("无关内容xyz", intent="旧车置换咨询")
        assert results == []

    def test_unrelated_query_no_match(self) -> None:
        results = _qa_retrieve("zzzzzz完全无关", intent="价格咨询")
        assert results == []

    def test_top_k_respected(self) -> None:
        results = _qa_retrieve("极氪001多少钱", intent="", top_k=2)
        assert len(results) <= 2


class TestStructuredRetrieve:
    def test_matches_known_model(self) -> None:
        results = _structured_retrieve("极氪001的配置怎么样")
        assert len(results) >= 1
        assert results[0]["source"] == "structured"
        assert "极氪" in results[0]["content"]

    def test_no_match_for_unrelated(self) -> None:
        results = _structured_retrieve("完全无关的问题abc")
        assert results == []


class TestBm25Retrieve:
    def test_empty_store_returns_empty(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            results = _bm25_retrieve("极氪001保养周期", tmpdir, top_k=5)
            assert results == []

    def test_retrieves_from_store(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            store = [
                {"chunk_id": "doc1_chunk_0", "doc_id": "doc1",
                 "text": "极氪001保养周期为每12个月或每10000公里"},
                {"chunk_id": "doc1_chunk_1", "doc_id": "doc1",
                 "text": "轮胎每6个月检查一次"},
            ]
            Path(tmpdir, "bm25_store.json").write_text(
                json.dumps(store, ensure_ascii=False), encoding="utf-8"
            )
            results = _bm25_retrieve("极氪001保养周期", tmpdir, top_k=5)
            assert len(results) >= 1
            assert results[0]["source"] == "knowledge_bm25"
            assert "保养" in results[0]["content"]


class TestRrfFuse:
    def test_deduplicates_same_content(self) -> None:
        chunk_a = {"source": "vec", "content": "极氪001起售价26.9万", "score": 0.9}
        chunk_b = {"source": "bm25", "content": "极氪001起售价26.9万", "score": 0.8}
        result = _rrf_fuse([[chunk_a], [chunk_b]])
        contents = [r["content"] for r in result]
        assert contents.count("极氪001起售价26.9万") == 1

    def test_higher_rank_gets_higher_rrf(self) -> None:
        list_a = [
            {"source": "vec", "content": "doc_top", "score": 1.0},
            {"source": "vec", "content": "doc_second", "score": 0.5},
        ]
        result = _rrf_fuse([list_a])
        assert result[0]["content"] == "doc_top"

    def test_empty_input_returns_empty(self) -> None:
        assert _rrf_fuse([[], []]) == []

    def test_top_n_respected(self) -> None:
        chunks = [{"source": "qa", "content": f"doc_{i}", "score": float(i)} for i in range(10)]
        result = _rrf_fuse([chunks], top_n=3)
        assert len(result) <= 3


class TestRetrieveIntegrated:
    @pytest.mark.asyncio
    async def test_degraded_no_embedding_no_bm25(self) -> None:
        """无 Embedding Key + 无 BM25 store → 仅 QA/结构化降级，不抛异常。"""
        results = await retrieve(
            "极氪001多少钱",
            intent="价格咨询",
            persist_dir="/tmp/nonexistent_p7b_test",
        )
        assert isinstance(results, list)

    @pytest.mark.asyncio
    async def test_returns_list_always(self) -> None:
        results = await retrieve("zzz完全无关", persist_dir="/tmp/nonexistent_p7b_test")
        assert isinstance(results, list)

    @pytest.mark.asyncio
    async def test_top_k_respected(self) -> None:
        results = await retrieve(
            "极氪001",
            intent="车型信息咨询",
            persist_dir="/tmp/nonexistent_p7b_test",
            top_k=2,
        )
        assert len(results) <= 2

    @pytest.mark.asyncio
    async def test_bm25_path_works(self) -> None:
        """BM25 store 存在时，retrieve 可以从 BM25 拿到结果。"""
        with tempfile.TemporaryDirectory() as tmpdir:
            store = [
                {"chunk_id": "d1_chunk_0", "doc_id": "d1",
                 "text": "极氪001保养周期每12个月或10000公里"},
            ]
            Path(tmpdir, "bm25_store.json").write_text(
                json.dumps(store, ensure_ascii=False), encoding="utf-8"
            )
            results = await retrieve(
                "极氪001保养周期",
                intent="保养服务",
                persist_dir=tmpdir,
                top_k=5,
            )
            assert isinstance(results, list)
            contents = " ".join(r["content"] for r in results)
            assert "保养" in contents

    @pytest.mark.asyncio
    async def test_score_sorted_descending(self) -> None:
        results = await retrieve(
            "极氪001多少钱",
            intent="价格咨询",
            persist_dir="/tmp/nonexistent_p7b_test",
        )
        if len(results) > 1:
            scores = [r["score"] for r in results]
            assert scores == sorted(scores, reverse=True)
