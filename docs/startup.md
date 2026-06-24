# auto-cs 启动文档

最后更新：2026-06-23
适用范围：本地 macOS / Linux 开发与验收环境

## 1. 环境要求

| 依赖 | 要求 | 说明 |
|---|---|---|
| Python | 3.13.5+，最低 3.11 | 后端 FastAPI / PyCore 运行时 |
| Node.js | 18+ | 前端 Vite / React 运行时 |
| npm | 随 Node 安装 | 前端依赖安装与启动 |
| SQLite | Python 内置可用 | 默认数据库为本地文件 |

推荐在项目根目录执行所有后端命令：

```bash
cd /Users/pompeiichan/Desktop/car_customer_service/Projects_Repo/auto-cs
```

## 2. 安装命令

### 2.1 后端

```bash
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -e ".[dev]"
```

如果 `.venv/` 已存在，可以直接执行：

```bash
.venv/bin/python -m pip install -e ".[dev]"
```

### 2.2 前端

```bash
cd frontend
npm install
cd ..
```

## 3. .env 配置

复制示例配置：

```bash
cp .env.example .env
```

`.env` 字段说明：

| 字段 | 缺省值 | 说明 |
|---|---|---|
| `LLM_API_KEY` | 空字符串 | 硅基流动 / OpenAI 兼容接口 Key。留空时使用 Mock LLM。 |
| `LLM_BASE_URL` | `https://api.siliconflow.cn/v1` | LLM API base URL。 |
| `LLM_MODEL` | `Qwen/Qwen3-32B` | 对话模型。 |
| `EMBEDDING_API_KEY` | 空字符串 | Embedding Key。留空时向量检索降级。 |
| `EMBEDDING_BASE_URL` | `https://api.siliconflow.cn/v1` | Embedding API base URL。 |
| `EMBEDDING_MODEL` | `Qwen/Qwen3-Embedding-8B` | Embedding 模型。 |
| `RERANK_API_KEY` | 空字符串 | Rerank Key。留空时按原始召回顺序降级。 |
| `RERANK_BASE_URL` | `https://api.siliconflow.cn/v1` | Rerank API base URL。 |
| `RERANK_MODEL` | `Qwen/Qwen3-Reranker-8B` | Rerank 模型。 |
| `RERANK_TOP_N` | `5` | 精排返回数量。 |
| `DATABASE_PATH` | `./data/auto_cs.db` | SQLite 数据库路径。 |
| `CHROMA_PERSIST_DIR` | `./data/chroma` | Chroma 向量库持久化目录。 |
| `BACKEND_PORT` | `8199` | 后端本地端口。 |
| `BACKEND_HOST` | `0.0.0.0` | 后端监听地址。 |
| `UPLOAD_DIR` | `./data/uploads` | 知识库上传文件目录。 |
| `MAX_UPLOAD_SIZE_MB` | `10` | 单文件上传大小上限。 |

纯本地 Mock/降级模式下，把 Key 字段留空：

```dotenv
LLM_API_KEY=
EMBEDDING_API_KEY=
RERANK_API_KEY=
```

不要保留 `sk-your-siliconflow-key-here` 这类占位字符串；占位字符串会被程序当成真实 Key 尝试调用远端接口。

## 4. 启动命令

### 4.1 启动后端（8199）

```bash
.venv/bin/python run.py
```

`run.py` 会读取 `.env` 中的 `BACKEND_HOST` 和 `BACKEND_PORT`，默认端口为 `8199`。

如需临时指定端口：

```bash
BACKEND_HOST=127.0.0.1 BACKEND_PORT=8199 .venv/bin/python run.py
```

### 4.2 启动前端（5175）

另开一个终端：

```bash
cd /Users/pompeiichan/Desktop/car_customer_service/Projects_Repo/auto-cs/frontend
VITE_USE_MOCK=false \
VITE_API_BASE_URL=/api \
VITE_BACKEND_PROXY_TARGET=http://localhost:8199 \
npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

访问：

```text
http://localhost:5175/chat
```

说明：

- `VITE_USE_MOCK=false`：前端走真实后端。
- `VITE_API_BASE_URL=/api`：所有 HTTP API 使用 Vite 代理。
- `VITE_BACKEND_PROXY_TARGET=http://localhost:8199`：Vite 将 `/api` 和 `/ws` 转发到本地后端。

## 5. 验证步骤

### 5.1 健康检查

```bash
curl http://localhost:8199/health
```

预期：

```json
{"status":"ok","version":"1.0.0"}
```

### 5.2 首条对话

```bash
curl -X POST http://localhost:8199/api/v1/chat/message \
  -H "Content-Type: application/json" \
  -d '{"session_id":"startup-check","message":"我想买一辆20万左右的车"}'
```

预期返回字段包含：

```json
{
  "session_id": "startup-check",
  "reply": "...",
  "intent": "...",
  "need_human": false
}
```

### 5.3 前端页面

打开：

```text
http://localhost:5175/chat
```

最小验收：

- 页面可正常显示 C01 客户端对话页。
- 输入“我想买一辆20万左右的车”后能收到 AI 回复。
- 点击“试驾预约”快捷按钮会直接发送并触发试驾预约引导。

## 6. Mock / 降级模式说明

本项目支持 Key 缺失时降级运行：

| 能力 | Key 缺失时行为 |
|---|---|
| LLM 对话 | `LLM_API_KEY` 为空时使用 `MockLLMProvider`。 |
| Embedding | `EMBEDDING_API_KEY` 为空或调用失败时返回 `None`，检索链路降级。 |
| Rerank | `RERANK_API_KEY` 为空或调用失败时按原始顺序返回。 |
| SQLite | 无需外部服务，自动使用本地文件。 |
| Chroma | 使用本地 `CHROMA_PERSIST_DIR`；不可用时由检索服务降级。 |

如果要验证真实 LLM / Embedding / Rerank，把对应 Key 写入 `.env`。真实 Key 只放在 `.env`，不要写进 PRD、Plan、测试报告或 Git 提交。

## 7. 常见问题

### 7.1 端口被占用

检查监听进程：

```bash
lsof -i :8199
lsof -i :5175
```

如果端口被旧服务占用，先停止旧服务，再重新启动。前端建议保留 `--strictPort`，避免 Vite 自动换端口导致验收入口不一致。

### 7.2 前端能打开但请求失败

确认后端健康检查可用：

```bash
curl http://localhost:8199/health
```

确认前端启动命令中包含：

```bash
VITE_API_BASE_URL=/api
VITE_BACKEND_PROXY_TARGET=http://localhost:8199
```

### 7.3 想完全离线跑

把 `.env` 中三个 Key 留空：

```dotenv
LLM_API_KEY=
EMBEDDING_API_KEY=
RERANK_API_KEY=
```

然后重启后端和前端。

### 7.4 数据库从空库启动

后端启动时会自动执行 SQLite migration。默认数据库路径：

```text
./data/auto_cs.db
```

如果需要隔离测试，可以临时指定新数据库：

```bash
DATABASE_PATH=./data/startup_check.db .venv/bin/python run.py
```
