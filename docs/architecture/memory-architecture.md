# Pi Memory 架构设计

## 设计要点

- **两级存储**：全局 `~/.pi/agent/`（跨项目通用）+ 项目 `<project>/.pi/`（当前项目专属）。
- **三个记忆文件**：`rules.md`（全局硬规则，只读）、`agent.md`（全局 Agent 自进化经验）、`memory.md`（项目记忆）。
- **三层注入**：`resources_discover` 静态基底 → `before_agent_start` 轮次 Memory 块 → `context` 动态召回。
- **写入策略**：事件日志走 `memory_log` append-only 追加，稳定记忆由 consolidate 自动写入 + 通知。
- **部署方式**：`npm run setup-extensions` 建立 junction，`~/.pi/agent/extensions/` 指向源码 `examples/extensions/`，修改源码即时生效。

## 目录结构

```text
全局目录
~/.pi/agent
├── rules.md              # 全局硬规则，人工写，只读（bash 守卫拦截写入）
├── agent.md              # 全局 Agent 自进化记忆，consolidate 自动写入
└── extensions/           # 指向 packages/coding-agent/examples/extensions/（junction）
    ├── memory.ts         # memory 扩展
    ├── todo.ts           # 其他示例扩展
    └── plan-mode/        # ...

项目目录
<project>/.pi
├── memory.md             # 当前项目长期记忆
├── events
│   ├── pending           # 对话中追加的未处理事件（memory_log 写入）
│   └── processed         # consolidate 后迁移至此
└── runtime
    └── threads
        └── <session-id>.json  # 短期线程状态，24h 自动清理
```

## 记忆分层

```text
短期记忆（线程级）：
<project>/.pi/runtime/threads/<session-id>.json
```
保存：当前任务摘要、临时发现、未完成 todo。`turn_end` 自动保存，`before_agent_start` 注入到 system prompt。
24 小时无更新自动清理。

```text
长期记忆（跨会话）：
~/.pi/agent/agent.md          # 跨项目 Agent 经验
<project>/.pi/memory.md       # 当前项目记忆
```
保存：项目背景、技术栈、历史决策、项目 facts、历史摘要、Agent 自进化经验。

## 存储文件模板

### memory.md

```markdown
# Project Memory

## Background
（项目是什么：目标、核心模块、当前状态、业务背景）

## Tech Stack
（项目用什么：框架、语言、依赖、运行方式、构建方式）

## Decisions
（为什么这么做：架构决策、历史取舍、已踩坑、不再采用的方案）

## Facts
（长期事实，可按 confidence 标注，例如：[0.95] 用户偏好简洁中文回答）

## History Summaries
（历史会话摘要）
```

### agent.md

```markdown
# Agent Self-Evolution Memory

## Working Patterns
（通用工作模式）

## Coding Lessons
（编码经验、踩坑、可复用解法）

## Planning Lessons
（任务拆解、规划经验）

## Failure Cases
（失败案例与正确做法）

## User Interaction Lessons
（与用户协作、沟通的经验）
```

## 加载策略

三层注入，利用 pi 扩展钩子：

| 层 | 钩子 | 注入位置 | 生命周期 | 职责 |
|----|------|---------|---------|------|
| 基底 | `resources_discover` | `_baseSystemPrompt` | 整个 session | 返回 `promptPaths` 指向 rules.md / agent.md / memory.md |
| 轮次 | `before_agent_start` | `_systemPromptOverride` | 单次 prompt | 拼接 `<Memory>` 块 + `[Thread State]`，返回 `{ systemPrompt }` |
| 动态 | `context` | messages 数组 | 每次 LLM 调用 | 多源关键词召回，按 `score = confidence × decay(age)` 排序，TOKEN_BUDGET 截断 |

### 输出格式

```text
<Memory>
[Rules]
...

[Project Memory]
...

[Agent Memory]
...

[Recent History]
...
</Memory>

[Thread State]
Task: ...
Findings: ...
Todos: ...
```

