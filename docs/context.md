# pi Project Context

## Project Overview

pi (pi-monorepo) is an open-source AI coding agent with a Terminal UI (TUI). It operates as a CLI tool that helps developers write code, run commands, edit files, and manage development workflows through LLM-powered interaction. The project is a monorepo using npm workspaces.

## Repository Structure

| Directory | Purpose |
|-----------|---------|
| `packages/agent` | Core agent runtime (Agent class, agent loop, harness, skills, compaction) |
| `packages/ai` | LLM provider abstraction (OpenAI, Anthropic, Gemini, Bedrock, Mistral) |
| `packages/coding-agent` | Main application: CLI, TUI, extensions, tools, session management |
| `packages/tui` | Terminal UI framework (editor, components, keybindings, themes) |
| `packages/orchestrator` | Remote process orchestration and RPC |

## Built-in Agent System

pi has three built-in agents switchable via **Tab** key (empty input → toggle, text input → autocomplete):

- **Coding** (default): Full-access agent for development work. All tools available, no restrictions.
- **Plan**: Read-only agent for code analysis and planning. Edit/write denied except `.pi/plan/**`, dangerous bash blocked.
- **Commit**: Plan executor that reads `plan.json`, implements all tasks, runs tests, and commits.

Architecture document: `docs/architecture/plan-agent-architecture.md`

## Plan Mode Features (implemented in this session)

Plan mode was built from scratch with the following architecture:

### Core Mechanism

- **No extension hack**: Plan mode is a built-in `AgentProfile` registered in `AgentSession`, not a separate extension
- **System prompt replacement**: Switching to plan mode sets `_agentPromptOverride` which persists across turns (not cleared per-turn like `_systemPromptOverride`)
- **Capability-based enforcement**: Plan mode exposes a fixed tool set and validates each capability at execution time

### Implementation Files

| File | Role |
|------|------|
| `packages/coding-agent/src/core/agent-session.ts` | `AgentProfile`, agent registry, `cycleAgent()`, `setActiveAgent()`, Plan mode tool enforcement |
| `packages/coding-agent/src/core/plan-mode-policy.ts` | Plan mode path boundaries, external read-root extraction, bash allowlist decisions |
| `packages/coding-agent/src/core/tools/plan-write.ts` | Dedicated Plan mode write tool for `.pi/plan/<name>/` artifacts |
| `packages/coding-agent/src/modes/interactive/interactive-mode.ts` | `cycleAgent()` wired to Tab key via `app.agent.cycle` keybinding |
| `packages/coding-agent/src/modes/interactive/components/custom-editor.ts` | Tab passthrough: text → autocomplete, empty → cycle agent |
| `packages/coding-agent/src/modes/interactive/components/footer.ts` | Agent badge `[PLAN]` in footer status bar |
| `packages/coding-agent/src/core/keybindings.ts` | `app.agent.cycle` default key set to `tab` |
| `.pi/plan/context/project-background.md` | Project background auto-loaded into plan mode system prompt |

### Plan Agent Profile

```typescript
{
  id: "plan",
  activeTools: ["read", "grep", "find", "ls", "plan_write", "bash"],
}
```

- Source code writes are not expressible in Plan mode because generic `write` and `edit` are inactive and blocked if called
- `plan_write` only writes `.pi/plan/<name>/plan.json` and `.pi/plan/<name>/context/**` by default
- `.pi/plan/context/project-background.md` requires explicit user confirmation before writing
- `read`, `grep`, `find`, and `ls` default to the project root; external paths are allowed only when explicitly mentioned by the user
- `bash` uses exact read-only command shapes for environment and git inspection; install, script execution, redirection, pipes, and unknown commands are blocked

### Plan File Format

Plans are stored at `.pi/plan/<name>/plan.json` with:

