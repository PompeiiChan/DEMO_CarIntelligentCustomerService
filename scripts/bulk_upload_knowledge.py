#!/usr/bin/env python3
"""
批量上传 knowledge-base/ 文件到汽车客服知识库。

上传范围：车型、价格、保养、维修、政策（5 个目录）
跳过：问法库、人工介入、安全边界（行为约束类，不进 RAG）
跳过：根目录管理文件（README.md、manifest.md、来源与时效.md）

用法：
  python scripts/bulk_upload_knowledge.py            # 默认 localhost:8199
  python scripts/bulk_upload_knowledge.py --port 8003
  python scripts/bulk_upload_knowledge.py --dry-run  # 仅列出文件，不上传
"""

import argparse
import re
import sys
import time
from pathlib import Path

try:
    import httpx
except ImportError:
    print("缺少依赖：pip install httpx")
    sys.exit(1)

# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------

KB_ROOT = Path(__file__).parent.parent / "knowledge-base"

UPLOAD_DIRS = {"车型", "价格", "保养", "维修", "政策"}

SKIP_FILES = {"README.md", "manifest.md", "来源与时效.md"}

FRONT_MATTER_RE = re.compile(r"^---\n(.*?)\n---\n?", re.DOTALL)

# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------


def parse_front_matter_category(content: str, fallback: str) -> str:
    """从 YAML front matter 提取 category 字段，缺失时用目录名兜底。"""
    m = FRONT_MATTER_RE.match(content)
    if not m:
        return fallback
    for line in m.group(1).splitlines():
        if line.startswith("category:"):
            return line.split(":", 1)[1].strip()
    return fallback


def collect_files() -> list[Path]:
    """收集所有待上传文件，按目录字母顺序排列。"""
    files: list[Path] = []
    for dir_name in sorted(UPLOAD_DIRS):
        dirpath = KB_ROOT / dir_name
        if not dirpath.exists():
            print(f"  [警告] 目录不存在，跳过：{dirpath}")
            continue
        for f in sorted(dirpath.glob("*.md")):
            if f.name not in SKIP_FILES:
                files.append(f)
    return files


def wait_for_indexed(client: httpx.Client, base_url: str, doc_id: str, timeout: int = 180) -> dict:
    """
    轮询文档处理状态，直到 indexed / failed / timeout。
    返回最终 status data。
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            resp = client.get(f"{base_url}/api/v1/knowledge/documents/{doc_id}/status")
            if resp.status_code == 200:
                data = resp.json().get("data", {})
                if data.get("status") in ("indexed", "failed"):
                    return data
        except httpx.RequestError:
            pass
        time.sleep(2)
    return {"status": "timeout", "steps": []}


def format_step_detail(data: dict) -> str:
    """从 status data 里提取一行摘要。"""
    steps = data.get("steps", [])
    step1 = next((s for s in steps if s.get("step") == 1), {})
    step2 = next((s for s in steps if s.get("step") == 2), {})
    chunks = step1.get("detail", "")
    index = step2.get("detail", "")
    parts = [p for p in [chunks, index] if p]
    return " | ".join(parts) if parts else ""


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="批量上传极氪知识库文件")
    parser.add_argument("--port", type=int, default=8199, help="服务端口（默认 8199）")
    parser.add_argument("--host", default="localhost", help="服务主机（默认 localhost）")
    parser.add_argument("--dry-run", action="store_true", help="仅列出文件，不实际上传")
    args = parser.parse_args()

    base_url = f"http://{args.host}:{args.port}"

    # 1. 收集文件
    files = collect_files()
    if not files:
        print("未找到任何待上传文件，请检查 knowledge-base/ 目录。")
        sys.exit(1)

    print(f"待上传文件：{len(files)} 个  →  {base_url}")
    print()

    if args.dry_run:
        for f in files:
            content = f.read_text(encoding="utf-8")
            category = parse_front_matter_category(content, f.parent.name)
            print(f"  {f.parent.name}/{f.name}  →  category={category}")
        print("\n[dry-run] 未实际上传。")
        return

    # 2. 检查服务是否在线
    try:
        with httpx.Client(timeout=5.0) as probe:
            probe.get(f"{base_url}/health")
    except httpx.RequestError:
        print(f"[错误] 无法连接到 {base_url}，请先启动服务后重试。")
        sys.exit(1)

    # 3. 逐文件上传
    ok_count = 0
    fail_count = 0

    with httpx.Client(timeout=60.0) as client:
        for i, filepath in enumerate(files, 1):
            content = filepath.read_text(encoding="utf-8")
            category = parse_front_matter_category(content, filepath.parent.name)
            label = f"{filepath.parent.name}/{filepath.name}"

            print(f"[{i:2d}/{len(files)}] {label}")
            print(f"        category={category}", end="  ")

            # 上传
            try:
                resp = client.post(
                    f"{base_url}/api/v1/knowledge/documents",
                    files={"file": (filepath.name, content.encode("utf-8"), "text/markdown")},
                    data={"category": category},
                )
            except httpx.RequestError as e:
                print(f"✗ 网络错误: {e}")
                fail_count += 1
                continue

            if resp.status_code != 200:
                print(f"✗ HTTP {resp.status_code}: {resp.text[:120]}")
                fail_count += 1
                continue

            doc_id = resp.json()["data"]["doc_id"]
            print(f"→ doc_id={doc_id}", end="  ")
            sys.stdout.flush()

            # 等待 Pipeline 完成
            status_data = wait_for_indexed(client, base_url, doc_id)
            final_status = status_data.get("status", "unknown")
            detail = format_step_detail(status_data)

            if final_status == "indexed":
                print(f"✓  {detail}")
                ok_count += 1
            elif final_status == "failed":
                err_step = next(
                    (s for s in status_data.get("steps", []) if s.get("status") == "failed"),
                    {},
                )
                print(f"✗ 处理失败: {err_step.get('detail', '未知')}")
                fail_count += 1
            else:
                print(f"? {final_status}")
                fail_count += 1

    # 4. 汇总
    print()
    print("=" * 50)
    print(f"完成：{ok_count} 成功  {fail_count} 失败  共 {len(files)} 个文件")
    if fail_count > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
