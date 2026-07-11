# Pi Memory 架构设计

## 设计要点

- **两级存储**：全局 `~/.pi/agent/`（跨项目通用）+ 项目 `<project>/.pi/`（当前项目专属）。
- **三个记忆文件**：`rules.md`（全局硬规则，只读）、`profile.md`（全局用户画像）、`memory.md`（项目记忆 + Agent 自进化）。
- **三层注入**：`resources_discover` 静态基底 → `before_agent_start` 轮次 Memory 块 → `context` 动态召回。
- **写入策略**：事件日志走 `memory_log` append-only 追加，稳定记忆由 consolidate 自动写入 + 原子替换。
- **并发保护**：consolidate 使用 `proper-lockfile` 防止多会话并发覆盖。
- **字符上限**：memory.md 8k/12k（软/硬），profile.md 3k/5k（软/硬），超硬上限熔断 + 备份。
- **部署方式**：`npm run setup-extensions` 建立 junction，`~/.pi/agent/extensions/` 指向源码 `examples/extensions/`，修改源码即时生效。

## 目录结构

```text
全局目录
~/.pi/agent
├── rules.md              # 全局硬规则，人工写，只读（bash 守卫拦截写入）
├── profile.md            # 全局用户画像（偏好、习惯、风格），consolidate 自动写入
├── agent.md              # [已迁移] 内容已合并到 memory.md + profile.md
├── .agent.md.migrated    # 迁移标记文件
└── extensions/           # 指向 packages/coding-agent/examples/extensions/（junction）
    ├── memory.ts         # memory 扩展
    ├── todo.ts           # 其他示例扩展
    └── plan-mode/        # ...

项目目录
<project>/.pi
├── memory.md             # 当前项目长期记忆 + Agent 自进化经验
├── events
│   ├── pending           # 对话中追加的未处理事件（memory_log 写入）
│   ├── processed         # consolidate 后迁移至此
│   └── .consolidate.lock # consolidate 锁文件（proper-lockfile）
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
~/.pi/agent/profile.md        # 全局用户画像
<project>/.pi/memory.md       # 项目记忆 + Agent 自进化经验
```
保存：项目背景、技术栈、历史决策、项目 facts、历史摘要、Agent 自进化经验、用户偏好。

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

## Agent Self-Evolution
（Agent 跨项目通用经验：编码模式、规划策略、踩坑记录）

## History Summaries
（历史会话摘要）
```

### profile.md

```markdown
# User Profile

## Preferences
（用户的偏好、风格、习惯）

## Communication Style
（沟通偏好）

## Habits
（工作习惯）
```

## 加载策略

三层注入，利用 pi 扩展钩子：

| 层 | 钩子 | 注入位置 | 生命周期 | 职责 |
|----|------|---------|---------|------|
| 基底 | `resources_discover` | `_baseSystemPrompt` | 整个 session | 返回 `promptPaths` 指向 rules.md / profile.md / memory.md |
| 轮次 | `before_agent_start` | `_systemPromptOverride` | 单次 prompt | 拼接 `<Memory>` 块 + `[Thread State]`，返回 `{ systemPrompt }` |
| 动态 | `context` | messages 数组 | 每次 LLM 调用 | 多源关键词召回，按 `score = confidence × decay(age)` 排序，TOKEN_BUDGET 截断 |

### 输出格式

```text
<Memory>
[Rules]
...

[User Profile]
...

[Memory]
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

- **手动**：`/memory-consolidate` 命令（仅 append，不 rewrite）
- **自动**：`turn_end` 检测 `events/pending/` 文件数 >= 5 时自动触发

### 重写整理（Compact）

自动 consolidate 每 5 次执行一次 rewrite 模式，而非简单的 append：

```text
append 模式（默认）：新增行追加到文件末尾
rewrite 模式（每 5 次）：
  1. 解析现有文件，按 section 提取已有 bullet
  2. 去重后插入新行到对应 section（project→Facts, agent→Agent Self-Evolution）
  3. 按标准 section 顺序重组整个文件
  4. 移除孤立行（不属于任何 section 的散落内容）

profile.md 同理：新行归入 ## Preferences section
```

没有独立的 `/memory-compact` 命令，rewrite 完全自动触发。

### 并发保护

consolidate 使用 `proper-lockfile` 获取 `<project>/.pi/events/.consolidate.lock`：

```text
手动 consolidate → acquireLock(retries: 3, stale: 5s)
  → 锁失败 → 通知用户重试
  → 锁成功 → 合并事件 → flush 队列 → releaseLock

自动 consolidate → acquireLock(retries: 0, stale: 5s)
  → 锁失败 → 静默跳过（下次再处理）
  → 锁成功 → 合并事件 → flush 队列 → releaseLock
```

### 处理流程

```text
读取 <project>/.pi/events/pending/**
抽取候选记忆
精确去重（same content + type → 保留最新 timestamp）
模糊合并（same topic + type → max confidence + 合并内容）
每 5 次自动 consolidate 触发 rewrite 模式，否则 append
  append: 新行追加到文件末尾
  rewrite: 解析 section → 去重插入 → 按序重组
scope=project/agent 写入 memory.md
scope=user 写入 profile.md
MemoryWriteQueue.enqueue() → 2s debounce → 写入 tmp 文件 → rename 原子替换
ctx.ui.notify() 通知用户写入完成（rewrite 标记 [compact]）
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
~/.pi/agent/profile.md         # scope=user 写入
<project>/.pi/memory.md        # scope=project + scope=agent 写入
```

