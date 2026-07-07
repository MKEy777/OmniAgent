# OmniAgent

OmniAgent is an open-source AI coding agent with a Terminal UI (TUI), forked from [Pi](https://github.com/earendil-works/pi). It helps developers write code, run commands, edit files, and manage development workflows through LLM-powered interaction.

## Features

- **Built-in Agents**: Coding mode (full access) and Plan mode (read-only analysis) switchable via Tab
- **Terminal UI**: Custom TUI with chat interface, editor, autocomplete, and theme support
- **Multi-Provider**: OpenAI, Anthropic, Gemini, Bedrock, Mistral, and more via `packages/ai`
- **Extensible**: Plugin system with hooks, tools, commands, shortcuts, and widgets
- **Session Management**: JSONL-based storage with tree branching (fork/resume/navigate)
- **Context Compaction**: Automatic context window optimization
- **Skills & Prompts**: Customizable command templates and skill definitions

## Architecture

```
packages/
  agent/          Core agent runtime, agent loop, skills, compaction
  ai/             LLM provider abstraction layer
  coding-agent/   Main application: CLI, TUI, extensions, tools
  tui/            Terminal UI framework (editor, components, keybindings)
  orchestrator/   Remote process orchestration and RPC
```

## Quick Start

```bash
# Install dependencies
npm install --ignore-scripts

# Build all packages
npm run build

# Run
node packages/coding-agent/dist/cli.js
```

## Commands

| Command | Description |
|---------|-------------|
| `/settings` | Open settings menu |
| `/model` | Select model |
| `/new` | Start a new session |
| `/compact` | Compact session context |
| `/reload` | Reload config and extensions |
| `/zh` | Switch command descriptions to Chinese |
| `/en` | Switch command descriptions to English |
| `/hotkeys` | Show all keyboard shortcuts |

## Tech Stack

- **Runtime**: Node.js >= 22.19.0, also distributed as Bun binary
- **Language**: TypeScript (erasable syntax, no enums/namespaces)
- **UI**: Custom TUI framework with Yoga layout
- **Validation**: TypeBox
- **Formatting**: Biome
- **Testing**: Vitest
- **Package Manager**: npm

## Requirements

- Node.js >= 22.19.0
- npm

## Development

```bash
# Type check and lint
npm run check

# Run tests
./test.sh

# Format code
npx biome check --write .
```

## License

MIT
