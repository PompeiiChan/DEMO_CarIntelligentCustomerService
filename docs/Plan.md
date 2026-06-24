# 开发计划 · auto-cs V1 MVP

**最后更新**：2026-06-23
**技术栈**：React 19 + TypeScript + Vite（前端）/ FastAPI + PyCore + SQLite + Chroma（后端）
**端口约定**：当前代码默认后端 `8199`（`BACKEND_PORT` / Vite proxy），前端用户验收端口 `5175`；如需临时指向其他后端，使用 `VITE_BACKEND_PROXY_TARGET`。

---

## 当前状态快照

**当前阶段**：开发后期收口。
**机器可读指针**：`.sdd/status.json` 已同步为 `stage=development`、`development_ready=true`、`current_task=null`、`blocked=false`。
**任务账本**：以 `.sdd/tasks.json` 为准，F0-F4、GATE-MOCK、B0-B2、P1-P8（含 P7b）、E1、E2 均为 `passed`。
**当前下一步**：当前无在途 `.sdd` 开发任务；如需继续交付，下一步是 Git/发布卫生。
**恢复入口**：新开窗口时先读 `.sdd/status.json`、`.sdd/tasks.json`、本文件和 `.sdd/work-log.md`。

### 已完成范围

- 前端 Mock 阶段：C01 客户端对话、S02 当前对话列表、S01 坐席工作台、A02 知识库管理。
- 后端基础设施：FastAPI / PyCore / SQLite / WebSocket 基础、Mock 数据 API、LLM 客户端降级。
- 功能真实联调：AI 对话 Pipeline、工单创建、坐席接单、实时消息、结束工单、转回 AI、Bad Case 标注、知识库管理、RAG 接入。
- RAG 升级：Qwen Embedding、BM25Plus、RRF 融合、Reranker 精排和降级链路。
- 坐席 AI 建议：`POST /api/v1/tickets/{ticket_id}/suggest` 与前端建议区真实接口路径已纳入任务账本。
- E1 完整链路回归：首轮 4 个失败点已修复，第二轮回归 `PASS`；详见 `.sdd/test-reports/test-E1.md`。
- E2 启动文档：`docs/startup.md` 已生成并通过启动 smoke；详见 `.sdd/test-reports/test-E2.md`。

### 待完成范围

- Git/交付卫生：当前项目仓库尚未形成可靠提交点；最终交付前需要检查 `git status` 并提交受控范围。

---

## 推进策略

```
前端 Mock 先行（F0-F4）
    ↓ 用户门禁确认 Mock 页面
后端基础设施自动连续执行（B0-B2）
    ↓ 自动推进，无门禁
逐功能闭环：前端真实联调 + 后端业务 + Tester 验收（P1-P8，含 P7b）
    ↓ 每功能一个用户门禁
E2E 回归已通过 → startup.md（E2）
```

---

## 阶段一：前端 Mock（F0–F4）

> 所有页面用 `frontend/src/mocks/` 中的静态数据，`VITE_USE_MOCK=true`。
> 完成后触发用户门禁：确认 Mock UI 符合原型后再进入后端。

### F0 · 前端脚手架

**目标**：搭建 Vite + React + TS 项目，建立路由和全局样式基底。

**交付物**：
- `frontend/` 目录，Vite + React 19 + TypeScript
- 路由：`/chat`（C01）、`/agent`（S01）、`/queue`（S02）、`/knowledge`（A02）
- 全局 CSS 变量（对齐原型 design token）
- `frontend/src/mocks/` 目录，放置所有 mock JSON
- Vite 代理配置：`/api` → `http://localhost:8199`，`/ws` → `ws://localhost:8199`；可用 `VITE_BACKEND_PROXY_TARGET` 临时覆盖后端地址
- `VITE_USE_MOCK=true` 时使用 mock，`false` 时走真实后端

**验收**：`npm run dev` 启动，四个路由可访问，无 TS 编译错误。
`user_gate: false`（基础设施，自动推进）