### 字符上限与漂移检测

```text
memory.md:  软上限 8000 chars / 硬上限 12000 chars
profile.md: 软上限 3000 chars / 硬上限 5000  chars

软上限 → 追加时末尾标注，通知用户注意
硬上限 → 拒绝本次写入，原文件 atomic 备份为 .bak.<ts>，写入错误提示
漂移检测 → 写入前验证 isPlausibleContent()，内容异常则备份 + 拒绝
```

## 长尾检索（memory_search）

`memory_search` 工具提供按需检索：

- 检索源：`memory.md`、`profile.md`、`events/pending/`、`events/processed/`
- 参数：`query`（关键词/主题）、`maxResults`（默认 5）
- LLM 可通过 prompt guidelines 感知该工具的存在，用于获取未在 context 中注入的长尾信息

## 工具接口

| 工具 | 描述 |
|------|------|
| `memory_log` | Append-only 事件追加到 pending/，参数 content/type/scope/confidence |
| `memory_search` | 跨所有 memory 源按关键词检索，用于长尾按需读取 |
| `memory_replace` | 替换 pending/ 中匹配的内容（参数 oldText/newContent） |
| `memory_remove` | 删除 pending/ 中包含匹配文本的事件（参数 oldText） |
| `memory_edit` | 直接覆写 memory.md / profile.md，atomic 备份原文件 |
| `/memory-consolidate` | 手动触发后台整合（仅 append，不带 rewrite） |
| `/memory-view` | 查看各文件字符数、行数、events 文件数 + 软硬上限状态 |
| `/memory-clear` | 清空 memory.md + profile.md + events + threads |
| `/memory-clear-project` | 清空项目 memory.md |
| `/memory-clear-global` | 清空 profile.md |

## Human-in-the-Loop

```text
~/.pi/agent/rules.md 禁止 Agent 写入，只能用户人工修改（bash 守卫拦截）。
memory.md / profile.md 由 consolidate 自动写入并通过 ctx.ui.notify() 通知，不再走审批。
memory_edit 工具提供稳定文件的直接编辑能力（atomic 备份 + 写入）。
```

## 并发与一致性

```text
MemoryWriteQueue
  → 2s debounce，按 path 合并
  → 写入临时文件 *.tmp.<pid>
  → rename 原子替换（仅稳定写入时）

proper-lockfile 保护 consolidate
  → 锁路径: <project>/.pi/events/.consolidate.lock
  → 手动: retries=3, stale=5s
  → 自动: retries=0（静默跳过）
  → memory_log append 天然并发安全，不受锁影响
```

## 安全边界

```text
本方案默认是轻量个人本地版，不提供强沙箱。安全边界依赖：
- memory_log 的受控追加（事件日志只能 append，不能覆盖）
- rules.md 由 bash 守卫保护（拦截 bash/write/edit 中对 rules.md 的写入）
- Agent 通过 write/edit 写入其他路径不受限（pi 无路径 gate）

它不能真正阻止 Agent 通过 bash 写 rules.md 以外受保护路径——那需要额外守卫或依赖用户审阅。
```

## 迁移说明

从旧版（3 文件：rules.md + agent.md + memory.md）迁移到新版（3 文件：rules.md + profile.md + memory.md）：

```text
首次启动 session_start 触发：
1. 检测 ~/.pi/agent/agent.md 存在且未迁移（检查 .agent.md.migrated）
2. 读取 agent.md 全部内容，追加到 <project>/.pi/memory.md 的 ## Agent Self-Evolution 节
3. 创建空的 ~/.pi/agent/profile.md
4. 将 agent.md 重命名为 agent.md.migrated
5. 写入 .agent.md.migrated 标记文件
```

## 历史

### 2026-07-11: Memory 扩展全面重构

- **文件结构调整**：`agent.md` 内容拆分 → `profile.md`（用户画像）+ 合并入 `memory.md`（Agent 自进化）
- **注入块重命名**：`[Project Memory]` → `[Memory]`，`[Agent Memory]` → `[User Profile]`
- **新增工具**：`memory_replace`（替换 pending 事件）、`memory_remove`（删除 pending 事件）、`memory_edit`（直接编辑稳定文件，内置原子备份）
- **并发保护**：consolidate 加入 `proper-lockfile`，阻止多会话并发覆盖
- **字符上限**：memory.md 8k/12k、profile.md 3k/5k，超限熔断 + 备份
- **漂移检测**：写入前 `isPlausibleContent()` 验证，异常自动备份
- **新命令**：`/memory-view` 查看各文件状态
- **迁移逻辑**：`session_start` 自动探测并迁移 agent.md → profile.md + memory.md
- **memory_edit 公开为 LLM 工具**：直接覆写稳定文件，atomic 备份
- **consolidate rewrite 模式**：每 5 次自动 consolidate 执行 rewrite（按 section 重组），通知标记 [compact]
