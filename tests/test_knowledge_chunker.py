"""
knowledge_service 分块器单元测试。

覆盖：
- YAML front matter 剥离
- 孤立标题合并
- 大表格行切分（保留表头前缀）
- 标题+大表格组合块
- _extract_metadata 在有 front matter 时仍能正确提取标题
"""

from pycore.services.knowledge_service import (
    _extract_metadata,
    _is_separator_row,
    _is_table_row,
    _split_chunks,
    _strip_front_matter,
)

FRONT_MATTER_DOC = """\
---
title: 极氪001 规格参数
category: 车型
risk_level: medium
---

# 极氪001 规格参数

> 价格属于动态信息，以官方 App 确认为准。

## 车型概览

| 字段 | 内容 |
| --- | --- |
| 车型 | 极氪 001 |
| 定位 | 中大型车 |
"""

ORPHAN_HEADING_DOC = """\
# 文档标题

## 第一节

第一节的内容在这里，有足够的文字。

## 第二节

第二节的内容在这里。
"""

BIG_TABLE_DOC = """\
## 汽车之家长表关键字段摘录

| 配置 | 分类 | 项目 | 值 |
| --- | --- | --- | --- |
| 2026款 103度后驱 Max版 | 个性化/选装包 | 「伊姆斯躺椅」模式 | 包含：4向电动调节超长腿托、2向电动脚踏、125°后排座椅最大躺角；○ (6000元) |
| 2026款 103度四驱 Ultra+版 | 个性化/选装包 | 「伊姆斯躺椅」模式 | 包含：4向电动调节超长腿托、2向电动脚踏、125°后排座椅最大躺角；○ (6000元) |
| 2026款 103度四驱 Ultra版 | 智驾 | 千里浩瀚 H7 | 标配 |
| 2026款 95度四驱 Max版 | 智驾 | 千里浩瀚 H7 | 标配 |
| 2026款 103度后驱 Max版 | 充电 | 900V 高压架构 | 支持 6C 超充 |
"""


class TestStripFrontMatter:
    def test_removes_front_matter(self) -> None:
        result = _strip_front_matter(FRONT_MATTER_DOC)
        assert "title:" not in result
        assert "category:" not in result
        assert "# 极氪001 规格参数" in result

    def test_no_front_matter_unchanged(self) -> None:
        doc = "# 普通文档\n\n内容在这里。"
        assert _strip_front_matter(doc) == doc

    def test_does_not_remove_mid_doc_separator(self) -> None:
        doc = "# 标题\n\n内容。\n\n---\n\n更多内容。"
        result = _strip_front_matter(doc)
        assert "---" in result


class TestTableRowHelpers:
    def test_is_table_row_valid(self) -> None:
        assert _is_table_row("| 配置 | 值 |")

    def test_is_table_row_invalid(self) -> None:
        assert not _is_table_row("普通文本")
        assert not _is_table_row("| 单管道")

    def test_is_separator_row(self) -> None:
        assert _is_separator_row("| --- | --- | --- |")
        assert _is_separator_row("| :--- | ---: |")
        assert not _is_separator_row("| 配置 | 值 |")


class TestSplitChunks:
    def test_front_matter_not_in_any_chunk(self) -> None:
        chunks = _split_chunks(FRONT_MATTER_DOC)
        for chunk in chunks:
            assert "title:" not in chunk
            assert "risk_level:" not in chunk

    def test_heading_merged_with_next_para(self) -> None:
        chunks = _split_chunks(ORPHAN_HEADING_DOC)
        # "## 第一节" should be merged into the chunk containing first section content
        heading_alone = [c for c in chunks if c.strip() == "## 第一节"]
        assert heading_alone == [], f"孤立标题未合并: {chunks}"

    def test_big_table_split_into_rows(self) -> None:
        chunks = _split_chunks(BIG_TABLE_DOC)
        # 5 data rows → 5 chunks (each row gets header prefix)
        assert len(chunks) == 5, f"期望 5 个行块，实际: {len(chunks)}\n{chunks}"

    def test_big_table_each_chunk_has_header(self) -> None:
        chunks = _split_chunks(BIG_TABLE_DOC)
        for chunk in chunks:
            assert "| 配置 | 分类 | 项目 | 值 |" in chunk, f"表头缺失: {chunk[:100]}"
            assert "| --- |" in chunk, f"分隔行缺失: {chunk[:100]}"

    def test_big_table_heading_prefix_in_each_chunk(self) -> None:
        chunks = _split_chunks(BIG_TABLE_DOC)
        for chunk in chunks:
            assert "## 汽车之家长表" in chunk, f"标题前缀缺失: {chunk[:100]}"

    def test_small_table_not_split(self) -> None:
        doc = "## 车型概览\n\n| 字段 | 内容 |\n| --- | --- |\n| 车型 | 极氪 001 |\n| 定位 | 中大型车 |"
        chunks = _split_chunks(doc)
        # Small table (2 data rows < 4 threshold) → stays as one chunk
        assert len(chunks) == 1

    def test_noise_chunks_filtered(self) -> None:
        doc = "---\ntitle: x\n---\n\n# 标题\n\n正文段落，有足够的内容。"
        chunks = _split_chunks(doc)
        for chunk in chunks:
            assert len(chunk.strip()) >= 10

    def test_returns_list_always(self) -> None:
        assert isinstance(_split_chunks(""), list)
        assert isinstance(_split_chunks("---\ntitle: x\n---"), list)


class TestExtractMetadata:
    def test_extracts_title_ignoring_front_matter(self) -> None:
        meta = _extract_metadata(FRONT_MATTER_DOC)
        assert meta["title"] == "极氪001 规格参数"
        assert "title:" not in meta["title"]

    def test_summary_skips_heading_lines(self) -> None:
        meta = _extract_metadata(FRONT_MATTER_DOC)
        # summary should be the blockquote or table content, not a heading
        assert not meta["summary"].startswith("#")

    def test_no_front_matter_still_works(self) -> None:
        doc = "# 保养周期\n\n每12个月或10000公里保养一次。"
        meta = _extract_metadata(doc)
        assert meta["title"] == "保养周期"
        assert "每12个月" in meta["summary"]