---

### F1 · C01 客户端对话页

**目标**：复刻原型 C01，支持 Mock AI 对话交互。

**交付物**：
- 手机外壳 + 状态栏（固定 UI）
- 聊天区：消息列表（AI 气泡左、用户气泡右）、打字动画
- 快捷操作栏（6 个按钮，点击填入输入框）
- 输入框 + 发送按钮（Enter 发送、Shift+Enter 换行）
- Mock 逻辑：每条消息后 1s 延迟返回 mock AI 回复；第 4 条消息触发 mock 转人工流程（工单系统 pill + 人工接入 pill + header 切换）
- Mock 数据：`mocks/chat.ts`，包含预设 AI 回复和转人工场景

**验收**：
- 发送消息 → 1s 后 AI 回复
- 发送第 4 条消息 → 出现工单 pill → 出现人工接入 pill → header 变蓝色「人工客服」
- 快捷按钮点击后文字填入输入框

`user_gate: false`

---

### F2 · S02 当前对话列表

**目标**：复刻原型 S02，筛选和排序均可交互。

**交付物**：
- 页面顶部筛选栏：全部 / 售前 / 售后 / 负面情绪
- 排序下拉：等待时长 / 优先级 / 工单创建时间
- 工单卡片列表（待接手 + 服务中两个 section）
- 点击「接手」跳转到 S01（`/agent?ticket_id=xxx`）
- Mock 数据：`mocks/tickets.ts`，5 张工单（与原型数据一致）

**验收**：
- 点击分类按钮 → 列表正确过滤
- 切换排序 → 列表重新排序
- 点击「接手」→ 跳转到 `/agent`

`user_gate: false`

---

### F3 · S01 坐席工作台

**目标**：复刻原型 S01，三栏布局，全部操作按钮可交互（Mock）。

**交付物**：
- 三栏布局：左侧工单列表（待接手/服务中/已结束）+ 中间对话区 + 右侧工单详情
- 左右侧边栏可拖拽调宽（180–400px / 200–440px）
- 待接手：点击卡片 → 预览对话历史 → 「接单」按钮确认弹窗
- 服务中：输入框发消息、AI 建议采用、Bad Case 标注（含确认弹窗）、转回 AI（含确认弹窗）、结束工单（含确认弹窗）
- 已结束：显示「已完成」和「转回 AI」两种状态徽标
- 确认弹窗：取消=蓝色、确认=灰色（反直觉安全护栏）
- Mock 数据：`mocks/tickets.ts`（复用 F2）+ `mocks/messages.ts`

**验收**：
- 待接手 → 预览 → 接单 → 出现在服务中 tab
- 发消息 → 消息出现在聊天区右侧
- 点击结束/转回AI/Bad Case → 弹窗出现 → 确认后执行

`user_gate: false`

---

### F4 · A02 知识库管理

**目标**：复刻原型 A02，搜索/筛选/排序/增删均可交互（Mock）。

**交付物**：
- 左侧分类导航（全部/车型/价格/保养/维修/政策）
- 文档表格：列表、排序下拉、搜索框（内容区）
- 顶部「搜索文档」按钮 → Spotlight 搜索弹窗（实时过滤 + 键盘导航）
- 「上传文档」按钮 → 文件选择器（.md，最大 10MB）
- 行内：查看（toast）、删除（confirm 弹窗）、重试（状态改为处理中）
- 上传后在表格顶部插入一条「处理中」的 mock 行，模拟 4 步 pipeline
- Mock 数据：`mocks/documents.ts`（8 条，与原型一致）

**验收**：
- 点分类 → 表格过滤
- 搜索弹窗 → 输入关键词 → 高亮匹配 → 点击跳转到对应行
- 上传文件 → 出现处理中行 → 2s 后自动变为「已入库」

`user_gate: false`

---

### 🚦 用户门禁 #1：Mock UI 确认

