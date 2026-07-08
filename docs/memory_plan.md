## Pi Memory 凝练方案（v2：全局 + 项目两级）

### 0. 设计要点

- **两级存储**：全局 `~/.pi/agent/`（跨项目通用）+ 项目 `<project>/.pi/`（当前项目专属）。
- **两个记忆文件**：`agent.md`（Agent 自进化经验，全局）与 `memory.md`（项目记忆，项目级）。
- **不替换原生工具**：稳定记忆用 pi 原生 `write`/`edit`；事件日志用专用 `memory_log` 追加工具。
- **无审批流程**：consolidate 自动写入稳定文件并通过通知告知用户，不再经过 write/edit 的 Y/N/A 审批。
- **扩展全局安装**：memory 扩展放 `~/.pi/agent/extensions/`，规避 pi 项目信任门控。

---

### 1. 目录结构

```text
全局目录
~/.pi/agent
├── rules.md              # 全局硬规则，人工写，只读
├── agent.md              # 全局 Agent 自进化记忆
└── extensions
    └── memory.ts         # 全局 memory 扩展

项目目录
<project>/.pi
├── memory.md             # 当前项目长期记忆
├── events
│   ├── pending
│   └── processed
└── runtime
    └── threads
        └── <thread-id>.json
```

> 项目目录下不再拆分 `memories/`、`profile/`、`facts/` 等多目录，统一收敛为单个 `memory.md`，降低维护成本。
> `rules.md` 与 `agent.md` 放在全局，使跨项目 Agent 经验与硬规则一次维护、处处生效。

---

### 2. 记忆分层

```text
短期记忆：
<project>/.pi/runtime/threads/<thread-id>.json
```
保存：当前线程状态、任务进度、临时上下文摘要、未完成 todo。线程结束后删除或过期清理。

```text
长期记忆：
~/.pi/agent/agent.md          # 跨项目 Agent 经验
<project>/.pi/memory.md       # 当前项目记忆
```
保存：项目背景、技术栈、历史决策、项目 facts、历史摘要、Agent 自进化经验。

---

### 3. 职责划分

```text
~/.pi/agent/rules.md
= 你手写的全局硬约束
= Agent 不允许自动修改（只读）

~/.pi/agent/agent.md
= Agent 自进化记忆
= 记录跨项目通用经验
= 修改需要审批

<project>/.pi/memory.md
= 当前项目记忆
= 项目背景、技术栈、历史决策、项目 facts、项目摘要

<project>/.pi/events/**
= 对话中轻量追加的事件日志

<project>/.pi/runtime/**
= 当前线程短期记忆
```

与 pi 原生的关系：

```text
<project>/AGENTS.md     -> pi 原生项目指令，始终自动加载（固定开发规范）
~/.pi/agent/rules.md    -> 全局硬规则，人工维护；memory 扩展负责读取并注入，但不能修改（扩展未加载时不生效）
~/.pi/agent/agent.md    -> 本方案的全局 Agent 经验，由 memory 扩展注入
<project>/.pi/memory.md -> 本方案的项目记忆，由 memory 扩展注入
```

> 重叠提示：固定的"怎么做事"规则优先放根 `AGENTS.md`（pi 已自动加载）；`agent.md` 只放 Agent 在对话中**新学到**的跨项目经验，避免与根 `AGENTS.md` 重复。

---

### 4. memory.md 内容模板

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

### 5. agent.md 内容模板

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

---

### 6. 工具接口

> **安装位置：** memory 扩展必须全局安装到 `~/.pi/agent/extensions/memory.ts`，以规避 pi 的项目信任门控（未信任项目的项目级扩展不加载，memory 会失效）。

采用 **pi 原生 `write`/`edit` + 一个轻量 `memory_log` 追加工具**，不替换原生 write/edit：

- 稳定记忆（`memory.md` / `agent.md`）由 consolidate 自动写入并 `ctx.ui.notify()` 通知用户，不再走 write/edit 审批。
- 事件日志 `<project>/.pi/events/**` 需要 append 语义，原生 `write` 为整文件覆盖，故注册专用追加工具：