## 写入策略

### 事件日志

对话过程中只轻量追加到 pending，由 `memory_log` 工具写入：

```text
<project>/.pi/events/pending/<date>-<session-id>.md
```

格式：

```md
## <timestamp>

type: preference | fact | project | agent | history
scope: user | agent | project
confidence: 0.8
source: conversation

content:
- ...
```

- 稳定记忆不在对话中直接修改。
- `events/pending/` 写入后即刻纳入 `context` 钩子的检索范围，无需等待 consolidate。

### 短期线程状态

`turn_end` 自动从 assistant 消息提取标题和待办，写入：

```text
<project>/.pi/runtime/threads/<session-id>.json
```

```json
{
  "sessionId": "abc12345",
  "updatedAt": "2026-07-08T...",
  "taskSummary": "修复 memory 扩展; 添加测试",
  "tempFindings": ["定位到缓存问题"],
  "pendingTodos": ["添加回归测试"]
}
```

24 小时无更新自动清理。

## 后台整合（consolidate）

### 触发方式

- **手动**：`/memory-consolidate` 命令
- **自动**：`turn_end` 检测 `events/pending/` 文件数 >= 5 时自动触发

### 处理流程

```text
读取 <project>/.pi/events/pending/**
抽取候选记忆
精确去重（same content + type → 保留最新 timestamp）
模糊合并（same topic + type → max confidence + 合并内容）
生成新内容
MemoryWriteQueue.enqueue() → 2s debounce → 写入 tmp 文件 → rename 原子替换
ctx.ui.notify() 通知用户写入完成
将事件文件从 pending/ 迁移到 processed/
```

### 去重规则

```text
精确匹配：content + type 完全一致 → 保留最新时间戳
模糊合并：同 topic（content 首 60 字符摘要）→ confidence 取 max，合并内容，取最新时间戳
冲突解决：同一 topic 下不同事实 → 保留高 confidence，同 confidence 保留最新
```

### 写入目标

```text
~/.pi/agent/agent.md        # 跨项目 Agent 经验
<project>/.pi/memory.md     # 项目记忆
```

## 长尾检索（memory_search）

`memory_search` 工具提供按需检索：

- 检索源：`memory.md`、`agent.md`、`events/pending/`、`events/processed/`
- 参数：`query`（关键词/主题）、`maxResults`（默认 5）
- LLM 可通过 prompt guidelines 感知该工具的存在，用于获取未在 context 中注入的长尾信息

## 工具接口

| 工具 | 描述 |
|------|------|
| `memory_log` | Append-only 事件追加到 pending/，参数 content/type/scope/confidence |
| `memory_search` | 跨所有 memory 源按关键词检索，用于长尾按需读取 |
| `/memory-consolidate` | 手动触发后台整合 |

## Human-in-the-Loop

```text
~/.pi/agent/rules.md 禁止 Agent 写入，只能用户人工修改（bash 守卫拦截）。
memory.md / agent.md 由 consolidate 自动写入并通过 ctx.ui.notify() 通知，不再走审批。
```

## 并发与一致性

```text
MemoryWriteQueue
  → 2s debounce，按 path 合并
  → 写入临时文件 *.tmp.<pid>
  → rename 原子替换（仅 agent.md / memory.md 稳定写入时）
```

事件日志走 `memory_log` append，天然追加、不覆盖。

## 安全边界

```text
本方案默认是轻量个人本地版，不提供强沙箱。安全边界依赖：
- memory_log 的受控追加（事件日志只能 append，不能覆盖）
- rules.md 由 bash 守卫保护（拦截 bash/write/edit 中对 rules.md 的写入）
- Agent 通过 write/edit 写入其他路径不受限（pi 无路径 gate）

它不能真正阻止 Agent 通过 bash 写 rules.md 以外受保护路径——那需要额外守卫或依赖用户审阅。
```