```json
{
  "name": "feature-name",
  "title": "Feature Title",
  "version": "1.0.0",  "revision": 1,
  "status": "pending" | "in_progress" | "completed",
  "goal": "...",
  "architecture": "...",
  "techStack": "...",
  "entryPoints": ["src/file.ts"],
  "assumptions": ["..."],
  "risks": ["..."],
  "tasks": [
    {
      "id": 1,
      "content": "5-20 min actionable work",
      "status": "pending" | "in_progress" | "completed",
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

Task status flow: `pending → in_progress → completed` (one direction only, no rollback).

### Plan Mode System Prompt Design

Addresses these common issues:
1. **Coding inertia**: Explicit "You do NOT write code" at the top
2. **Home directory exploration**: Instructions to stay within project directory, check for project markers first
3. **Over-questioning**: Limit to max 3 clarifying questions, otherwise assume and document
4. **Existing plan detection**: First step checks if plan.json already exists
5. **Project background**: Auto-loaded from `.pi/plan/context/project-background.md` into `<project_background>` block
6. **Discovery persistence**: Agents persist findings to `.pi/plan/context/project-background.md` for cross-session knowledge

## Tech Stack

- **Runtime**: Node.js >= 22.19.0, also distributed as Bun binary
- **Language**: TypeScript (erasable syntax only, no enums/namespaces/parameter properties)
- **UI**: Custom TUI framework (`@earendil-works/pi-tui`) with Yoga layout
- **Validation**: TypeBox for tool parameter schemas
- **Formatting**: Biome (not Prettier)
- **Testing**: Vitest
- **Package Manager**: npm

## Key Conventions

- **Communication**: Direct, technical prose, no emojis, no fluff
- **Imports**: Top-level only, no `await import()` or dynamic type imports
- **Type safety**: No `any` unless absolutely necessary
- **Backward compatibility**: Not preserved unless explicitly asked
- **Config**: Keybindings via `DEFAULT_EDITOR_KEYBINDINGS` / `DEFAULT_APP_KEYBINDINGS`, never hardcoded
- **Models**: `packages/ai/src/models.generated.ts` is auto-generated; always regenerate, never edit directly

## Commands

- `npm run check` — Full lint + typecheck (run after code changes, before commit)
- `npm run build` — Build all packages (sequential: tui → ai → agent → coding-agent → orchestrator)
- `./test.sh` — Run non-e2e tests from repo root
- `npm run release:patch/minor` — Version bump and publish

## Extension System

Extensions loaded from:
1. `{cwd}/.pi/extensions/` — project-specific
2. `~/.pi/agent/extensions/` — global user
3. `--extension` CLI flag — explicit paths
4. Extension factories — programmatic registration

Each extension receives `ExtensionAPI` (`pi`) with event hooks, tool registration, commands, shortcuts, UI access.

## Memory Extension

Implemented as extension example at `packages/coding-agent/examples/extensions/memory.ts`.

Design document: `docs/architecture/memory-architecture.md`

### Deployment

Run `npm run setup-extensions` — creates a junction (`~/.pi/agent/extensions/` → `examples/extensions/`), so all example extensions are available globally and changes are instantly reflected.

### Architecture

- **Two-level storage**: `~/.pi/agent/` (global: `rules.md`, `agent.md`) + `<project>/.pi/` (project: `memory.md`, `events/`, `runtime/threads/`)
- **Three-layer injection**:
  1. `resources_discover` → `promptPaths` for static base injection (rules + agent + memory at startup)
  2. `before_agent_start` → injects dynamic `<Memory>` + `[Thread State]` block each prompt round
  3. `context` → multi-source keyword recall (pending/ + memory.md + processed/), ranked by `score = confidence × decay(age)`, truncated to `TOKEN_BUDGET` (2000 tokens)
- **`memory_log` tool**: append-only event logging to `events/pending/<date>-<thread-id>.md`
- **`memory_search` tool**: on-demand search across all memory sources for long-tail retrieval
- **`memory-consolidate` command**: exact dedup → fuzzy merge (same topic) → auto-write via `MemoryWriteQueue` (debounced 2s + atomic rename) → notify
- **Short-term thread state**: `<project>/.pi/runtime/threads/<session-id>.json` — auto-saved on `turn_end` (task summary, temp findings, pending todos), auto-cleaned after 24h, injected into `[Thread State]` block each prompt round
- **Auto-consolidate**: triggers on `turn_end` when pending file count >= 5
- **Bash guard**: intercepts `bash`/`write`/`edit` tool calls targeting `rules.md`, blocks with read-only message

### Extension Hooks Used

| Hook | Purpose |
|------|---------|
| `resources_discover` | Provide `rules.md`, `agent.md`, `memory.md` paths to base system prompt |
| `before_agent_start` | Assemble `<Memory>` block + `[Thread State]` from files + thread state |
| `context` | Multi-source recall scored by confidence × decay(age), token-budget truncated |
| `turn_end` | Save thread state + auto-consolidate when pending >= 5 files |
| `tool_call` | Block writes to `rules.md` |
| `session_shutdown` | Flush pending write queue |

### Tools

| Tool | Description |
|------|-------------|
| `memory_log` | Append an event to pending/ with type/scope/confidence |
| `memory_search` | Search all memory sources by keyword/topic for long-tail retrieval |
| `/memory-consolidate` | Consolidate pending → stable files with dedup |

### Internal Components

| Component | Role |
|-----------|------|
| `MemoryWriteQueue` | Debounce 2s writes + atomic temp→rename |
| `consolidateEvents()` | Exact dedup → fuzzy merge (topic+type) → stable write |
| `calculateScore()` | `confidence × 1/(1 + α·age_hours)` ranking |
| `extractTopic()` | First 60 chars of content for fuzzy merge key |
| `ThreadState` | `<project>/.pi/runtime/threads/<id>.json` — short-term session memory |
| `saveThreadState()` / `loadThreadState()` | Persist/read thread state with auto-cleanup after 24h |

## Session System

JSONL storage with tree-based branching (fork/resume/navigate). Context compaction auto-triggers at ~85% window usage.

## Session History

### 2026-07-08: 欢迎页隐藏 Extensions 区块

- TUI 欢迎页 `showLoadedResources()` 不再打印 `[Extensions]` 分组，避免启动时显示已加载扩展列表。
- 扩展加载、运行和扩展诊断仍保留；仅隐藏欢迎页 loaded-resources 列表中的扩展展示。
- 新增回归测试覆盖存在扩展时不渲染 `[Extensions]` 和扩展文件名。

### 2026-07-08: Windows 中文输出解码 + Context 维护规则

- TUI bash 命令输出增加 GB18030 回退解码，解决 Windows 旧代码页中文乱码
- AGENTS.md 新增 context.md 维护规则：中文对话 + 每次有意义变更后更新
