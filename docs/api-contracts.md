# API 接口契约

**项目**：汽车智能客服系统 auto-cs
**版本**：V1 MVP
**最后更新**：2025-06-09
**基础路径**：`http://localhost:8000`

---

## 0. 全局约定

### 0.1 统一响应格式

```json
// 成功
{ "code": 200, "message": "success", "data": { ... } }

// 错误
{ "code": <错误码>, "message": "<错误描述>", "data": null }

// 分页
{ "code": 200, "message": "success", "data": { "items": [...], "total": 100, "page": 1, "page_size": 20 } }
```

### 0.2 HTTP 状态码

| 状态码 | 含义 |
|--------|------|
| 200 | 成功 |
| 400 | 参数错误 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

### 0.3 身份标识（V1 Mock）

- **用户端**：无需登录，前端生成 `session_id`（UUID），每次会话传入请求体
- **坐席端**：固定 Mock 坐席，`agent_id = "A001"`，`agent_name = "张三"`，无需登录

### 0.4 实时通信

- **AI 流式回复**：WebSocket，路径 `/ws/chat/{session_id}`
- **坐席实时推送**：WebSocket，路径 `/ws/agent/{agent_id}`

---

## 1. 对话接口（C01）

### 1.1 发送消息

用户发送消息，触发 AI Pipeline（情绪识别 → 意图识别 → 知识检索 → 回复生成）。

**HTTP 版本**（简单场景/降级）

```
POST /api/v1/chat/message
```

**请求体**

```json
{
  "session_id": "uuid-string",
  "message": "我的车底盘异响"
}
```

**响应体**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "reply": "请问您的车型是？",
    "session_id": "uuid-string",
    "intent": "维修咨询",
    "intent_confidence": 0.85,
    "emotion": "neutral",
    "emotion_score": 0.12,
    "need_human": false,
    "ticket_id": null,
    "round": 2
  }
}
```

**转人工时响应体**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "reply": "抱歉暂未找到匹配方案，已为您转接人工客服，请稍候。",
    "session_id": "uuid-string",
    "intent": "维修咨询",
    "intent_confidence": 0.32,
    "emotion": "negative",
    "emotion_score": 0.72,
    "need_human": true,
    "ticket_id": "T20250609001",
    "transfer_reason": "情绪负面",
    "queue_position": 1,
    "round": 4
  }
}
```

**字段说明**

| 字段 | 类型 | 说明 |
|------|------|------|
| `intent` | string | 意图分类：`车型咨询/价格咨询/试驾预约/维修咨询/故障排查/保养咨询/其他` |
| `intent_confidence` | float | 意图置信度 0~1 |
| `emotion` | string | `positive/neutral/negative` |
| `emotion_score` | float | 负面情绪概率 0~1，>0.6 触发转人工 |
| `need_human` | bool | 是否触发转人工 |
| `ticket_id` | string\|null | 转人工时创建的工单号 |
| `transfer_reason` | string | 转人工原因：`连续3次未匹配/情绪负面/用户要求/复杂场景` |
| `queue_position` | int | 排队位置（转人工时） |
| `round` | int | 当前对话轮次 |

---

### 1.2 WebSocket 流式对话

**连接**

```
WS /ws/chat/{session_id}
```

**客户端发送（JSON）**

```json
{ "message": "我的车底盘异响" }
```

**服务端推送消息类型**

