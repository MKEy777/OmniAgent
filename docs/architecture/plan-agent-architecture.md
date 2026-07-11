# Plan Agent 架构设计

## 概述

pi 内置双 Agent 系统，通过 **Tab** 键切换（空输入 → cycle，有文本 → autocomplete）：

| Agent | 模式 | 职责 | 状态 |
|-------|------|------|------|
| Coding | 默认 | 全权开发，所有工具可用 | 已实现 |
| Plan | 只读分析 | 代码分析与规划，禁止写源码 | 已实现 |

两种 Agent 均为 `AgentProfile` 注册在 `AgentSession` 中，不是扩展。

---

## Plan 模式

### AgentProfile

```typescript
{
  id: "plan",
  activeTools: ["read", "grep", "find", "ls", "plan_write", "plan_question", "bash"],
}
```

- 禁止 `write`/`edit` 源码
- `plan_write` 仅允许 `.pi/plan/<name>/plan.json` 和 `.pi/plan/<name>/context/**`
- `.pi/plan/context/project-background.md` 需用户明确确认
- `plan_question` 允许向用户发起结构化提问（1-3 个问题，可选预定义选项）
- `bash` 仅允许只读命令（环境探测、git 检查、包信息查询）
- 读路径默认限制在项目根内

### Plan 文件格式

```json
{
  "name": "feature-name",
  "title": "Feature Title",
  "version": "1.0.0",
  "revision": 1,
  "status": "pending",
  "goal": "...",
  "architecture": "...",
  "techStack": "...",
  "entryPoints": ["src/file.ts"],
  "assumptions": ["..."],
  "risks": ["..."],
  "tasks": [
    {
      "id": 1,
      "content": "Implement X",
      "status": "pending",
      "notes": null,
      "blocker": null,
      "result": null,
      "files": ["src/file.ts"],
      "tests": ["tests/file.test.ts"],
      "testCmd": "vitest run tests/file.test.ts"
    }
  ]
}
```

任务状态：`pending → in_progress → completed`（单向）。

---

## Coding 模式

默认模式，激活全部工具（`read`, `bash`, `edit`, `write` + 扩展注册的工具），无路径或命令限制。

---

## Agent 切换机制

### 切换入口

- **Tab 键**：空输入时 `cycleAgent()`，有文本时 autocomplete。
- **斜杠命令**：`/agent plan`、`/agent coding`。

### 切换实现

```typescript
// cycleAgent: 轮换到下一个注册的 profile
cycleAgent(): string {
  const ids = [...this._agentProfiles.keys()];
  const idx = ids.indexOf(this._currentAgentId);
  const nextId = ids[(idx + 1) % ids.length];
  this.setActiveAgent(nextId);
  return nextId;
}

// setActiveAgent: 设置 systemPrompt 和 activeTools
setActiveAgent(id: string): boolean {
  const profile = this._agentProfiles.get(id);
  if (!profile) return false;
  if (profile.systemPrompt) {
    this._agentPromptOverride = profile.systemPrompt;
  } else {
    this._agentPromptOverride = null;
  }
  if (profile.activeTools) {
    this.setActiveToolsByName(profile.activeTools);
  }
  return true;
}
```

- `_agentPromptOverride` 跨 turn 持久（不清除，直到下次 `setActiveAgent`）。
- `activeTools` 立即生效，下一轮 LLM 调用时工具集变更。
- 切换时不丢失会话消息，只更改后续 behavior。

### UI 指示

Footer 状态栏显示当前 Agent 名称：

```text
[PLAN] > _           # Plan 模式
[CODING] > _         # Coding 模式（默认不显示）
```

Coding 模式为默认，Footer 可省略 badge 或显示灰色 `[CODING]`。

---

## Plan 模式安全策略

### 路径控制

`plan-mode-policy.ts` 实现路径验证：

- `isPathInsideRoot()`：判断路径是否在项目根内
- `isPlanWritePathAllowed()`：验证 plan_write 目标是否在 `.pi/plan/<name>/` 下
- `getPlanReadPathDecision()`：读路径默认在项目根内，用户提及外部路径时扩展
- `extractExplicitExternalReadRoots()`：从用户输入解析显式外部路径

### Bash 控制

Plan 模式 bash 白名单分层：

- **精确命令**（`EXACT_COMMANDS`）：`git status --short`、`pwd` 等完全匹配
- **版本检查**（`VERSION_COMMANDS` + `--version`）：`node --version` 等
- **`where`/`which`**：`where node`、`which npm` 等
- **只读系统命令**（`SAFE_READONLY_COMMANDS`）：`cat`、`head`、`tail`、`wc`、`file`、`du`、`df`、`stat`、`env`、`printenv`、`uname`、`hostname`、`date`、`uptime`
- **安全 git 子命令**：`git status`、`git log`、`git diff`、`git show`、`git branch`、`git tag`、`git remote`、`git stash`
- **安全包管理器子命令**：`npm/pnpm/yarn list/ls/info/view/show/outdated/why/explain`
- Shell 元字符（`| & ; $` 等）一律拒绝
- 未匹配命令一律拒绝

### plan_question 工具

`plan_question` 是 Plan 模式专用的结构化提问工具：

- 允许 Agent 向用户发起 **1-3 个问题**，每个问题可带预定义选项
- 纯展示型工具：execute 返回格式化文本，TUI render 显示问题列表
- 用户回答作为下一条消息发送
- 替代 prompt 中 "Ask at most 3 clarifying questions" 的自由文本方式
- 仅在关键歧义时使用，优先做合理假设并记录在 assumptions[]

---

## 实现文件

| 文件 | 角色 |
|------|------|
| `packages/coding-agent/src/core/agent-session.ts` | AgentProfile 注册、切换逻辑 |
| `packages/coding-agent/src/core/plan-mode-policy.ts` | Plan 模式路径/bash 策略 |
| `packages/coding-agent/src/core/tools/plan-write.ts` | plan_write 工具 |
| `packages/coding-agent/src/core/tools/plan-question.ts` | plan_question 工具 |
| `packages/coding-agent/src/modes/interactive/interactive-mode.ts` | Tab 键 cycle agent |
| `packages/coding-agent/src/modes/interactive/components/footer.ts` | Agent badge 显示 |
| `packages/coding-agent/src/modes/interactive/components/custom-editor.ts` | Tab passthrough |
| `packages/coding-agent/src/core/keybindings.ts` | `app.agent.cycle` 键绑定 |
| `.pi/plan/context/project-background.md` | 项目背景（Plan 模式自动加载） |
