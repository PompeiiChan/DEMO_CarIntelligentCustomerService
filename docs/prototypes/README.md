# 汽车智能客服系统 - V1 MVP 原型

## 原型说明

本原型目录包含**汽车智能客服系统 V1 MVP**的HTML原型，用于设计验证和用户确认。

**设计规范**：Apple App Style（去品牌化）
**主色调**：#0066CC（蓝色）
**后端技术**：LangGraph Agent状态机

---

## 页面清单

### ✅ 已完成原型（4个）

| 页面 | 文件名 | 类型 | 尺寸 | 说明 |
|------|--------|------|------|------|
| C01 客户端对话页 | [C01-客户端对话页.html](C01-客户端对话页.html) | 移动端H5 | 390×844 | 用户与AI/人工客服对话，包含极简Logo（抽象汽车+蜿蜒公路） |
| S01 坐席工作台 | [S01-坐席工作台.html](S01-坐席工作台.html) | 桌面Web | 1440×900 | 三栏布局，坐席接手对话、查看AI历史、转回AI |
| S02 当前对话列表 | [S02-当前对话列表.html](S02-当前对话列表.html) | 桌面Web | 1440×900 | 待接手对话列表，支持场景/情绪筛选 |
| D01 Agent调试页 | [D01-Agent调试页.html](D01-Agent调试页.html) | 桌面Web | 1440×900 | 两栏布局，左侧历史对话、右侧Agent节点流转状态 |

### 🚧 待添加原型（3个）

| 页面 | 文件名 | 类型 | 尺寸 | 说明 |
|------|--------|------|------|------|
| A02 Markdown知识库管理 | A02-Markdown知识库管理.html | 桌面Web | 1440×900 | 两栏布局，文档列表+预览区 |
| A03 意图配置页 | A03-意图配置页.html | 桌面Web | 1440×900 | 意图树+配置区 |
| A05 坐席账号管理 | A05-坐席账号管理.html | 桌面Web | 1440×900 | 坐席列表表格 |

---

## 设计 Token

```css
:root {
  /* 品牌 Token */
  --brand-primary: #0066CC;
  --brand-primary-pressed: #0052a3;

  /* 对话 Token */
  --chat-user-bubble-bg: #0066CC;
  --chat-ai-bubble-bg: #ffffff;

  /* Agent节点 Token */
  --agent-node-success: #34c759;
  --agent-node-running: #0071e3;
  --agent-node-failed: #ff3b30;

  /* Apple App Style Token */
  --app-bg: #f5f5f7;
  --app-surface: #ffffff;
  --app-text: #1d1d1f;
  --app-text-secondary: #6e6e73;
  --app-separator: rgba(60, 60, 67, 0.16);
  --app-accent: #0071e3;
  --app-success: #34c759;
  --app-danger: #ff3b30;
  --app-radius-control: 10px;
  --app-radius-card: 16px;
}
```

---

---

## 核心组件

### 客户端专用
- **ChatWindow**：悬浮对话窗口
- **MessageBubble**：对话消息气泡（用户蓝色右对齐/AI白色左对齐）
- **QuickActionButton**：快捷操作按钮

### 坐席端专用
- **AgentToolbar**：坐席工作台工具栏
- **ConversationPreview**：对话预览卡片
- **ContextPanel**：上下文面板（显示AI对话历史）

### 调试端专用
- **ConversationList**：历史对话列表
- **NodeFlowList**：Agent节点流转列表
- **NodeDetailCard**：节点详情卡片（JSON代码展示）

### 通用组件（Apple App Style）
- **AppShell**：应用外壳（sidebar + toolbar + content）
- **SidebarNav**：侧边栏导航
- **ListRow**：列表行
- **DataTable**：数据表格
- **Button**：按钮
- **SearchField**：搜索框
- **StatusBadge**：状态标签
- **EmptyState**：空状态
- **LoadingState**：加载状态
- **ErrorState**：错误状态

---

## 使用说明

### 查看原型
1. 打开 [index.html](index.html) 查看原型总览
2. 点击各页面的"查看原型"按钮查看具体页面
3. 或直接打开对应的HTML文件

### 浏览器兼容
- 推荐使用Chrome、Edge、Safari最新版本
- 支持暗黑模式（自动适配）

---

## 后续步骤

1. ✅ 用户确认原型
2. ⏭ 进入阶段 C：PRD定稿 + api-contracts.md + Plan.md
3. ⏭ 开发阶段：前端实现、后端LangGraph实现

---

**原型版本**：V1 MVP
**最后更新**：2025-06-09
**Design Spec**：[.sdd/tmp/ui-design-spec.md](../../.sdd/tmp/ui-design-spec.md)
**PRD**：[docs/PRD.md](../../docs/PRD.md)