> **触发条件**：F0–F4 全部完成，Tester 验收通过
> **用户操作**：在浏览器验收四个页面（端口 5175），确认 UI 符合原型后，回复「可以进入后端」

---

## 阶段二：后端基础设施（B0–B2）

> `user_gate: false`，Tester 自动验收后连续推进。

### B0 · FastAPI 服务 + 数据库初始化

**目标**：启动可用的 FastAPI 服务，建好 SQLite 表结构。

**交付物**：
- `pycore/api/server.py` 补全：启动配置、CORS（允许 5199/5175）、WebSocket 路由挂载
- `pycore/core/config.py` 补全：从 `.env` 读取 `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `DATABASE_PATH`, `CHROMA_PERSIST_DIR`，缺失时降级 Mock
- SQLite 表：`sessions`、`messages`、`tickets`、`documents`、`bad_cases`（详见 api-contracts.md 数据结构）
- 数据库迁移脚本：`pycore/integrations/db/migrations.py`，启动时自动建表
- 健康检查：`GET /health` → `{"status": "ok"}`

**验收**（自动）：
```bash
curl http://localhost:8199/health  # → {"status": "ok"}
```

---

### B1 · Mock 静态数据 API

**目标**：实现车型和门店的 mock 接口，供 AI Pipeline 查询。

**交付物**：
- `pycore/data/mock/` 目录：`cars.json`（3 款极氪车型）、`stores.json`（上海 3 家门店）、`qa_pairs.json`（50 条高频 QA）
- `GET /api/v1/mock/cars` 和 `GET /api/v1/mock/stores` 路由

**验收**（自动）：
```bash
curl "http://localhost:8199/api/v1/mock/cars"  # → 3条车型数据
```

---

### B2 · LLM 客户端封装

**目标**：封装通义千问调用，Key 缺失时自动降级 Mock。

**交付物**：
- `pycore/integrations/llm/qwen_provider.py`：基于 `openai_provider.py` 扩展，`base_url` 指向硅基流动
- Mock 降级：`LLM_API_KEY` 为空时，情绪/意图/回复均返回预设 mock 值
- `httpx.AsyncClient(trust_env=False)` 显式禁用环境代理

**验收**（自动，Mock 模式）：
```bash
# 不需要真实 Key，Mock 模式下返回固定值
python -c "from pycore.integrations.llm import get_llm_client; print('OK')"
```

---

## 阶段三：功能闭环（P1–P7）

> 每个功能 = 后端实现 + 前端切换为真实 API + Tester 验收 + 用户门禁。

---

### P1 · AI 对话 Pipeline（C01 核心）

**依赖**：B0, B1, B2

**后端交付物**：
- `pycore/services/chat_service.py`：
  - 接收 `session_id` + `message`
  - 调用情绪识别（通义千问 or Mock）
  - 调用意图识别，返回 6 类意图 + 置信度
  - 置信度 > 70%：进入知识检索 → 生成回复
  - 置信度 40-70%：追问澄清
  - 置信度 < 40%：引导重述，计数 +1；连续 3 次 → 触发转人工
  - 负面情绪 > 60% → 触发转人工
  - 用户说「人工/转接」→ 触发转人工
  - 上下文管理：最近 5 轮存入 SQLite `messages` 表
- `POST /api/v1/chat/message` 路由（HTTP 版）
- `WS /ws/chat/{session_id}` 路由（流式版，delta → done）
- `GET /api/v1/chat/session/{session_id}` 路由

**前端切换**：
- C01 `VITE_USE_MOCK=false`，发消息走 `/ws/chat/{session_id}`
- WS `delta` 事件逐字追加气泡；`done` 更新元数据；`transfer` 触发工单 pill

**验收**（Tester）：
```bash
# HTTP 版快速验证
curl -X POST http://localhost:8199/api/v1/chat/message \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test-001","message":"极氪001多少钱"}'
# 预期：reply 含价格信息，intent=价格咨询，need_human=false