```json
// 流式文字片段
{ "type": "delta", "content": "请问" }
{ "type": "delta", "content": "您的" }
{ "type": "delta", "content": "车型是？" }

// 流式结束 + 完整元数据
{
  "type": "done",
  "data": {
    "reply": "请问您的车型是？",
    "intent": "维修咨询",
    "intent_confidence": 0.85,
    "emotion": "neutral",
    "emotion_score": 0.12,
    "need_human": false,
    "ticket_id": null,
    "round": 2
  }
}

// 转人工通知
{
  "type": "transfer",
  "data": {
    "ticket_id": "T20250609001",
    "transfer_reason": "情绪负面",
    "queue_position": 1,
    "reply": "抱歉暂未找到匹配方案，已为您转接人工客服，请稍候。"
  }
}

// 坐席消息（人工接入后推送给客户）
{
  "type": "agent_message",
  "data": {
    "agent_name": "张三",
    "content": "您好！我是客服张三，请问怎么帮您？",
    "timestamp": "2025-06-09T12:03:00Z"
  }
}

// 错误
{ "type": "error", "message": "服务暂时不可用" }
```

---

### 1.3 获取会话历史

```
GET /api/v1/chat/session/{session_id}
```

**响应体**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "session_id": "uuid-string",
    "round": 4,
    "status": "ai_serving | waiting_human | human_serving | closed",
    "ticket_id": null,
    "history": [
      {
        "role": "assistant",
        "content": "您好！我是智能汽车客服，请问有什么可以帮助您？",
        "intent": null,
        "timestamp": "2025-06-09T12:00:00Z"
      },
      {
        "role": "user",
        "content": "我的车底盘异响",
        "intent": "维修咨询",
        "timestamp": "2025-06-09T12:01:00Z"
      }
    ]
  }
}
```

---

## 2. 工单接口（S01 / S02）

### 2.1 获取工单列表

S02 待接手队列。

```
GET /api/v1/tickets?status=pending&category=售后&sort=wait_time_desc&page=1&page_size=20
```

**Query 参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `status` | string | `pending/processing/completed`，不传返回全部 |
| `category` | string | `售前/售后`，筛选分类 |
| `emotion` | string | `negative`，仅看负面情绪工单 |
| `sort` | string | `wait_time_desc`（等待最久）/ `priority_desc`（优先级）/ `created_asc`（创建时间） |
| `page` | int | 默认 1 |
| `page_size` | int | 默认 20 |

**响应体**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "items": [
      {
        "ticket_id": "T20250609003",
        "session_id": "uuid-string",
        "status": "pending",
        "priority": "high",
        "category": "售后",
        "emotion": "negative",
        "transfer_reason": "情绪负面",
        "preview": "这车太垃圾了，刚买两个月就出问题",
        "wait_seconds": 50,
        "round": 2,
        "created_at": "2025-06-09T09:58:00Z"
      }
    ],
    "total": 4,
    "page": 1,
    "page_size": 20
  }
}
```

---

### 2.2 获取工单详情

```
GET /api/v1/tickets/{ticket_id}
```

**响应体**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "ticket_id": "T20250609001",
    "session_id": "uuid-string",
    "status": "processing",
    "priority": "high",
    "category": "售后",
    "emotion": "neutral",
    "transfer_reason": "连续3次未匹配",
    "preview": "极氪 001 底盘异响，低速嗡嗡声",
    "wait_seconds": 80,
    "round": 5,
    "agent_id": "A001",
    "created_at": "2025-06-09T12:00:00Z",
    "assigned_at": "2025-06-09T12:01:00Z",
    "resolved_at": null,
    "completed_at": null,
    "history": [
      { "role": "user", "content": "我的车底盘异响", "timestamp": "2025-06-09T12:01:00Z" },
      { "role": "assistant", "content": "请问您的车型是？", "timestamp": "2025-06-09T12:01:05Z" }
    ]
  }
}
```

---

### 2.3 坐席接单

```
PATCH /api/v1/tickets/{ticket_id}/assign
```

**请求体**

```json
{ "agent_id": "A001" }
```

**响应体**

```json
{
  "code": 200,
  "message": "接单成功",
  "data": {
    "ticket_id": "T20250609001",
    "status": "processing",
    "agent_id": "A001",
    "assigned_at": "2025-06-09T12:01:30Z"
  }
}
```

---

### 2.4 结束工单

```
PATCH /api/v1/tickets/{ticket_id}/resolve
```

**请求体**

```json
{ "agent_id": "A001" }
```

**响应体**

```json
{
  "code": 200,
  "message": "工单已完成",
  "data": {
    "ticket_id": "T20250609001",
    "status": "completed",
    "completed_at": "2025-06-09T12:08:00Z",
    "processing_duration": 390
  }
}
```

---

### 2.5 转回 AI

```
PATCH /api/v1/tickets/{ticket_id}/transfer-ai
```

**请求体**

```json
{ "agent_id": "A001" }
```

**响应体**

```json
{
  "code": 200,
  "message": "已转回AI客服",
  "data": {
    "ticket_id": "T20250609001",
    "status": "resolved",
    "resolved_at": "2025-06-09T12:06:00Z"
  }
}
```

---

### 2.6 坐席 AI 建议回复

```
POST /api/v1/tickets/{ticket_id}/suggest
```

**请求体**

```json
{ "agent_id": "A001" }
```

**响应体**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "suggestions": [
      "建议1：先安抚用户情绪，并确认车辆问题发生的时间、地点和具体表现。",
      "建议2：如涉及安全或无法继续行驶，引导用户优先联系道路救援或就近服务中心。",
      "建议3：根据知识库内容补充保修、维修预约或后续跟进说明。"
    ]
  }
}
```

