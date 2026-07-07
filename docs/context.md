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

pi has two built-in agents switchable via **Tab** key (empty input → toggle, text input → autocomplete):

- **Coding** (default): Full-access agent for development work. All tools available, no restrictions.
- **Plan**: Read-only agent for code analysis and planning. Edit/write denied except `.pi/plan/**`, dangerous bash blocked.

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

## Session System

JSONL storage with tree-based branching (fork/resume/navigate). Context compaction auto-triggers at ~85% window usage.