```typescript
pi.registerTool({
  name: "memory_log",
  description: "Append an event to the pending memory log (append-only)",
  parameters: {
    type: "object",
    properties: {
      content: { type: "string" },
      type: { type: "string", enum: ["preference","fact","project","agent","history"] },
      scope: { type: "string", enum: ["user","agent","project"] },
      confidence: { type: "number" },
    },
    required: ["content","type","scope"],
  },
  execute: async (args, ctx) => {
    // append to <project>/.pi/events/pending/<date>-<thread-id>.md
  },
});
```

权限边界（**软约束**，靠约定 + 工具设计保证，不再强制 gate）：

```text
Agent 主要写：
<project>/.pi/events/**      # 仅通过 memory_log 追加

Agent 审批后写（pi 原生确认提示）：
<project>/.pi/memory.md
~/.pi/agent/agent.md         # consolidate 时写入

扩展内部写（Agent 默认不主动读写）：
<project>/.pi/runtime/**     # 由 memory 扩展维护短期状态

用户人工写（Agent 禁止写）：
~/.pi/agent/rules.md

允许读：
~/.pi/agent/rules.md
~/.pi/agent/agent.md
<project>/.pi/memory.md
<project>/.pi/events/**
<project>/.pi/runtime/**
```

> **安全说明：** 原生 `write` / `bash` 均无路径 gate，Agent 理论上可越过矩阵写 `rules.md`。
> 若要硬保护 rules，须在扩展里额外守卫 `bash`（拦截对 `~/.pi/agent/rules.md` 的写），或依赖 pi "审阅每个 diff" 原则。

---

### 7. 加载策略

采用：

```text
核心自动（静态注入） + 长尾按需（动态召回）
```

`session_start` 阶段没有 user input，不能依赖 user_input 做 relevance 召回。注入分为三层，利用不同的 pi 扩展钩子：

#### 静态基底注入（resources_discover）

```text
resources_discover（session_start 后自动触发）：
  - 返回 skillPaths 或 promptPaths，指向 memory 内容文件
  - pi 自动将其加载到 _baseSystemPrompt，持久存在，不受 override 生命周期影响
  - 适用于：rules.md、agent.md、memory.md 等稳定核心记忆
```

#### 每轮 prompt 开头更新（before_agent_start）

```text
before_agent_start（每轮 prompt 的第一轮 LLM 调用前触发）：
  - 返回 { systemPrompt: <完整 system prompt + <Memory> 块> }
  - 用于拼装静态核心记忆 + 最近事件摘要，形成当前轮次的 Memory 块
  - 注意：_systemPromptOverride 在该 prompt 结束后被清除，因此每轮 prompt 都需要重新注入
  - 适用于：<Memory> 块的动态拼接（Rules + Project Memory + Agent Memory + Recent History）
```

#### 每轮 LLM 调用前动态召回（context）

```text
context（每次 LLM 调用前触发，包括同一 prompt 内的中间工具轮次）：
  - 返回 { messages: <修改后的 messages 数组> }
  - 根据当前 user input / 最新消息检索 memory.md 相关 section（Facts / Decisions）或 events/processed/**
  - 在 messages 中插入相关记忆上下文（作为 system/user 消息或提示块）
  - 实现动态 recall，替代不可用的 turn_start 返回值
  - 若 context 注入成本过高，降级为 Agent 按需 read <project>/.pi/memory.md
```

#### 分层关系

| 层 | 钩子 | 注入位置 | 生命周期 | 职责 |
|----|------|---------|---------|------|
| 基底 | `resources_discover` | `_baseSystemPrompt` | 整个 session | rules / 固定项目背景 |
| 轮次 | `before_agent_start` | `_systemPromptOverride` | 单次 prompt | <Memory> 块拼接 |
| 动态 | `context` | messages 数组 | 每次 LLM 调用 | 按需召回 / fact 注入 / score = confidence × decay(age) 排序截断 |

输出格式：

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
```

---

### 8. 写入策略

对话过程中只轻量追加（落 pending，整合后迁移到 processed）：

```text
<project>/.pi/events/pending/<date>-<thread-id>.md
```

事件格式：

```md
## <timestamp>

type: preference | fact | project | agent | history
scope: user | agent | project
confidence: 0.8
source: conversation