**说明**

- 建议内容由 LLM 基于工单历史消息和 RAG 检索结果生成。
- `LLM_API_KEY` 缺失或服务异常时返回空数组或降级建议，不抛 500。
- 兼容旧路径 `GET /api/v1/tickets/{ticket_id}/suggestions`，但前端真实联调默认使用本 POST 接口。

---

## 3. 坐席消息接口（S01）

### 3.1 坐席发送消息

```
POST /api/v1/tickets/{ticket_id}/messages
```

**请求体**

```json
{
  "agent_id": "A001",
  "content": "您好！我是客服张三，已查看了您的问题。"
}
```

**响应体**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "message_id": "msg-uuid",
    "ticket_id": "T20250609001",
    "content": "您好！我是客服张三，已查看了您的问题。",
    "timestamp": "2025-06-09T12:03:00Z"
  }
}
```

---

### 3.2 WebSocket 坐席实时推送

**连接**

```
WS /ws/agent/{agent_id}
```

**服务端推送消息类型**

```json
// 新工单通知（有新的 pending 工单）
{
  "type": "new_ticket",
  "data": {
    "ticket_id": "T20250609003",
    "priority": "high",
    "category": "售后",
    "emotion": "negative",
    "preview": "这车太垃圾了",
    "wait_seconds": 50
  }
}

// 用户发来新消息（人工服务中）
{
  "type": "user_message",
  "data": {
    "ticket_id": "T20250609001",
    "content": "好的，我在浦东这边",
    "timestamp": "2025-06-09T12:04:00Z"
  }
}
```

---

## 4. Bad Case 接口

### 4.1 标注 Bad Case

```
POST /api/v1/tickets/{ticket_id}/bad-case
```

**请求体**

```json
{
  "agent_id": "A001",
  "note": "AI 回复了错误的保养周期，应为 2 万公里"
}
```

**响应体**

```json
{
  "code": 200,
  "message": "Bad Case 已标注",
  "data": {
    "ticket_id": "T20250609001",
    "marked_at": "2025-06-09T12:05:00Z"
  }
}
```

---

## 5. 知识库接口（A02）

### 5.1 获取文档列表

```
GET /api/v1/knowledge/documents?category=保养&q=充电桩&page=1&page_size=20&sort=created_desc
```

**Query 参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `category` | string | `车型/价格/保养/维修/政策`，不传返回全部 |
| `q` | string | 按文档名称搜索 |
| `sort` | string | `created_desc`（上传时间）/ `name_asc`（名称）/ `category_asc`（分类） |
| `page` | int | 默认 1 |
| `page_size` | int | 默认 20 |

**响应体**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "items": [
      {
        "doc_id": "doc-uuid",
        "filename": "极氪全系保养周期与费用.md",
        "category": "保养",
        "status": "indexed | processing | failed",
        "chunk_count": 67,
        "qa_count": 22,
        "file_size": 24576,
        "created_at": "2025-06-06T10:00:00Z"
      }
    ],
    "total": 8,
    "page": 1,
    "page_size": 20
  }
}
```