curl -X POST http://localhost:8199/api/v1/chat/message \
  -d '{"session_id":"test-001","message":"转人工"}'
# 预期：need_human=true，ticket_id 不为 null
```

**用户验收步骤**：打开 C01，发 3 条消息，第 3 条说「转人工」，确认工单 pill 出现。

`user_gate: true`

---

### P2 · 工单创建 + S02 列表

**依赖**：P1

**后端交付物**：
- `pycore/services/ticket_service.py`：创建工单（写 SQLite）、获取工单列表（支持 status/category/emotion 筛选和 3 种排序）
- `POST /api/v1/tickets`（AI Pipeline 内部调用）
- `GET /api/v1/tickets`（S02 列表）
- `GET /api/v1/tickets/{ticket_id}`（工单详情，含 history）

**前端切换**：
- S02 `VITE_USE_MOCK=false`，从真实接口加载工单列表
- 筛选/排序通过 Query 参数传后端

**验收**：
```bash
curl "http://localhost:8199/api/v1/tickets?status=pending"
# 预期：返回通过 P1 创建的工单
```

`user_gate: true`

---

### P3 · 坐席接单 + 实时消息（S01 核心）

**依赖**：P2

**后端交付物**：
- `PATCH /api/v1/tickets/{ticket_id}/assign` 路由
- `POST /api/v1/tickets/{ticket_id}/messages`（坐席发消息）
- `WS /ws/agent/{agent_id}`：
  - 连接后推送当前所有 `pending` 工单
  - 有新工单时推送 `new_ticket`
  - 用户通过 `/ws/chat` 发消息时，同步推送 `user_message` 给坐席

**前端切换**：
- S01 `VITE_USE_MOCK=false`
- 接单按钮 → 调 assign 接口 → WS 连接 `/ws/agent/A001`
- 坐席发消息 → POST messages → WS 推给 C01 客户端

**验收**：
- S02 看到待接手工单
- 点接手 → S01 中间区显示该用户历史消息
- S01 发消息 → C01 客户端收到坐席消息

`user_gate: true`

---

### P4 · 结束工单 + 转回 AI

**依赖**：P3

**后端交付物**：
- `PATCH /api/v1/tickets/{ticket_id}/resolve`（结束工单）
- `PATCH /api/v1/tickets/{ticket_id}/transfer-ai`（转回 AI）
  - 转回 AI 后会话状态重置为 `ai_serving`，AI Pipeline 重新接管后续消息
  - 通过 `/ws/chat/{session_id}` 推送 `agent_message`（AI 接管提示）

**验收**：
- 结束工单 → 工单状态变 `completed`，S01 已结束 tab 出现「已完成」徽标
- 转回 AI → 工单状态变 `resolved`，S01 已结束 tab 出现「转回AI」蓝色徽标，C01 收到 AI 接管消息

`user_gate: true`

---

### P5 · Bad Case 标注

**依赖**：P3

**后端交付物**：
- `POST /api/v1/tickets/{ticket_id}/bad-case` 路由，写 `bad_cases` 表

**验收**：
```bash
curl -X POST http://localhost:8199/api/v1/tickets/T001/bad-case \
  -d '{"agent_id":"A001","note":"回复有误"}'
# 预期：200，marked_at 不为空
```

`user_gate: true`

---

### P6 · 知识库管理（A02）

**依赖**：B0, B2

**后端交付物**：
- `pycore/services/knowledge_service.py`：
  - 上传：接收 `.md` 文件 → 写 `documents` 表（status=processing）→ 后台异步执行 4 步 pipeline（切片 → Chroma 向量化 → 元数据提取 → QA 提取）
  - 无 Chroma 时降级：仅切片 + 关键词索引
- `GET /api/v1/knowledge/documents`（含筛选/搜索/排序）
- `POST /api/v1/knowledge/documents`（上传）
- `DELETE /api/v1/knowledge/documents/{doc_id}`
- `GET /api/v1/knowledge/documents/{doc_id}/status`（进度轮询）

**前端切换**：
- A02 `VITE_USE_MOCK=false`
- 上传后每 2s 轮询 `/status` 接口，更新进度条

**验收**：
```bash
# 上传文件
curl -X POST http://localhost:8199/api/v1/knowledge/documents \
  -F "file=@test.md" -F "category=保养"