content:
- ...
```

稳定记忆不在对话中直接改。

events/pending/ 写入后即刻纳入 context 钩子的检索范围（关键词 grep），无需等待 consolidate。

---

### 9. 后台整合（consolidate）

实现一个命令（pi 斜杠命令为单 token，多词用连字符）：

```bash
pi memory-consolidate
```

处理流程：

```text
读取 <project>/.pi/events/pending/**
抽取候选记忆
去重 / 合并
生成新内容
自动写入稳定文件（memory.md / agent.md）
ctx.ui.notify() 通知用户写入完成
将事件文件从 pending/ 迁移到 processed/
```

去重规则：

```text
精确匹配：content + type 完全一致 → 保留最新一条
模糊合并：同 topic 的事件（topic 由 type + content 摘要提取）
          → confidence 取 max，timestamp 取最新
冲突解决：同一 topic 下不同事实 → 保留高 confidence 值，
          同 confidence 保留最新 timestamp
```

自动触发策略：

```text
- events/pending/ 文件数 >= 5 时自动触发一次 consolidate
- 每次 dialog 结束时检查条件，满足则异步执行
- memory-consolidate 命令仍可手动触发
```

consolidate 后写入目标：

```text
~/.pi/agent/agent.md        # 跨项目 Agent 经验
<project>/.pi/memory.md     # 项目记忆
```

---

### 10. Human-in-the-Loop

```text
~/.pi/agent/rules.md 禁止 Agent 写入，只能用户人工修改。
memory.md / agent.md 由 consolidate 自动写入并通知，不再走审批。
```

---

### 11. 并发与一致性

采用：

```text
单文件 + 异步写入队列 + 原子替换
```

实现：

```text
MemoryWriteQueue
  -> debounce 1~3 秒
  -> 按 path 合并
  -> 写入临时文件
  -> rename 原子替换（仅 agent.md / memory.md 稳定写入时）
```

事件日志走 `memory_log` append，天然追加、不覆盖。

---

### 12. 禁止进入 Memory 的内容

不保存：

```text
工具调用全过程 / 文件上传原文 / 大段日志 / 临时代码输出
完整 shell 输出 / 中间推理链路 / 无复用价值的上下文碎片
```

只保存：

```text
偏好 / 结论 / 事实 / 项目决策 / 稳定规则 / 可复用经验
```

---

### 13. 实现优先级

#### v0.1：文件型 Memory

```text
<project>/.pi/memory.md
<project>/.pi/events/**
<project>/.pi/runtime/threads/**
~/.pi/agent/agent.md
~/.pi/agent/extensions/memory.ts
```

能力：

```text
启动自动加载核心 memory（rules + agent + AGENTS.md + memory）
运行时注入 memory block
对话中追加 events（memory_log）
Agent 写边界：memory_log 追加事件；稳定记忆经 pi 原生 write/edit 审批后写；runtime 由扩展内部维护
```

#### v0.2：结构化与召回（**必需**：控制注入长度、避免上下文溢出、按需召回相关记忆）

```text
build_memory_block() / dynamic_memory_recall()
token budget 截断（精排，按 relevance/confidence/recency 排序后截断）
按 topic / keyword 检索 memory.md 与 events/processed/
```

#### v0.3：整合与审批

```text
pi memory-consolidate
事件日志去重合并
稳定记忆写入（pi 原生确认即审批）
原子写入
```

#### v0.4：检索增强（无数据库）

```text
按 path 检索（固定路径直接 pi 原生 read）
按 keyword 检索（对 *.md 轻量 grep / ripgrep）
长尾 memory 按需读取
```

---

## 安全边界说明

本方案默认是**轻量个人本地版**，不提供强沙箱。安全边界依赖：
- `memory_log` 的受控追加（事件日志只能 append，不能覆盖）；
- `rules.md` 由硬规则保护（扩展守卫 + 人工维护）。

它**不能**真正阻止 Agent 通过 `bash` 写 `rules.md` 等受保护路径——那需要额外守卫 `bash` 或依赖用户审阅。不要将其当作强隔离方案。

## 最终方案一句话

```text
Pi Memory = 全局 rules.md + 全局 agent.md + 项目 memory.md
+ memory_log 事件追加 + session_start 核心注入 + 按需读取长尾记忆
+ memory-consolidate 后台整合 + 自动写入通知。
```
