# Plan Agent 架构设计

## 概述

pi 内置三 Agent 的 Agent 系统，通过 **Tab** 键切换（空输入 → cycle，有文本 → autocomplete）：

| Agent | 模式 | 职责 |
|-------|------|------|
| Coding | 默认 | 全权开发，所有工具可用 |
| Plan | 只读分析 | 代码分析与规划，禁止写源码 |
| Commit | 计划执行 | 按 plan.json 自动执行并提交 |

三种 Agent 均为 `AgentProfile` 注册在 `AgentSession` 中，不是扩展。

---

## Commit Agent

### 目标

读取 Plan 模式产出的 `plan.json`，按任务列表依次实现全部代码变更，运行验证命令，最后自动提交到 git。

### 设计要点

- **纯代码执行**：不做探索、不做架构决策，严格按 plan.json 中 `tasks[]` 逐条执行。
- **即写即验**：每个 task 实现后立即运行 `testCmd`，失败则回退重试或记录 blocker。
- **状态回写**：每个 task 完成后更新 `plan.json` 中的 `status`、`result`、`notes`，形成审计链。
- **自动提交**：全部 task 完成且验证通过后，执行 git commit + git tag，消息从 plan.json 的 `title` 或 `goal` 提取。
- **不替换 plan.json**：不允许修改 task 的 `files`/`tests`/`testCmd`/`goal`/`architecture` 等结构字段，只写 `status`/`notes`/`result`/`blocker`。
- **仅运行指定的 testCmd**：不允许自行决定覆盖率、lint、类型检查等，除非 plan.json 有对应的 `verifyCmd` 字段。

### AgentProfile 定义

```typescript
{
  id: "commit",
  activeTools: ["read", "bash", "edit", "write", "plan_write"],
}
```

- `plan_write` 仅用于回写 `.pi/plan/<name>/plan.json` 的任务状态字段，不写源码。
- `bash` 无限制（同 Coding），用于安装依赖、运行测试、git 操作。
- `write`/`edit` 用于实现 task 中的源码变更，但受 plan.json 中 `files` 路径约束（软约束，靠 prompt 约束）。

### System Prompt

```text
# COMMIT MODE (active)

You are pi operating in COMMIT MODE.
Your job is to read an existing plan.json and execute every pending task.

## Workflow

1. Read .pi/plan/<name>/plan.json (the user must specify which plan).
2. Validate the plan: all tasks must have files[], tests[], and testCmd[].
3. Execute tasks in order by id:
   a. Mark task as in_progress.
   b. Implement the code (use files[] paths).
   c. Run testCmd. If it fails, fix and retry (max 3 attempts).
   d. Mark task as completed, set result and notes.
   e. Update plan.json with plan_write after each task.
4. After all tasks completed:
   a. Run the full test suite (if specified in plan).
   b. git add all changed files.
   c. git commit -m "<plan title>: <plan goal>".
   d. Present the commit summary to the user.

## Constraints

- You MUST NOT modify plan.json structure fields: files, tests, testCmd, goal, architecture, techStack, entryPoints, assumptions, risks, name, title, version, revision.
- You MAY update task status/notes/result/blocker.
- If a task fails after 3 attempts, mark it as in_progress with a blocker note and stop.
- If the user asks to adjust the plan, switch to Plan mode first.
- Commit message format: conventional commits (feat/fix/docs).
```

### 状态流转

```text
Plan mode 输出:
  plan.json (tasks: all pending)

Commit mode 输入:
  读取 plan.json

对每个 task:
  pending → in_progress → (成功) → completed
                         → (失败 x3) → in_progress + blocker

完成后:
  git add → git commit → 通知用户
```

### 文件位置

| 文件 | 角色 |
|------|------|
| `packages/coding-agent/src/core/agent-session.ts` | 注册 `commit` AgentProfile |
| `packages/coding-agent/src/core/commit-mode-policy.ts` | Commit 模式路径约束与 plan.json 写权限 |
| `packages/coding-agent/src/core/tools/plan-write.ts` | 已有工具，扩展允许 `plan.json` 状态字段写 |

### 与 Plan 模式的关系

```text
Plan 模式 → 产出 .pi/plan/<name>/plan.json
   ↓ 用户指定 plan name
Commit 模式 → 读取 plan.json → 逐 task 执行 → 提交
   ↓ 如果计划需要调整
Plan 模式 → 用户修改 plan.json → 切回 Commit 继续
```

---

## Plan 模式（已有）

### AgentProfile

```typescript
{
  id: "plan",
  activeTools: ["read", "grep", "find", "ls", "plan_write", "bash"],
}
```

- 禁止 `write`/`edit` 源码
- `plan_write` 仅允许 `.pi/plan/<name>/plan.json` 和 `.pi/plan/<name>/context/**`
- `.pi/plan/context/project-background.md` 需用户明确确认
- `bash` 仅允许只读命令（`git status`, `node --version` 等精确白名单）
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

## Coding 模式（已有）

默认模式，激活全部工具（`read`, `bash`, `edit`, `write` + 扩展注册的工具），无路径或命令限制。

---

## Agent 切换机制

### 切换入口

- **Tab 键**：空输入时 `cycleAgent()`，有文本时 autocomplete。
- **斜杠命令**：`/agent plan`、`/agent commit`、`/agent coding`。

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
[COMMIT] > _         # Commit 模式
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

- 精确白名单（`EXACT_COMMANDS`）：`git status --short`、`pwd` 等
- 版本检查白名单（`VERSION_COMMANDS` + `--version`）：`node --version` 等
- `where`/`which` 白名单：`where node`、`which npm` 等
- Shell 元字符（`| & ; $` 等）一律拒绝
- 未匹配命令一律拒绝

---

## Commit 模式安全策略

### 路径约束

- **写路径**：无硬限制（工具层面允许任何路径），依靠 prompt 约束 Agent 只在 task `files[]` 范围内写
- **plan.json 写**：通过 `plan_write` 工具，只允许回写 `status`/`notes`/`result`/`blocker` 字段
  - `plan_write` 的已有路径验证保留（必须在 `.pi/plan/<name>/` 内）
  - 额外约束：不允许写 `.pi/plan/<name>/context/`（那是 Plan 模式的范围）

### Bash 控制

无限制（同 Coding 模式），用于：
- `npm install` / `pip install` 安装依赖
- `vitest run` / `npm test` 运行验证
- `git add` / `git commit` 提交
- 其他构建或验证命令

---

## 实现文件

| 文件 | 角色 |
|------|------|
| `packages/coding-agent/src/core/agent-session.ts` | 三 AgentProfile 注册、切换逻辑 |
| `packages/coding-agent/src/core/plan-mode-policy.ts` | Plan 模式路径/bash 策略 |
| `packages/coding-agent/src/core/commit-mode-policy.ts` | Commit 模式路径约束（可选） |
| `packages/coding-agent/src/core/tools/plan-write.ts` | plan_write 工具 |
| `packages/coding-agent/src/modes/interactive/interactive-mode.ts` | Tab 键 cycle agent |
| `packages/coding-agent/src/modes/interactive/components/footer.ts` | Agent badge 显示 |
| `packages/coding-agent/src/modes/interactive/components/custom-editor.ts` | Tab passthrough |
| `packages/coding-agent/src/core/keybindings.ts` | `app.agent.cycle` 键绑定 |
| `.pi/plan/context/project-background.md` | 项目背景（Plan 模式自动加载） |