# 预期：返回 doc_id，status=processing

# 查进度
curl http://localhost:8199/api/v1/knowledge/documents/{doc_id}/status
# 预期：steps[0].status=done，steps[1].status=running 或 done
```

`user_gate: true`

---

### P7 · RAG 知识检索接入 AI Pipeline

**依赖**：P1, P6

**目标**：P1 中「高置信度 → 知识检索」部分从 Chroma 真实检索，而非 Mock 回复。

**后端交付物**：
- `pycore/services/retrieval_service.py`：
  - Chroma 向量检索（Top-20 候选）→ bge-reranker-v2-m3 Rerank → 精选 Top-5
  - SQLite 历史 QA 关键词匹配
  - Mock 车型/门店结构化查询（调 `/api/v1/mock/*`）
  - 三路合并排序，拼入 LLM Prompt
- 接入 `chat_service.py` 的高置信度分支

**验收**（需真实 LLM Key）：
```bash
# 上传知识文档后
curl -X POST http://localhost:8199/api/v1/chat/message \
  -d '{"session_id":"rag-test","message":"极氪001保养周期是多久"}'
# 预期：reply 内容来自上传的保养文档
```

> 若 `LLM_API_KEY` 未提供：Tester 报告标注「RAG 真实 LLM 未验收，Mock 模式通过」

`user_gate: true`

---

### P7b · RAG Pipeline 升级

**依赖**：P7

**目标**：将 P7 的 MVP RAG 升级为生产级混合检索 Pipeline。

**后端交付物**：
- Qwen Embedding：文档入库时生成向量并写入 Chroma。
- BM25Plus：维护 `data/chroma/bm25_store.json`，作为中文关键词召回后备。
- RRF 融合：合并向量召回与 BM25 召回结果。
- Qwen Reranker：对候选片段精排，返回 Top-5 拼入 LLM Prompt。
- 降级链路：Embedding / Reranker / Chroma 不可用时，自动退回 BM25、历史 QA 或结构化数据，不抛 500。

**状态**：`.sdd/tasks.json` 标记为 `passed`，E1 需要做最终回归覆盖。

`user_gate: false`

---

### P8 · 坐席 AI 建议回复

**依赖**：P7

**目标**：将 S01 坐席工作台的 AI 建议回复从静态 Mock 文案切换为 LLM 基于工单上下文实时生成。

**后端交付物**：
- `POST /api/v1/tickets/{ticket_id}/suggest`
- `pycore/services/suggest_service.py`
- 复用 RAG 检索结果，将相关知识片段拼入建议生成 Prompt。

**前端切换**：
- `frontend/src/services/agentService.ts` 新增建议接口调用。
- S01 接单后加载真实建议；`USE_MOCK=true` 时保留原 Mock 路径。
- 建议加载中和空建议状态不阻塞坐席工作流。

**状态**：`.sdd/tasks.json` 标记为 `passed`；E1 已确认真实接口被调用且建议不是静态 Mock 文案。

`user_gate: true`

---

## 阶段四：E2E 回归 + 交付（E1–E2）

### E1 · 完整链路 E2E 回归

**目标**：跑通 PRD Demo 脚本 3 个场景，并覆盖 P7b/P8 的最终回归。
**状态**：`passed`。首轮发现 4 个问题，修复后第二轮回归通过；报告见 `.sdd/test-reports/test-E1.md`，Bug 闭环见 `.sdd/bug-logs/E1.md`。

**场景 1**：C01 → 车型咨询 → AI 回复 → 快捷按钮「试驾预约」→ AI 引导
**场景 2**：C01 → 底盘异响 → 3 次未匹配 → 自动转人工 → S02 看到工单 → S01 接单 → 发消息 → 用户端收到 → 结束工单
**场景 3**：C01 → 负面情绪「这车太垃圾了」→ 高优先级工单 → S01 接单 → AI 建议生成 → 转回 AI

**验收**：3 个场景均完整跑通，无 console error，WebSocket 不断连；网络面板无 Mock 路径；S01 建议接口真实调用；RAG 回复能命中知识库内容。

`user_gate: true`

---

### E2 · startup.md

**目标**：输出可独立启动的环境文档。
**状态**：`passed`。文档已生成，8199 后端健康检查、首条对话、5175 `/chat` 页面入口均已 smoke 通过；报告见 `.sdd/test-reports/test-E2.md`。

**交付物**：`docs/startup.md`，包含：
- 环境要求（Python 3.13.5+, Node 18+）
- 安装命令（pip install / npm install）
- `.env` 配置说明（字段名 + 缺省值）
- 启动命令（后端 `8199` / 前端 `5175`）
- 验证步骤（健康检查 + 首条对话）
- Mock 模式说明（无 Key 时如何运行）

`user_gate: false`

---

## 任务总览

| ID | 名称 | 类型 | 依赖 | 用户门禁 | 当前状态 |
|----|------|------|------|---------|----------|
| F0 | 前端脚手架 | 前端基础 | — | 否 | passed |
| F1 | C01 客户端对话页 Mock | 前端 | F0 | 否 | passed |
| F2 | S02 当前对话列表 Mock | 前端 | F0 | 否 | passed |
| F3 | S01 坐席工作台 Mock | 前端 | F0 | 否 | passed |
| F4 | A02 知识库管理 Mock | 前端 | F0 | 否 | passed |
| GATE-MOCK | Mock UI 用户门禁 | 门禁 | F1-F4 | 是 | passed |
| B0 | FastAPI + SQLite | 后端基础 | — | 否 | passed |
| B1 | Mock 数据 API | 后端基础 | B0 | 否 | passed |
| B2 | LLM 客户端封装 | 后端基础 | — | 否 | passed |
| P1 | AI 对话 Pipeline | 功能 | B0,B1,B2 | 是 | passed |
| P2 | 工单创建 + S02 列表 | 功能 | P1 | 是 | passed |
| P3 | 坐席接单 + 实时消息 | 功能 | P2 | 是 | passed |
| P4 | 结束工单 + 转回 AI | 功能 | P3 | 是 | passed |
| P5 | Bad Case 标注 | 功能 | P3 | 是 | passed |
| P6 | 知识库管理 | 功能 | B0,B2 | 是 | passed |
| P7 | RAG 知识检索 | 功能 | P1,P6 | 是 | passed |
| P7b | RAG Pipeline 升级 | 功能 | P7 | 否 | passed |
| P8 | 坐席 AI 建议回复 | 功能 | P7 | 是 | passed |
| E1 | E2E 回归 | 验收 | P1-P8 | 是 | passed |
| E2 | startup.md | 交付 | E1 | 否 | passed |

---

## 外部依赖确认状态

| 依赖 | Key/账号 | 状态 | 缺失降级策略 |
|------|---------|------|------------|
| LLM（硅基流动 · Qwen3-32B） | 用户已确认持有，写入 `.env` | ✅ 已确认 | — |
| Embedding（通义千问） | 同上，硅基流动同 Key | ✅ 已确认 | — |
| SQLite | 本地文件 | ✅ 无需配置 | — |
| Chroma | 本地持久化 | ✅ pip 安装 | 降级为关键词检索 |
| Redis | 本地 Docker | ❌ V1 不使用 | 直接内存缓存 |

---

**文档状态**：Plan V1 收口版（2026-06-23 21:35 CST）
**下一步**：如需继续交付，做 Git/发布卫生；当前无在途 `.sdd` 开发任务。