---

### 5.2 上传文档

```
POST /api/v1/knowledge/documents
Content-Type: multipart/form-data
```

**表单字段**

| 字段 | 类型 | 说明 |
|------|------|------|
| `file` | File | `.md` 文件，最大 10MB |
| `category` | string | `车型/价格/保养/维修/政策` |

**响应体**

```json
{
  "code": 200,
  "message": "上传成功，正在处理",
  "data": {
    "doc_id": "doc-uuid",
    "filename": "新能源车充电桩安装指南.md",
    "category": "保养",
    "status": "processing",
    "file_size": 69632
  }
}
```

---

### 5.3 删除文档

```
DELETE /api/v1/knowledge/documents/{doc_id}
```

**响应体**

```json
{
  "code": 200,
  "message": "删除成功",
  "data": { "doc_id": "doc-uuid" }
}
```

---

### 5.4 查询文档处理进度

```
GET /api/v1/knowledge/documents/{doc_id}/status
```

**响应体**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "doc_id": "doc-uuid",
    "status": "processing",
    "progress_pct": 75,
    "steps": [
      { "step": 1, "name": "文档切片",  "status": "done",    "detail": "42 片段" },
      { "step": 2, "name": "向量化入库", "status": "running", "detail": "31/42" },
      { "step": 3, "name": "元数据提取", "status": "waiting", "detail": null },
      { "step": 4, "name": "QA自动提取", "status": "waiting", "detail": null }
    ]
  }
}
```

---

## 6. Mock 数据接口

### 6.1 车型列表

```
GET /api/v1/mock/cars?q=极氪
```

**响应体**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "items": [
      {
        "model": "极氪 001",
        "price_from": 269000,
        "range_km": 870,
        "type": "SUV",
        "highlights": ["800V 超快充", "26 分钟 10-80%"]
      },
      {
        "model": "极氪 007",
        "price_from": 209900,
        "range_km": 688,
        "type": "轿车",
        "highlights": ["大空间", "智能驾驶"]
      },
      {
        "model": "极氪 Mix",
        "price_from": 249900,
        "range_km": 620,
        "type": "MPV",
        "highlights": ["家用", "第二排可全平"]
      }
    ]
  }
}
```

---

### 6.2 4S 店 / 服务中心列表

```
GET /api/v1/mock/stores?city=上海
```

**响应体**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "items": [
      {
        "store_id": "S001",
        "name": "极氪浦东服务中心",
        "city": "上海",
        "address": "浦东新区张江高科技园区",
        "phone": "021-12345678",
        "hours": "09:00-18:00"
      }
    ]
  }
}
```

---

## 7. 数据结构速查

### 工单状态流转

```
pending → processing → completed
pending → processing → resolved（转回AI）
```

### 会话状态

```
ai_serving → waiting_human → human_serving → closed
ai_serving → waiting_human → human_serving → ai_serving（转回AI后重新进入）
```

### 意图分类（V1 共 6 种）

```
售前：车型咨询 / 价格咨询 / 试驾预约
售后：维修咨询 / 故障排查 / 保养咨询
其他：兜底
```

### 转人工触发条件

| 条件 | `transfer_reason` 值 |
|------|----------------------|
| 连续 3 次意图置信度 < 40% | `连续3次未匹配` |
| 负面情绪概率 > 60% | `情绪负面` |
| 用户明确要求 | `用户要求` |
| 涉及事故/投诉关键词 | `复杂场景` |

---

**文档状态**：V1 初稿
**下一步**：确认 Plan.md → 进入开发
