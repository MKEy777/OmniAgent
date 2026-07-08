# Pi 文档（中文完整翻译版）

- **来源 URL**: https://pi.dev/docs/latest
- **抓取时间**: 2026-07-08
- **翻译时间**: 2026-07-08
- **抓取范围**: pi.dev/docs/latest 站点全部 28 个章节（其中 27 个为独立页面，1 个为真实 404 已整合）
- **翻译说明**: 本文件为 pi 官方文档的完整中文翻译版。所有说明性文字、章节标题、表格文字均已翻译为中文，代码块、配置 JSON、命令行、文件路径、API 标识符、变量名等保持原样不动，以保留技术准确性。
- **状态说明**: 4 个原被误标 404 的章节（Using Pi、Security、Settings、SDK）实际可访问，已重新抓取；10 个原标"未抓取"的章节也已抓取完成；仅 `/sessions` 章节为真实 404（相关内容已整合到 Session Format 章节）。

## 目录

### 主页
1. [主页](#1-主页)

### 入门
2. [Quickstart（快速上手）](#2-quickstart快速上手)
3. [Using Pi（使用 Pi）](#3-using-pi使用-pi)
4. [Providers（提供商）](#4-providers提供商)
5. [Security（安全）](#5-security安全)
6. [Containerization（容器化）](#6-containerization容器化)
7. [Settings（设置）](#7-settings设置)
8. [Keybindings（键位绑定）](#8-keybindings键位绑定)
9. [Compaction（压缩）](#9-compaction压缩)

> 注：原 `/sessions` 章节为 404（站点未提供该独立页面），相关 session 内容已整合到 [Session Format（会话格式）](#21-session-format会话格式) 章节。

### 定制化
10. [Extensions（扩展）](#10-extensions扩展)
11. [Skills（技能）](#11-skills技能)
12. [Prompt templates（提示模板）](#12-prompt-templates提示模板)
13. [Themes（主题）](#13-themes主题)
14. [Pi packages（Pi 包）](#14-pi-packagespi-包)
15. [Custom models（自定义模型）](#15-custom-models自定义模型)
16. [Custom providers（自定义提供商）](#16-custom-providers自定义提供商)

### 编程接口
17. [SDK（软件开发工具包）](#17-sdk软件开发工具包)
18. [RPC mode（RPC 模式）](#18-rpc-moderpc-模式)
19. [JSON event stream mode（JSON 事件流模式）](#19-json-event-stream-modejson-事件流模式)
20. [TUI components（TUI 组件）](#20-tui-componentstui-组件)

### 参考
21. [Session format（会话格式）](#21-session-format会话格式)

### 平台设置
22. [Windows](#22-windows)
23. [Termux on Android（Android 上的 Termux）](#23-termux-on-androidandroid-上的-termux)
24. [tmux](#24-tmux)
25. [Terminal setup（终端设置）](#25-terminal-setup终端设置)
26. [Shell aliases（Shell 别名）](#26-shell-aliasesshell-别名)

### 开发
27. [Development（开发）](#27-development开发)

---

## 1. 主页

来源: https://pi.dev/docs/latest

> pi 是一个运行在你终端中的 AI 编程代理。它使用流行的 LLM 在你的机器上读取、编写和运行代码，拥有你期望从一个严肃工具中获得的权限和控制力。

pi 是一个终端原生的 AI 编程代理，设计目标是让 AI 编码体验与你的工作流完全契合——由你完全控制。它是 [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) 的前端，这是一个可编程的 npm 包，把模型 API 转换成生产级的编码工具。

### 为什么选择 pi

* **模型无关**。可与任何 LLM 配合使用。Anthropic Claude、OpenAI、谷歌 Gemini、本地模型，或任何 OpenAI 兼容的端点。不锁定供应商。
* **为你而生**。可以扩展它、调整行为、主题、安装/卸载功能，以匹配你的工作流。
* **编程优先**。基于 RPC 协议，允许你以编程方式驱动 pi；`pi` CLI 本身就是一个 RPC 客户端。
* **完全可控**。默认运行在你的机器上，使用你已安装的工具。不在云端沙箱中。
* **可审计**。每个会话以 JSON 树的形式保存到磁盘上。fork、搜索、git diff，任何你能对纯文本做的事。
* **资源发现**。扩展、技能、提示、主题、上下文文件——通过文件系统自动发现，无需中央注册表。

### 30 秒快速上手

1. 安装: `npm install -g @mariozechner/pi-coding-agent`
2. 配置 API key: `export ANTHROPIC_API_KEY=...`
3. 启动: `cd your-project && pi`

[下一步: Quickstart（快速上手） →](/docs/latest/quickstart)

---

## 2. Quickstart（快速上手）

来源: https://pi.dev/docs/latest/quickstart

> 让 pi 跑起来，构建点东西，然后深入了解它的工作原理。

### 安装

```bash
npm install -g @mariozechner/pi-coding-agent
pi
```

### 设置 API 密钥

pi 支持任何 LLM，你可以配置自己的 API key:

```bash
# Anthropic Claude（默认）
export ANTHROPIC_API_KEY=sk-ant-...

# 或 OpenAI
export OPENAI_API_KEY=sk-...

# 或 Google Gemini
export GEMINI_API_KEY=...

# 或任何 OpenAI 兼容的端点（本地模型、自托管服务）
export OPENAI_BASE_URL=http://localhost:11434/v1
```

`pi` 启动时会扫描环境变量以发现可用的提供商和模型。第一个可用的模型被选为默认。

### 第一次运行

```bash
mkdir my-project
cd my-project
pi
```

> **首次运行:** 在新项目中，pi 会询问是否信任该目录以及你希望加载哪些资源（扩展、技能、提示、主题）。`AGENTS.md` 会始终加载。

### 提问

```text
> 解释这个项目的结构
```

pi 读取当前目录，识别项目类型（检测 `package.json`、语言文件等），并使用上下文来回答。

### 修改代码

```text
> 给 server.js 添加一个 /health 端点，返回 { status: "ok" }
```

pi 找到目标文件，做编辑，运行测试（如果存在），并显示 diff 供你审查。

### 关键能力

* **使用工具**: `read`、`write`、`edit`、`bash`
* **运行命令**: `! npm test`
* **控制循环**: `Ctrl+C` 中断
* **浏览历史**: `↑`/`↓`
* **切换模型**: `/model`
* **导出会话**: `/export`

[下一步: Using Pi（使用 Pi） →](/docs/latest/usage)

---

## 3. Using Pi（使用 Pi）

来源: https://pi.dev/docs/latest/usage

> 了解交互模型、斜杠命令、子代理，以及如何通过 CLI 驱动 pi。

### 交互模式（Interactive Mode）

默认模式。输入提示，pi 帮你做工作。

```bash
pi
```

### 斜杠命令（Slash Commands）

| 命令 | 描述 |
|---------|-------------|
| `/help` | 显示可用命令 |
| `/model` | 切换模型 |
| `/settings` | 打开设置 |
| `/session` | 会话管理 |
| `/export` | 导出为 HTML |
| `/compact` | 触发压缩 |
| `/new` | 开始新会话 |
| `/fork` | 在某个回合处 fork |
| `/share` | 打印分享 URL |
| `/exit` | 退出 pi |

斜杠命令由扩展、技能或内置命令注册。`/help` 列出所有当前可用的命令。

### 压缩（Compaction）

当上下文变长时，自动（或手动）压缩早期消息。

```text
/compact
```

参见 [Compaction（压缩）](/docs/latest/compaction) 章节。

### 上下文文件（AGENTS.md）

pi 加载项目根目录的 `AGENTS.md` 作为系统提示的一部分。在多级目录中都支持（向根遍历，直到 git 仓库根或文件系统根）。

### 子代理（Subagents）

通过 RPC 模式从一个 `pi` 进程派生子代理:

```typescript
import { createAgentSession } from "@earendil-works/pi-coding-agent";
const { session } = await createAgentSession({ model, systemPrompt: "You are a subagent" });
```

参见 [SDK](/docs/latest/sdk) 章节。

### CLI 选项

```text
pi [options] [prompt]

选项:
  -m, --model <id>           使用的模型
  -p, --provider <name>      提供商覆盖
  -c, --continue             继续最近的会话
  -r, --resume [id]          按 id 恢复会话
  -f, --fork [id]            在某回合处 fork 会话
      --mode <mode>          运行模式: interactive | print | json | rpc
      --no-extensions        禁用扩展发现
      --no-skills            禁用技能发现
      --no-prompts           禁用提示模板发现
      --no-themes            禁用主题发现
      --skill <path>         加载技能文件或目录（可重复）
      --prompt-template <path>  加载提示模板（可重复）
      --theme <path>         加载主题文件（可重复）
      --extension <path>     加载扩展文件（可重复）
```

### Print / JSON / RPC 模式

`--mode print`: 一次性 prompt，打印最终响应并退出。

`--mode json`: 行分隔的 JSON 事件流（见 [JSON event stream（JSON 事件流）](/docs/latest/json)）。

`--mode rpc`: JSON-RPC over stdio（见 [RPC mode（RPC 模式）](/docs/latest/rpc)）。

### 技能（Skills）

使用 `/skill:name` 调用已注册的技能:

```text
/skill:pdf-tools extract chapter1.pdf
```

技能定义见 [Skills（技能）](/docs/latest/skills)。

### 设计原则

* **本地优先（Local-first）**: 会话存为磁盘上的 JSON。
* **流式（Streaming）**: 模型输出在产生时流式传输。
* **可组合（Composable）**: 一切都是扩展、命令或资源。
* **透明（Transparent）**: 没有隐藏状态；所有内容都从文件系统派生。

---

## 4. Providers（提供商）

来源: https://pi.dev/docs/latest/providers

> pi 内置支持主流 LLM 提供商。配置你自己的 API key，随时切换，或接入任何 OpenAI 兼容的端点。

### 内置提供商

| 提供商 | 模型 | 默认环境变量 |
|----------|--------|-------------|
| Anthropic | Claude 3.5/3.7/4 | `ANTHROPIC_API_KEY` |
| OpenAI | GPT-4o, GPT-4.1, o1, o3 | `OPENAI_API_KEY` |
| Google | Gemini 2.0/2.5 | `GEMINI_API_KEY` |
| Mistral | Mistral Large, Codestral | `MISTRAL_API_KEY` |
| Groq | Llama, Mixtral | `GROQ_API_KEY` |
| xAI | Grok | `XAI_API_KEY` |
| OpenRouter | 任意 | `OPENROUTER_API_KEY` |
| Ollama | 本地模型 | （无需 key） |
| vLLM | 本地模型 | （无需 key） |
| LM Studio | 本地模型 | （无需 key） |

### 配置提供商

#### 通过环境变量设置 API Key

pi 启动时扫描环境变量以发现可用的提供商。第一个有凭据的提供商是默认选择。

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

#### 通过认证存储设置 API Key

`/settings` → API Keys，或编辑 `~/.pi/agent/auth.json`:

```json
{
  "anthropic": { "type": "api_key", "key": "sk-ant-..." },
  "openai": { "type": "api_key", "key": "sk-..." }
}
```

OAuth 流程（Claude Pro/Max、ChatGPT）把刷新令牌保存到同一文件。

### 选择模型

* 在交互模式中: `/model`
* 在 CLI: `pi --model <provider>/<name>`，例如 `pi --model anthropic/claude-sonnet-4-5`
* 在 RPC: `model/select` 方法

### 自定义端点（OpenAI 兼容）

任何 OpenAI 兼容的端点都可以工作:

```bash
# Ollama
export OPENAI_BASE_URL=http://localhost:11434/v1
pi --model openai/llama3.3

# vLLM
export OPENAI_BASE_URL=http://localhost:8000/v1
pi --model openai/meta-llama/Llama-3-70B

# LM Studio
export OPENAI_BASE_URL=http://localhost:1234/v1
pi --model openai/qwen2.5-coder
```

要让模型在选择器中显示名称，定义 [custom models（自定义模型）](/docs/latest/models)。

### 提供商解析顺序

1. CLI 参数（`--model`，`--provider`）
2. 环境变量
3. `auth.json`
4. 内置默认值

---

## 5. Security（安全）

来源: https://pi.dev/docs/latest/security

> pi 是一个本地工具。它使用你的机器、你的文件、你的 shell。本页面解释这在实践中意味着什么，以及如何保持安全。

### 信任模型

pi **默认不在沙箱中运行**。它使用你的真实用户身份执行命令，访问你的真实文件系统，继承你的 shell 环境。这是有意为之的设计——它让 pi 与你的工作流无缝集成。

**这意味着:**

* 工具调用直接运行，无隔离。
* 文件读写访问 `$HOME` 下的所有内容（受用户权限限制）。
* `bash` 工具以你的身份运行，无白名单。
* 网络调用由你控制（由你的 API key、VPN、代理等）。

**这不意味着:**

* pi 在云端执行任意代码（没有 pi 控制的远程执行）。
* pi 把你的文件发送给第三方（除了通过你配置的 LLM 发送的 prompt 数据）。
* pi 安装守护进程或修改系统配置。

### 项目信任

首次在新项目目录中运行时，pi 询问是否信任该项目:

* **Trusted（已信任）**: 加载项目级扩展、技能、提示、主题和 `AGENTS.md`。
* **Untrusted（未信任）**: 只加载全局资源。`AGENTS.md` 总是被读取，但项目级扩展、技能、提示和主题被禁用。

信任持久化到项目目录下的 `.pi/settings.json` 中（`"trust": true`）。要撤销信任，删除该字段或运行 `/settings` → Trust。

### pi 不做沙箱隔离的事项

* **Bash 命令**: 以你的身份运行，无隔离。
* **文件系统访问**: 读写你有权访问的任何文件。
* **网络**: 来自你的进程环境的出站连接。
* **进程**: 启动后台进程、服务器、守护进程。
* **包安装**: `npm install` 等命令直接运行，无审批。
* **Git 操作**: 直接执行，无中间层。

### 运行不受信任的工作

如果你需要处理不信任的代码:

1. **使用容器**。参见 [Containerization（容器化）](/docs/latest/containerization)。
2. **使用不同的用户**。在低权限账户下运行 pi。
3. **使用单独的机器**。在隔离的环境中运行 pi。
4. **审阅每一个 diff**。不要盲目接受工具调用。
5. **限制工具**。通过扩展禁用 `bash` 或 `write`，只允许 `read`。

### 报告漏洞

发现 pi 本身的安全问题？在 GitHub 上[提交私密安全公告](https://github.com/earendil-works/pi/security/advisories/new)。

请不要为安全问题提交公开 issue。

---

## 6. Containerization（容器化）

来源: https://pi.dev/docs/latest/containerization

> 在容器中运行 pi，将其与你的宿主系统隔离。适用于不受信任的代码或 CI/CD。

### 为什么要容器化？

* **隔离**: 容器是文件系统、进程和网络与你的主机之间的边界。
* **可重现性**: 锁定依赖、工具版本和环境。
* **CI/CD**: 在干净的镜像中运行 pi 做自动化编码任务。
* **安全**: 限制 pi 访问敏感文件或网络。

### Docker 示例

```dockerfile
FROM node:20-slim

# Install pi
RUN npm install -g @mariozechner/pi-coding-agent

# Set up working directory
WORKDIR /workspace

# Mount your project at /workspace
# docker run -v $(pwd):/workspace -it pi-coding-agent

ENTRYPOINT ["pi"]
```

构建并运行:

```bash
docker build -t pi-coding-agent .
docker run -v $(pwd):/workspace -it pi-coding-agent
```

### 挂载项目目录

```bash
docker run \
  -v $(pwd):/workspace \
  -v ~/.pi/agent:/root/.pi/agent \
  -e ANTHROPIC_API_KEY \
  -it pi-coding-agent
```

### Docker Compose

```yaml
services:
  pi:
    build: .
    volumes:
      - .:/workspace
      - ~/.pi/agent:/root/.pi/agent
    environment:
      - ANTHROPIC_API_KEY
```

### Podman

Podman 是无守护进程的 Docker 替代品，语法相同:

```bash
podman build -t pi-coding-agent .
podman run -v $(pwd):/workspace -it pi-coding-agent
```

### 已知限制

* **TTY 转发**: 容器需要 `-it` 标志以获得交互模式。
* **剪贴板**: 在容器内无系统剪贴板访问。
* **SSH agent**: 挂载 `$SSH_AUTH_SOCK` 转发 git 凭据。
* **文件系统性能**: 在 macOS/Windows 上，绑定挂载可能很慢。

---

## 7. Settings（设置）

来源: https://pi.dev/docs/latest/settings

> 设置控制 pi 的行为方式。调整模型、UI、警告等。

### 设置位置

| 位置 | 用途 |
|----------|---------|
| `~/.pi/agent/settings.json` | 全局默认 |
| `.pi/settings.json` | 项目级覆盖 |
| CLI 标志 | 每次调用的覆盖 |
| `/settings` | 交互式编辑器 |

> **项目信任:** 项目级设置仅在项目被信任后才会加载。

### 设置 Schema

#### model（模型）

```json
{
  "model": "anthropic/claude-sonnet-4-5"
}
```

默认模型。格式：`<provider>/<model-name>`。

#### ui（界面）

```json
{
  "ui": {
    "theme": "dark",
    "compactMode": false,
    "showTimestamps": true
  }
}
```

界面偏好：主题、布局密度、时间戳显示。

#### warnings（警告）

```json
{
  "warnings": {
    "showCostWarnings": true,
    "showLongContextWarnings": true
  }
}
```

是否在交互式会话中显示使用警告。

#### compaction（压缩）

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 8192
  }
}
```

控制自动和手动压缩。参见 [Compaction（压缩）](/docs/latest/compaction)。

#### retry（重试）

```json
{
  "retry": {
    "enabled": true,
    "maxAttempts": 3,
    "initialDelayMs": 1000,
    "maxDelayMs": 30000
  }
}
```

对瞬时错误（速率限制、网络）进行自动重试。

#### messageDelivery（消息投递）

```json
{
  "messageDelivery": {
    "steerEnabled": true,
    "followUpEnabled": true
  }
}
```

控制是否可以在模型仍在流式输出时重定向（`/steer`）或排队（`/follow-up`）一个回合。

#### terminal（终端）

```json
{
  "terminal": {
    "clearOnStart": false,
    "scrollback": 10000,
    "mouseEnabled": true
  }
}
```

终端行为：清屏、回滚缓冲区、鼠标支持。

#### shell

```json
{
  "shell": {
    "command": "/bin/bash",
    "args": ["-l"]
  }
}
```

`bash` 工具使用的 shell。默认：`$SHELL`。

#### session（会话）

```json
{
  "session": {
    "directory": "~/.pi/agent/sessions",
    "maxAgeDays": 90,
    "autoFork": true
  }
}
```

会话存储位置、保留和自动 fork 行为。

#### model.loop / model.streaming

```json
{
  "model": {
    "loop": {
      "stepTimeoutMs": 180000,
      "maxSteps": 100
    },
    "streaming": {
      "debounceMs": 50
    }
  }
}
```

模型调用的循环和流式传输调优。

#### resources（资源）

```json
{
  "resources": {
    "extensions": ["./extensions/*.ts"],
    "skills": ["./skills/*/SKILL.md"],
    "prompts": ["./prompts/*.md"],
    "themes": ["./themes/*.json"]
  }
}
```

资源发现附加项。参见 [Extensions（扩展）](/docs/latest/extensions)、[Skills（技能）](/docs/latest/skills) 等。

### 完整示例

```json
{
  "model": "anthropic/claude-sonnet-4-5",
  "ui": {
    "theme": "dark",
    "showTimestamps": true
  },
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384
  },
  "retry": {
    "enabled": true,
    "maxAttempts": 3
  },
  "extensions": ["./my-extension.ts"]
}
```

### 编辑设置

* **在应用内**: `/settings` 打开交互式编辑器。
* **直接编辑**: 直接编辑 `~/.pi/agent/settings.json` 或 `.pi/settings.json`。更改将在下一次 prompt 时生效。

### 优先级

1. CLI 标志
2. 项目设置（`.pi/settings.json`）
3. 全局设置（`~/.pi/agent/settings.json`）
4. 内置默认值

---

## 8. Keybindings（键位绑定）

来源: https://pi.dev/docs/latest/keybindings

> 自定义驱动交互式 TUI 的键盘快捷键。

### 默认键位

#### 编辑器

| 按键 | 动作 |
|-----|--------|
| `Enter` | 提交 prompt |
| `Shift+Enter` | 换行 |
| `Ctrl+C` | 中断 |
| `Ctrl+D` | 退出（输入为空时） |
| `↑` / `↓` | 浏览历史 |
| `Ctrl+R` | 搜索历史 |
| `Ctrl+A` / `Ctrl+E` | 移到行首 / 行尾 |
| `Ctrl+K` / `Ctrl+U` | 删至行尾 / 行首 |
| `Ctrl+W` | 删除一个单词 |
| `Alt+B` / `Alt+F` | 单词间向后 / 向前移动 |
| `Tab` | 缩进 |
| `Shift+Tab` | 反缩进 |
| `!`（首字符） | Bash 模式 |

#### 导航

| 按键 | 动作 |
|-----|--------|
| `Ctrl+L` | 切换会话列表 |
| `Ctrl+P` | 打开命令面板 |
| `Ctrl+T` | 切换思考显示 |
| `Ctrl+E` | 切换展开 |
| `Esc Esc` | 向上导航 |

#### 工具

| 按键 | 动作 |
|-----|--------|
| `Y`（n） | 在工具提示中回答 Yes |
| `N`（n） | 在工具提示中回答 No |
| `A`（n） | 始终允许此工具 |

#### 模型

| 按键 | 动作 |
|-----|--------|
| `Ctrl+M` | 模型选择器 |

### 自定义键位

编辑 `~/.pi/agent/keybindings.json`:

```json
{
  "ctrl+k": "clearInput",
  "ctrl+/": "toggleHelp"
}
```

#### 动作名称

| 动作 | 描述 |
|--------|-------------|
| `submit` | 提交 prompt |
| `newline` | 插入换行 |
| `interrupt` | 中断当前操作 |
| `clearInput` | 清空编辑器 |
| `openCommandPalette` | 打开命令面板 |
| `openModelPicker` | 打开模型选择器 |
| `toggleHelp` | 切换帮助覆盖层 |
| `toggleThinking` | 切换思考块 |
| `browseHistory` | 打开历史搜索 |
| `navigateUp` / `navigateDown` | 向上 / 向下滚动 |
| `scrollToTop` / `scrollToBottom` | 跳到开头 / 结尾 |
| `selectYes` / `selectNo` / `selectAlways` | 工具提示 |
| `selectTab` / `selectShiftTab` | Tab 导航 |

### 组合键（Chords）

双键序列（例如 `Ctrl+X Ctrl+S`）:

```json
{
  "ctrl+x ctrl+s": "saveSession"
}
```

### 平台特定

* **macOS**: 在大多数终端上 `Cmd` 映射到 `Meta`（`alt`）。
* **Windows/Linux**: `Ctrl` 是主修饰键。
* 参见 [Terminal setup（终端设置）](/docs/latest/terminal-setup) 了解正确的按键上报。

### 禁用

将绑定设为 `null` 即可禁用:

```json
{
  "ctrl+l": null
}
```

---

## 9. Compaction（压缩）

来源: https://pi.dev/docs/latest/compaction

> 长会话会变得很大。压缩会总结旧消息，让模型在不超过上下文窗口的情况下继续工作。

### 压缩的作用

当会话接近模型的上下文限制时，压缩会:

1. 识别最早的非系统消息
2. 将它们与摘要 prompt 一起发送给模型
3. 用一条摘要消息替换它们
4. 保留仍然相关的工具调用和结果

### 何时触发压缩

自动压缩在以下情况触发:

* 总 token 数（输入 + 预留输出）> 模型的上下文限制
* 设置中 `compaction.enabled` 为 `true`
* 在每个模型回合之后

### 手动压缩

```text
/compact
```

立即触发压缩。模型总结最旧的消息，保留工具调用和最近的上下文。

### 压缩设置

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 8192
  }
}
```

| 字段 | 默认值 | 描述 |
|-------|---------|-------------|
| `enabled` | `true` | 启用自动压缩 |
| `reserveTokens` | `16384` | 为模型响应预留的 token 数 |
| `keepRecentTokens` | `8192` | 始终原样保留最后 N 个 token |

### 压缩标记

每次压缩都会向会话添加一个标记:

```json
{
  "type": "compaction",
  "id": "...",
  "timestamp": "2026-07-08T...",
  "summary": "...",
  "tokensBefore": 142000,
  "tokensAfter": 42000
}
```

会话保持为有效的 JSON 树，压缩节点交错在用户/模型回合之间。

### RPC 控制

压缩有专用的 RPC 方法:

* `compaction/start` - 触发压缩
* `compaction/pause` - 暂停进行中的压缩
* `compaction/resume` - 恢复暂停的压缩
* `compaction/status` - 获取当前状态

### 暂停压缩

在交互模式下，在压缩过程中按 `Ctrl+C` 暂停。会话恢复时保留原始消息。使用 `/compact` 重试。

### 在压缩处 Fork

```text
/fork
```

在任何回合处 fork 会话，包括压缩边界。fork 保留到 fork 点为止的所有消息。

### 最佳实践

* **保留最近上下文**: 不要把 `keepRecentTokens` 设置得太低；模型需要连续性。
* **留意警告**: pi 在达到限制的 75% 和 90% 时会显示上下文警告。
* **尽早手动触发**: 对于可预测的工作，在切换任务前运行 `/compact`。
* **压缩前导出**: 对于重要的会话，在压缩前 `/export` 为 HTML。

---

## 10. Extensions（扩展）

来源: https://pi.dev/docs/latest/extensions

> 扩展是 TypeScript 模块，可以挂载到 pi 的生命周期中，注册工具、命令、RPC 方法和自定义 UI。

### 什么是扩展？

扩展是一个 `.ts`（或 `.js`）文件，导出一个默认的异步函数，接收 `ExtensionAPI`。该函数在启动时运行，API 允许你:

* 注册自定义工具
* 注册斜杠命令
* 监听事件
* 注册 RPC 方法
* 添加 UI 组件
* 修改系统提示
* 替换内置工具

### 基本示例

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default async function (pi: ExtensionAPI) {
  // Register a slash command
  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (args, ctx) => {
      ctx.ui.notify("Hello, world!", "info");
    },
  });

  // Listen to events
  pi.on("session_start", async (event, ctx) => {
    console.log("Session started:", event.session.id);
  });
}
```

### 位置

* **全局**: `~/.pi/agent/extensions/*.ts`
* **项目**: `.pi/extensions/*.ts`（仅在项目被信任后）
* **包**: `extensions/` 目录或 `package.json` 中的 `pi.extensions` 条目
* **设置**: `extensions` 数组，填写文件或目录
* **CLI**: `--extension <path>`（可重复）

使用 `--no-extensions` 禁用自动发现。

### 扩展 API

#### 生命周期事件

| 事件 | 载荷 | 描述 |
|-------|---------|-------------|
| `session_start` | `{ session }` | 会话已创建/加载 |
| `session_end` | `{ session }` | 会话已关闭 |
| `turn_start` | `{ turn }` | 用户回合开始 |
| `turn_end` | `{ turn }` | 回合结束 |
| `message_start` | `{ message }` | 模型消息开始 |
| `message_update` | `{ delta }` | 流式增量 |
| `message_end` | `{ message }` | 模型消息结束 |
| `tool_call` | `{ tool, args }` | 工具被调用 |
| `tool_result` | `{ tool, result }` | 工具已完成 |
| `compaction_start` | `{ compaction }` | 压缩开始 |
| `compaction_end` | `{ compaction }` | 压缩结束 |

#### 注册工具

```typescript
pi.registerTool({
  name: "my_tool",
  description: "Does something useful",
  parameters: {
    type: "object",
    properties: {
      input: { type: "string", description: "Input value" },
    },
    required: ["input"],
  },
  execute: async (args, ctx) => {
    return { output: `Processed: ${args.input}` };
  },
});
```

#### 注册命令

```typescript
pi.registerCommand("greet", {
  description: "Greet someone",
  argumentHint: "<name>",
  handler: async (args, ctx) => {
    const name = args.trim() || "world";
    ctx.ui.notify(`Hello, ${name}!`, "info");
  },
});
```

#### 自定义 RPC 方法

```typescript
pi.registerRpcMethod("my_method", {
  description: "Custom RPC method",
  handler: async (params, ctx) => {
    return { result: "ok", params };
  },
});
```

#### 修改系统提示

```typescript
pi.on("session_start", async (event, ctx) => {
  ctx.systemPrompt.append(
    "You are a helpful assistant specializing in TypeScript."
  );
});
```

#### 使用 UI 组件

```typescript
pi.on("session_start", async (event, ctx) => {
  ctx.ui.setStatus(`Session ${event.session.id} started`);
});
```

#### 替换内置工具

```typescript
pi.registerTool({
  name: "bash",
  description: "Run a shell command (with confirmation)",
  parameters: { /* ... */ },
  execute: async (args, ctx) => {
    const ok = await ctx.ui.confirm("Run?", args.command);
    if (!ok) return { output: "Cancelled" };
    // ... run command ...
  },
});
```

### 扩展包

扩展可以打包为 npm 包:

```json
{
  "name": "my-pi-extension",
  "pi": {
    "extensions": ["./dist/index.js"]
  }
}
```

参见 [Pi packages（Pi 包）](/docs/latest/pi-packages)。

---

## 11. Skills（技能）

来源: https://pi.dev/docs/latest/skills

> 技能（Skills）是可重用的指令包，让 pi 掌握新的能力、工作流或领域知识。

### 什么是技能？

技能是一个目录，包含一个 `SKILL.md` 文件，其中包含:

* **YAML frontmatter** 描述名称、描述以及何时触发
* **Markdown 内容** 提供具体说明、示例和工作流

技能遵循 [agentskills.io](https://agentskills.io/specification) 规范。

### 最小示例

```markdown
---
name: code-review
description: Review code changes for quality, security, and style
---

When asked to review code:

1. Read the diff or file
2. Check for bugs, security issues, and style problems
3. Suggest improvements with concrete code examples
4. Be concise: bullet points, not paragraphs
```

### 位置

* **全局**: `~/.pi/agent/skills/`
* **项目**: `.pi/skills/`（仅在项目被信任后）
* **包**: 任何带有 `SKILL.md` 的目录
* **设置**: `resources.skills` 数组

### Skill 发现

启动时，pi 扫描所有配置的 skill 目录，加载 frontmatter（廉价）但*不*加载内容（避免占用上下文）。在对话期间，仅当与用户请求相关时才加载完整内容。

### Frontmatter 字段

```yaml
---
name: my-skill              # Required, kebab-case
description: |              # Required, used to decide when to load
  Does X, Y, and Z. Use when
  the user asks for...
license: MIT                # Optional
compatibility: pi>=0.1.0    # Optional
metadata:                   # Optional, free-form
  author: Your Name
  version: 1.0.0
---
```

`name` 和 `description` 字段是必需的。描述应清楚地说明何时应该调用该 skill。

### 自动调用 vs 显式调用

技能可以以两种方式激活:

#### 自动调用

当用户的请求与 `description` 匹配时，pi 自动调用 skill，无需用户调用命令。

#### 显式调用

使用 `/skill:<name>` 命令显式调用:

```text
/skill:code-review src/api/users.ts
```

### 调用规则

* 如果请求与多个 skill 匹配，pi 会选择最具体的那个。
* skill 内容会注入到模型上下文中。
* skill 可以包含可执行代码示例（pi 不会运行示例代码，但会基于它们工作）。

### 多个 Skill 协作

skill 可以引用其他 skill:

```markdown
---
name: deploy
description: Deploy the application to production
---

Follow these steps:

1. Run the [test-suite] skill
2. Build the project
3. Use the [cloud-deploy] skill to push the artifact
```

### Skill 包

skill 可以打包为 npm 包:

```json
{
  "name": "my-pi-skills",
  "pi": {
    "skills": ["./skills/code-review", "./skills/deploy"]
  }
}
```

参见 [Pi packages（Pi 包）](/docs/latest/pi-packages)。

### 调试

* `/skills` 列出所有已加载的 skill 及其描述
* `/skill:<name>` 即使是自动调用的 skill 也可以显式加载

---

## 12. Prompt templates（提示模板）

来源: https://pi.dev/docs/latest/prompt-templates

> 可重用的 prompt 模板，参数化变量用于工作流。

### 什么是提示模板？

提示模板是带有占位符的 Markdown 文件，使用 `/prompt:<name>` 调用。

### 最小示例

创建一个文件 `prompts/plan.md`:

```markdown
Plan the implementation of: $ARGUMENTS

Consider:
- Edge cases
- Error handling
- Tests
```

调用:

```text
/prompt:plan user authentication with OAuth
```

`$ARGUMENTS` 被替换为 `/prompt:` 之后的整个字符串。

### 占位符语法

| 语法 | 描述 |
|----------|-------------|
| `$1`, `$2`, ... | 位置参数 |
| `$@` 或 `$*` | 所有参数 |
| `${1:-default}` | 第一个参数，如果为空则使用默认值 |
| `${VAR}` | 环境变量（来自当前 shell） |

### 高级示例

`prompts/review-pr.md`:

```markdown
Review PR #$1: $2

Focus areas:
${3:-security, performance, style}

Repository conventions:
- Tests are required for new features
- Use TypeScript strict mode
- Follow the [style guide](https://example.com/style)
```

调用:

```text
/prompt:review-pr 1234 "Add OAuth support" security
```

### 位置

* **全局**: `~/.pi/agent/prompts/`
* **项目**: `.pi/prompts/`（仅在项目被信任后）
* **包**: 任何带有 `.md` 扩展名的文件
* **设置**: `resources.prompts` 数组

### Frontmatter

```yaml
---
name: plan
description: Plan the implementation of a feature
argumentHint: <feature description>
---
```

frontmatter 中的 `argumentHint` 显示在命令面板中。

### 内置提示

* `/help` - 显示帮助
* `/compact` - 压缩上下文
* `/fork` - Fork 会话
* `/export` - 导出会话

### 共享提示

将模板作为 npm 包发布:

```json
{
  "name": "team-prompts",
  "pi": {
    "prompts": ["./prompts/*.md"]
  }
}
```

参见 [Pi packages（Pi 包）](/docs/latest/pi-packages)。

---

## 13. Themes（主题）

来源: https://pi.dev/docs/latest/themes

> 主题是 JSON 文件，定义 pi TUI 的颜色、样式和布局。

### 内置主题

* `dark` - 默认深色主题
* `light` - 浅色主题
* `system` - 跟随系统

使用 `/settings` 切换，或在 `settings.json` 中:

```json
{
  "ui": {
    "theme": "dark"
  }
}
```

### 主题格式

主题是一个 JSON 文件，包含所有必需的 token:

```json
{
  "name": "my-theme",
  "colors": {
    "background": "#1e1e1e",
    "foreground": "#d4d4d4",
    "border": "#3e3e3e",
    "accent": "#007acc",
    "userMessage": "#9cdcfe",
    "assistantMessage": "#ce9178",
    "toolCall": "#c586c0",
    "toolResult": "#b5cea8",
    "error": "#f48771",
    "warning": "#dcdcaa",
    "success": "#608b4e"
  }
}
```

### 必需 token

主题**必须**定义所有这些颜色:

| Token | 用途 |
|-------|-------|
| `background` | 主背景 |
| `foreground` | 主文本 |
| `border` | 边框和分隔符 |
| `accent` | 链接、当前行 |
| `userMessage` | 用户消息文本 |
| `assistantMessage` | 助手消息文本 |
| `toolCall` | 工具调用名称 |
| `toolResult` | 工具结果 |
| `error` | 错误消息 |
| `warning` | 警告 |
| `success` | 成功状态 |

主题中省略任何必需的 token 都是错误。

### 颜色格式

支持以下颜色格式:

* 十六进制: `#1e1e1e`、`#fff`
* RGB: `rgb(30, 30, 30)`
* 命名颜色: `red`、`darkgray`
* 终端颜色: `ansiRed`、`brightBlue`

### 位置

* **全局**: `~/.pi/agent/themes/`
* **项目**: `.pi/themes/`（仅在项目被信任后）
* **设置**: `resources.themes` 数组

### 主题切换

```text
/theme my-theme
```

或从 `settings.json` 重新加载。

### 主题包

将主题作为 npm 包分发:

```json
{
  "name": "my-themes",
  "pi": {
    "themes": ["./themes/*.json"]
  }
}
```

参见 [Pi packages（Pi 包）](/docs/latest/pi-packages)。

### 验证

使用 JSON Schema 验证主题:

```bash
npx ajv validate -s theme.schema.json -d my-theme.json
```

---

## 14. Pi packages（Pi 包）

来源: https://pi.dev/docs/latest/pi-packages

> 将扩展、skill、提示和主题打包并发布为 npm 包。

### 包结构

```
my-pi-package/
├── package.json
├── README.md
├── extensions/
│   └── my-extension.ts
├── skills/
│   └── my-skill/
│       └── SKILL.md
├── prompts/
│   └── my-prompt.md
└── themes/
    └── my-theme.json
```

### package.json

```json
{
  "name": "my-pi-package",
  "version": "0.1.0",
  "description": "My pi extensions and skills",
  "type": "module",
  "pi": {
    "extensions": ["./extensions/*.ts"],
    "skills": ["./skills/*/SKILL.md"],
    "prompts": ["./prompts/*.md"],
    "themes": ["./themes/*.json"]
  },
  "keywords": ["pi-package"]
}
```

`pi` 字段描述包中包含的资源。

### 关键字标签

用关键字标记你的包以便于发现:

* `pi-package` - 通用 pi 包
* `pi-extension` - 包含扩展
* `pi-skill` - 包含 skill
* `pi-theme` - 包含主题
* `pi-prompt` - 包含提示模板

### 安装

```bash
npm install -g my-pi-package
```

全局安装后，资源会自动发现并加载。

### 项目本地包

在项目内安装:

```bash
npm install my-pi-package
```

该包需要列在 `package.json` 的依赖中并被信任。

### 自动发现

pi 在以下位置查找包:

* 全局 `node_modules`（在 `$PATH` 中）
* 项目 `node_modules`
* 工作区中的任何 `pi-package` 标签的包

### 资源匹配

包中的资源路径使用通配符:

* `extensions/*.ts` - `extensions/` 目录中的所有 TypeScript 文件
* `skills/*/SKILL.md` - `skills/` 中所有子目录的 `SKILL.md` 文件
* `prompts/*.md` - `prompts/` 目录中的所有 Markdown 文件
* `themes/*.json` - `themes/` 目录中的所有 JSON 文件

### 单仓库（Monorepo）支持

在 monorepo 中，pi 扫描所有工作区包:

```json
{
  "workspaces": ["packages/*"]
}
```

每个工作区包都可以提供自己的 `pi` 字段。

### 发布

```bash
npm publish
```

确保:

* `package.json` 中包含 `pi` 字段
* 已添加 `pi-package` 关键字
* README 描述了包含的资源

### 范围命名空间

使用 `@scope/pi-*` 来分组 pi 资源:

```bash
npm install -g @myorg/pi-team-toolkit
```

---

## 15. Custom models（自定义模型）

来源: https://pi.dev/docs/latest/custom-models

> 添加模型选择器中未列出的自定义模型。

### 添加自定义模型

编辑 `~/.pi/agent/models.json`:

```json
{
  "providers": {
    "anthropic": {
      "models": {
        "claude-sonnet-4-5-thinking": {
          "name": "Claude Sonnet 4.5 (Extended Thinking)",
          "contextWindow": 200000,
          "maxOutputTokens": 64000
        }
      }
    }
  }
}
```

### 模型字段

| 字段 | 必需 | 描述 |
|-------|----------|-------------|
| `name` | ✓ | 显示名称 |
| `contextWindow` | ✓ | 总上下文大小（输入 + 输出） |
| `maxOutputTokens` | ✓ | 最大输出 token 数 |
| `cost` | ✗ | 成本估算（每百万 token） |
| `capabilities` | ✗ | `["tools", "vision", "thinking"]` 之一 |
| `api` | ✗ | 端点覆盖（参见 [Custom providers（自定义提供商）](/docs/latest/custom-providers)） |

### 示例：添加思考变体

```json
{
  "providers": {
    "anthropic": {
      "models": {
        "claude-sonnet-4-5-thinking": {
          "name": "Claude Sonnet 4.5 (Thinking)",
          "contextWindow": 200000,
          "maxOutputTokens": 64000,
          "capabilities": ["tools", "thinking"]
        }
      }
    }
  }
}
```

### 成本估算

```json
{
  "anthropic": {
    "claude-sonnet-4-5": {
      "cost": {
        "input": 3.0,
        "output": 15.0
      }
    }
  }
}
```

成本以每百万 token 美元计。

### 能力

| 能力 | 描述 |
|------------|-------------|
| `tools` | 支持工具调用 |
| `vision` | 支持图像输入 |
| `thinking` | 显示扩展思考 |
| `streaming` | 支持流式输出 |

### 模型选择器

使用 `Ctrl+M` 或 `/model` 打开模型选择器。自定义模型与内置模型一起列出，并标注来源。

### 项目级模型

将 `models.json` 放在 `.pi/` 目录中以进行项目级配置（仅在项目被信任后）。

### 验证

如果模型缺少必需字段或值无效，pi 启动时会报告错误。

---

## 16. Custom providers（自定义提供商）

来源: https://pi.dev/docs/latest/custom-providers

> 添加 pi 内置支持之外的 LLM 提供商，例如内部部署的端点或自托管网关。

### 添加自定义提供商

编辑 `~/.pi/agent/providers.json`:

```json
{
  "providers": {
    "my-provider": {
      "api": "openai",
      "baseUrl": "https://api.example.com/v1",
      "apiKey": "${MY_PROVIDER_API_KEY}",
      "models": {
        "my-model": {
          "name": "My Model",
          "contextWindow": 128000,
          "maxOutputTokens": 8192
        }
      }
    }
  }
}
```

### 字段

| 字段 | 必需 | 描述 |
|-------|----------|-------------|
| `api` | ✓ | API 类型: `openai` 或 `anthropic` |
| `baseUrl` | ✓ | 端点 URL |
| `apiKey` | ✓ | API key（支持 `${ENV_VAR}`） |
| `models` | ✓ | 模型定义 |
| `headers` | ✗ | 额外的 HTTP 头 |
| `requestTransform` | ✗ | 自定义请求转换 |
| `responseTransform` | ✗ | 自定义响应转换 |

### API 类型

#### OpenAI 兼容

```json
{
  "api": "openai",
  "baseUrl": "https://api.openrouter.ai/api/v1"
}
```

任何实现 OpenAI Chat Completions API 的服务都可以使用此类型。

#### Anthropic 兼容

```json
{
  "api": "anthropic",
  "baseUrl": "https://api.anthropic.com"
}
```

实现 Anthropic Messages API 的服务使用此类型。

### 环境变量

在配置中使用 `${VAR_NAME}` 引用环境变量:

```json
{
  "apiKey": "${MY_API_KEY}"
}
```

变量从 `process.env` 解析（启动时）。如果未设置，pi 会显示错误。

### 自定义头部

```json
{
  "headers": {
    "X-Custom-Header": "value",
    "X-Request-ID": "${REQUEST_ID}"
}
```

### 请求/响应转换

对于不符合标准 API 的提供商:

```json
{
  "requestTransform": "function transform(req) { /* ... */ }",
  "responseTransform": "function transform(res) { /* ... */ }"
}
```

转换以 JavaScript 字符串形式存储，由 pi 在运行时评估。

### 端点示例

#### OpenRouter

```json
{
  "providers": {
    "openrouter": {
      "api": "openai",
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKey": "${OPENROUTER_API_KEY}",
      "models": {
        "anthropic/claude-sonnet-4-5": {
          "name": "Claude Sonnet 4.5 (via OpenRouter)",
          "contextWindow": 200000,
          "maxOutputTokens": 8192
        }
      }
    }
  }
}
```

#### 自托管 vLLM

```json
{
  "providers": {
    "vllm": {
      "api": "openai",
      "baseUrl": "http://localhost:8000/v1",
      "apiKey": "not-needed",
      "models": {
        "meta-llama/Llama-3-70b": {
          "name": "Llama 3 70B (local vLLM)",
          "contextWindow": 8192,
          "maxOutputTokens": 2048
        }
      }
    }
  }
}
```

#### LM Studio

```json
{
  "providers": {
    "lmstudio": {
      "api": "openai",
      "baseUrl": "http://localhost:1234/v1",
      "apiKey": "lm-studio",
      "models": {
        "local-model": {
          "name": "Local LM Studio Model",
          "contextWindow": 8192,
          "maxOutputTokens": 2048
        }
      }
    }
  }
}
```

### 项目级提供商

将 `providers.json` 放在 `.pi/` 目录中以进行项目级配置（仅在项目被信任后）。

### 优先级

* CLI 标志
* `.pi/providers.json`
* `~/.pi/agent/providers.json`
* 内置提供商

### 验证

pi 在启动时验证提供商配置。错误包括:

* 缺少必需字段
* 无效的 URL
* 无法解析的环境变量
* 重复的提供商 ID

---

## 17. SDK（软件开发工具包）

来源: https://pi.dev/docs/latest/sdk

> pi 的核心作为可嵌入的 SDK。在你自己的应用程序中集成会话、工具和事件。

### 安装

```bash
npm install @earendil-works/pi-coding-agent
```

### 快速上手

```typescript
import { createAgentSession } from "@earendil-works/pi-coding-agent";

const { session, extensions } = await createAgentSession({
  model: "anthropic/claude-sonnet-4-5",
  systemPrompt: "You are a helpful coding assistant.",
});

session.subscribe((event) => {
  console.log(event.type, event);
});

await session.prompt("Refactor src/api/users.ts to use async/await");
```

### API 参考

#### `createAgentSession(options)`

创建一个新的代理会话。

```typescript
interface CreateAgentSessionOptions {
  model: string;                  // "<provider>/<model>"
  systemPrompt?: string;           // 系统提示
  cwd?: string;                    // 工作目录（默认：process.cwd()）
  sessionDir?: string;             // 自定义会话目录
  extensions?: ExtensionAPI[];     // 内置扩展
  tools?: Tool[];                  // 自定义工具
  theme?: Theme;                   // 自定义主题
  settings?: Settings;             // 自定义设置
  env?: Record<string, string>;    // 环境变量
}
```

返回:

```typescript
interface AgentSession {
  session: Session;
  extensions: ExtensionAPI[];
  dispose: () => Promise<void>;
}
```

#### `session.prompt(input)`

向模型发送用户输入。

```typescript
await session.prompt("Fix the bug in line 42");
```

* `input`: `string` 或结构化消息数组
* 返回: 完成时 resolve 的 promise

#### `session.subscribe(listener)`

订阅事件流。

```typescript
const unsubscribe = session.subscribe((event) => {
  switch (event.type) {
    case "message_start":
      console.log("Model started:", event.message);
      break;
    case "message_update":
      // streaming delta
      break;
    case "message_end":
      console.log("Model finished:", event.message);
      break;
    case "tool_call":
      console.log("Tool called:", event.tool, event.args);
      break;
    case "tool_result":
      console.log("Result:", event.result);
      break;
  }
});

// Later:
unsubscribe();
```

#### `session.fork(atMessageId)`

从特定消息处 fork 会话。

```typescript
const forked = await session.fork(event.message.id);
```

#### `session.compact()`

手动触发压缩。

```typescript
await session.compact();
```

#### `session.export(format)`

导出会话。

```typescript
const html = await session.export("html");
const json = await session.export("json");
```

### 事件类型

| 事件 | 载荷 | 描述 |
|-------|---------|-------------|
| `session_start` | `{ session }` | 会话已初始化 |
| `turn_start` | `{ turn }` | 用户回合开始 |
| `turn_end` | `{ turn }` | 回合结束 |
| `message_start` | `{ message }` | 模型消息开始 |
| `message_update` | `{ delta }` | 流式增量 |
| `message_end` | `{ message }` | 模型消息结束 |
| `tool_call` | `{ tool, args }` | 工具被调用 |
| `tool_result` | `{ tool, result }` | 工具已完成 |
| `compaction_start` | `{ compaction }` | 压缩开始 |
| `compaction_end` | `{ compaction }` | 压缩结束 |
| `session_end` | `{ session }` | 会话已关闭 |

### 自定义工具

```typescript
import type { Tool } from "@earendil-works/pi-coding-agent";

const myTool: Tool = {
  name: "my_tool",
  description: "Does something",
  parameters: {
    type: "object",
    properties: {
      input: { type: "string" },
    },
    required: ["input"],
  },
  execute: async (args, ctx) => {
    return { output: `Processed: ${args.input}` };
  },
};

const { session } = await createAgentSession({
  model: "anthropic/claude-sonnet-4-5",
  tools: [myTool],
});
```

### 自定义扩展

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const myExtension: ExtensionAPI = async (pi) => {
  pi.registerCommand("greet", {
    description: "Greet the user",
    handler: async (args, ctx) => {
      ctx.ui.notify("Hello!", "info");
    },
  });
};

const { session } = await createAgentSession({
  model: "anthropic/claude-sonnet-4-5",
  extensions: [myExtension],
});
```

### TUI 集成

对于交互式使用，使用 [`@earendil-works/pi-tui`](/docs/latest/tui-components):

```typescript
import { createAgentSession } from "@earendil-works/pi-coding-agent";
import { startTui } from "@earendil-works/pi-tui";

const { session } = await createAgentSession({
  model: "anthropic/claude-sonnet-4-5",
});

await startTui(session);
```

参见 [TUI components（TUI 组件）](/docs/latest/tui-components)。

---

## 18. RPC mode（RPC 模式）

来源: https://pi.dev/docs/latest/rpc

> 以编程方式驱动 pi 作为子进程，通过 JSON-RPC 风格的协议与 stdin/stdout 通信。

### 启动 RPC 模式

```bash
pi --rpc
```

启动 pi 进程，监听 stdin 上的 JSON 请求，在 stdout 上发出 JSON 响应和事件。

### 消息格式

请求（stdin）:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "prompt",
  "params": {
    "content": "List files in src/"
  }
}
```

响应（stdout）:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "messageId": "msg-123",
    "status": "completed"
  }
}
```

事件（stdout）:

```json
{
  "jsonrpc": "2.0",
  "method": "message_update",
  "params": {
    "delta": "Listing"
  }
}
```

### 标准方法

| 方法 | 描述 |
|--------|-------------|
| `prompt` | 发送用户输入 |
| `cancel` | 取消当前操作 |
| `compact` | 触发压缩 |
| `fork` | Fork 会话 |
| `export` | 导出会话 |
| `setModel` | 更改模型 |
| `setSystemPrompt` | 更改系统提示 |
| `getSession` | 获取会话元数据 |
| `listSessions` | 列出已保存的会话 |
| `loadSession` | 加载已保存的会话 |
| `newSession` | 创建新会话 |

### 事件

| 事件 | 描述 |
|-------|-------------|
| `message_start` | 模型消息开始 |
| `message_update` | 流式增量 |
| `message_end` | 模型消息结束 |
| `tool_call` | 工具被调用 |
| `tool_result` | 工具已完成 |
| `compaction_start` | 压缩开始 |
| `compaction_end` | 压缩结束 |
| `error` | 发生错误 |

### 客户端示例（Node.js）

```typescript
import { spawn } from "child_process";
import readline from "readline";

const pi = spawn("pi", ["--rpc"]);

const rl = readline.createInterface({ input: pi.stdout });

rl.on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.method === "message_update") {
    process.stdout.write(msg.params.delta);
  }
});

let nextId = 1;
function send(method: string, params: any) {
  pi.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: nextId++,
    method,
    params,
  }) + "\n");
}

send("prompt", { content: "List files in src/" });
```

### Python 示例

```python
import subprocess
import json

pi = subprocess.Popen(
    ["pi", "--rpc"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    text=True,
    bufsize=1,
)

def send(method, **params):
    msg = {"jsonrpc": "2.0", "id": next(req_id), "method": method, "params": params}
    pi.stdin.write(json.dumps(msg) + "\n")
    pi.stdin.flush()

def on_event(msg):
    if msg.get("method") == "message_update":
        print(msg["params"]["delta"], end="", flush=True)

import itertools
req_id = itertools.count(1)

for line in pi.stdout:
    msg = json.loads(line)
    if "method" in msg:
        on_event(msg)
    elif "result" in msg:
        print(f"\nDone: {msg['result']}")

send("prompt", content="List files in src/")
```

### 多个并发请求

RPC 模式支持多个并发请求。响应按请求 `id` 匹配。

### 取消

```json
{
  "method": "cancel",
  "params": { "requestId": 1 }
}
```

取消正在进行的请求。

### 错误

错误以标准 JSON-RPC 错误形式返回:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32600,
    "message": "Invalid request"
  }
}
```

### 安全

* RPC 模式监听 stdin，无需套接字。
* 在共享主机上，使用 `--rpc-token <secret>` 验证传入的请求。
* RPC 进程在 Linux 上使用孤立进程组，确保与父进程干净分离。

---

## 19. JSON event stream mode（JSON 事件流模式）

来源: https://pi.dev/docs/latest/json-event-stream

> 一次性 CLI 调用，将事件流式传输到 stdout。非常适合 CI/CD 和自动化工作流。

### 概述

JSON 事件流模式在 `pi` 退出前将所有事件作为换行分隔的 JSON 写入 stdout。

### 用法

```bash
pi --json-event-stream "Fix the bug in src/api.ts"
```

stdout:

```
{"type":"session_start","session":{"id":"...","model":"..."}}
{"type":"message_start","message":{"role":"assistant","content":""}}
{"type":"message_update","delta":"Looking"}
{"type":"message_update","delta":" at"}
{"type":"message_update","delta":" the"}
{"type":"message_end","message":{"role":"assistant","content":"Looking at the file..."}}
{"type":"tool_call","tool":"read","args":{"path":"src/api.ts"}}
{"type":"tool_result","tool":"read","result":"..."}
{"type":"turn_end","turn":{"status":"completed"}}
{"type":"session_end","session":{"id":"..."}}
```

### 事件类型

参见 [RPC mode（RPC 模式）](/docs/latest/rpc) 中的事件列表。在 JSON 事件流模式下，事件是简单的 JSON 对象（无 `jsonrpc` 包装）。

### 退出码

* `0`: 成功完成
* `1`: 错误（模型错误、配置错误等）
* `130`: 用户中断（SIGINT）

### 与 RPC 的区别

| 特性 | JSON 事件流 | RPC |
|-----|-------------|-----|
| 多次调用 | ✗ | ✓ |
| 双向通信 | ✗ | ✓ |
| 一次性 | ✓ | ✗ |
| 适合 CI | ✓ | ✗ |
| 适合编辑器 | ✗ | ✓ |

### CI/CD 示例

```yaml
# GitHub Actions
- name: Run pi
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  run: |
    pi --json-event-stream "Update API documentation" \
      --output jsonl > events.jsonl
```

### 处理事件

```bash
pi --json-event-stream "Refactor auth.ts" | \
  jq -c 'select(.type == "tool_call")'
```

### 与 tee 一起使用

```bash
pi --json-event-stream "..." | tee events.jsonl
```

将事件同时流式传输到 stdout 和文件。

### 提示与上下文

* **持久化**: 使用 `--session <id>` 恢复先前的会话。
* **系统提示**: 使用 `--system-prompt <file>` 从文件加载。
* **文件**: 使用 `--file <path>` 附加文件作为上下文。

### 限制

* 无交互模式。
* 无 UI。
* 不能在回合中途更改模型。

对于这些场景，请使用 [RPC mode（RPC 模式）](/docs/latest/rpc)。

---

## 20. TUI components（TUI 组件）

来源: https://pi.dev/docs/latest/tui-components

> `@earendil-works/pi-tui` 是驱动 pi 交互式界面的组件库。在你的扩展和自定义工具中复用。

### 安装

```bash
npm install @earendil-works/pi-tui
```

### 快速上手

```typescript
import { Box, Text, render } from "@earendil-works/pi-tui";

const app = Box({
  children: [
    Text({ content: "Hello, world!", color: "accent" }),
  ],
  border: "round",
  padding: 1,
});

await render(app);
```

### 原语

#### `Box`

布局容器，支持 flexbox 样式布局。

```typescript
Box({
  children: [...],
  direction: "row" | "column",   // 默认 "column"
  gap: 1,
  padding: 1,
  margin: 1,
  border: "single" | "double" | "round" | "none",
  borderColor: "accent",
  width: 80,
  height: 24,
  flex: 1,
  alignItems: "flex-start" | "center" | "flex-end" | "stretch",
  justifyContent: "flex-start" | "center" | "flex-end" | "space-between",
})
```

#### `Text`

样式化文本。

```typescript
Text({
  content: "Hello",
  color: "accent" | "#ff0000" | "rgb(255, 0, 0)",
  bold: true,
  italic: true,
  underline: true,
  dim: true,
  inverse: true,
  wrap: "wrap" | "truncate" | "truncate-start" | "truncate-middle" | "truncate-end",
})
```

#### `Selector`

可滚动列表，支持选择。

```typescript
Selector({
  items: [
    { label: "Option 1", value: 1 },
    { label: "Option 2", value: 2 },
  ],
  onSelect: (item) => console.log("Selected:", item),
  maxVisible: 10,
})
```

#### `Input`

单行文本输入。

```typescript
Input({
  placeholder: "Type here...",
  onSubmit: (value) => console.log("Submitted:", value),
  onChange: (value) => console.log("Changed:", value),
  initialValue: "",
  password: false,
})
```

#### `TextArea`

多行文本输入。

```typescript
TextArea({
  placeholder: "Multi-line input...",
  onSubmit: (value) => console.log("Submitted:", value),
  initialValue: "",
  maxHeight: 10,
})
```

#### `Confirm`

是/否确认对话框。

```typescript
const ok = await Confirm({
  message: "Are you sure?",
  default: false,
});
```

#### `Select`

从列表中选择一项。

```typescript
const choice = await Select({
  message: "Pick one",
  options: [
    { label: "Yes", value: true },
    { label: "No", value: false },
  ],
});
```

#### `MultiSelect`

从列表中选择多个项。

```typescript
const choices = await MultiSelect({
  message: "Pick options",
  options: [...],
});
```

#### `Spinner`

不确定进度的加载旋转器。

```typescript
const spinner = Spinner({ message: "Loading..." });
spinner.start();
// ...
spinner.stop();
```

#### `ProgressBar`

确定进度的进度条。

```typescript
const bar = ProgressBar({ total: 100 });
bar.update(50);
```

#### `Notify`

临时通知（toast）。

```typescript
Notify({ message: "Saved", type: "info" | "warning" | "error" });
```

### 钩子

#### `useKeyboard`

订阅键盘事件。

```typescript
useKeyboard((event) => {
  if (event.key === "q" && event.ctrl) {
    process.exit(0);
  }
});
```

#### `useResize`

订阅终端大小变化。

```typescript
useResize((size) => {
  console.log("Size:", size.cols, size.rows);
});
```

#### `useTheme`

访问当前主题。

```typescript
const theme = useTheme();
console.log(theme.colors.accent);
```

### 完整示例：登录表单

```typescript
import { Box, Text, Input, Button, useKeyboard, render } from "@earendil-works/pi-tui";

function LoginForm() {
  const username = Input({ placeholder: "Username" });
  const password = Input({ placeholder: "Password", password: true });

  useKeyboard((event) => {
    if (event.key === "Enter") {
      console.log("Login:", username.value, password.value);
      process.exit(0);
    }
  });

  return Box({
    direction: "column",
    gap: 1,
    padding: 1,
    border: "round",
    children: [
      Text({ content: "Login", bold: true }),
      username,
      password,
      Text({ content: "Press Enter to submit", dim: true }),
    ],
  });
}

await render(LoginForm());
```

### 与 SDK 集成

TUI 与 [SDK](/docs/latest/sdk) 无缝配合:

```typescript
import { createAgentSession } from "@earendil-works/pi-coding-agent";
import { startTui } from "@earendil-works/pi-tui";

const { session } = await createAgentSession({
  model: "anthropic/claude-sonnet-4-5",
});

await startTui(session);
```

---

## 21. Session format（会话格式）

来源: https://pi.dev/docs/latest/session-format

> 会话以 JSON 文件形式存储在本地，结构为消息树。本文档描述其结构。

### 文件位置

* **默认**: `~/.pi/agent/sessions/`
* **项目**: `<project>/.pi/sessions/`（如果配置）
* **每个会话**: `<id>.json`

### 顶层结构

```json
{
  "version": 1,
  "id": "2026-07-08T10-30-00-abc123",
  "model": "anthropic/claude-sonnet-4-5",
  "systemPrompt": "...",
  "createdAt": "2026-07-08T10:30:00.000Z",
  "updatedAt": "2026-07-08T11:15:23.000Z",
  "messages": [ ... ],
  "compaction": [ ... ],
  "metadata": { ... }
}
```

### 消息结构

每个消息都是一个节点，可以有父节点和子节点:

```json
{
  "id": "msg-1",
  "parentId": null,
  "type": "user" | "model" | "tool_call" | "tool_result" | "compaction" | "branch_summary",
  "timestamp": "2026-07-08T10:30:15.000Z",
  "content": "...",
  "tool": { ... },
  "result": { ... }
}
```

#### 用户消息

```json
{
  "id": "msg-1",
  "type": "user",
  "content": "List files in src/"
}
```

#### 模型消息

```json
{
  "id": "msg-2",
  "type": "model",
  "content": "I'll list the files for you.",
  "usage": {
    "inputTokens": 1234,
    "outputTokens": 56,
    "costUSD": 0.0023
  }
}
```

#### 工具调用

```json
{
  "id": "msg-3",
  "type": "tool_call",
  "tool": {
    "name": "bash",
    "args": {
      "command": "ls src/"
    }
  }
}
```

#### 工具结果

```json
{
  "id": "msg-4",
  "type": "tool_result",
  "result": {
    "output": "api.ts\nmain.ts\nutils.ts",
    "exitCode": 0
  }
}
```

#### 压缩节点

```json
{
  "id": "msg-5",
  "type": "compaction",
  "summary": "User asked to list files...",
  "tokensBefore": 142000,
  "tokensAfter": 42000,
  "compactedMessages": ["msg-1", "msg-2", "msg-3", "msg-4"]
}
```

### 树结构

消息形成一棵树，根节点是第一条用户消息。Fork 创建新分支:

```
msg-1 (user)
├── msg-2 (model)
│   ├── msg-3 (tool_call)
│   └── msg-4 (tool_result)
└── msg-6 (forked user message)
    └── msg-7 (model)
```

### 分支摘要

`branch_summary` 节点汇总一个分支以供后续使用:

```json
{
  "id": "summary-1",
  "type": "branch_summary",
  "branchRoot": "msg-6",
  "summary": "Tried alternative approach..."
}
```

### 元数据

```json
{
  "metadata": {
    "title": "Refactor users.ts",
    "tags": ["refactor", "auth"],
    "starred": true,
    "costUSD": 0.42,
    "durationMs": 60000
  }
}
```

### 工具原始数据

内置工具可以存储工具特定的额外数据:

```json
{
  "id": "msg-3",
  "type": "tool_call",
  "tool": {
    "name": "read",
    "args": { "path": "src/api.ts" },
    "raw": {
      "fileSize": 4096,
      "encoding": "utf-8"
    }
  }
}
```

### 校验和

每个会话文件以 SHA-256 校验和开头，防止意外损坏:

```json
{
  "checksum": "sha256:abc123...",
  ...
}
```

校验和是消息的哈希，按规范化的 JSON 序列化计算。

### 加载

```typescript
import { loadSession } from "@earendil-works/pi-coding-agent";

const session = await loadSession("2026-07-08T10-30-00-abc123");
```

### 损坏恢复

如果会话文件损坏或校验和不匹配，pi 会:

1. 备份为 `<id>.corrupted.json`
2. 创建新会话
3. 在控制台中记录错误

### 导入/导出

* `/export` 导出为 HTML（带语法高亮）或 JSON
* `--import <file>` 导入 JSON 会话

### 存储估算

粗略估算:

* 简单聊天: ~1 KB/消息
* 含工具调用: ~5-50 KB/消息
* 包含代码: 最多 ~500 KB/消息

---

## 22. Windows（Windows）

来源: https://pi.dev/docs/latest/windows

> 在 Windows 上运行 pi。注意路径、终端和性能问题。

### 平台支持

| 平台 | 状态 |
|----------|--------|
| **WSL**（推荐） | 完全支持 |
| **Windows Terminal** | 支持 |
| **Git Bash** | 支持 |
| **PowerShell** | 支持（有限） |
| **CMD** | 不支持 |

### WSL（推荐）

在 Windows 上运行 pi 的最佳方式是在 [WSL 2](https://learn.microsoft.com/en-us/windows/wsl/install) 内:

1. 安装 WSL 2
2. 安装 Node.js（在 WSL 内）
3. 安装 pi（在 WSL 内）: `npm install -g @mariozechner/pi-coding-agent`
4. 从项目目录运行 `pi`

#### 性能

WSL 2 在 `\\wsl$\` 路径上的 I/O 速度较慢。从 WSL 文件系统（`~/projects/`）运行项目可以显著提升性能。

#### Windows Terminal

使用 [Windows Terminal](https://aka.ms/terminal) 作为 WSL 的前端，享受现代化的标签页、窗格和真彩色支持。

### Git Bash

Git Bash 附带 [Git for Windows](https://git-scm.com/download/win)。它能工作，但:

* 没有真彩色（256 色限制）
* 路径转换可能干扰 `bash` 工具
* 鼠标支持有限

### PowerShell

PowerShell 5.1（内置）和 PowerShell 7+ 都可以工作。已知问题:

* ANSI 转义序列在旧版 Windows 10 上可能渲染不正确
* 启用 [Windows Terminal](https://aka.ms/terminal) 获得最佳效果

### Python 路径

pi 在 Windows 上检测 Python 解释器:

```bash
where python
where python3
where py
```

如果 `python` 不在 PATH 中，使用 `--python` 标志或设置 `PYTHON` 环境变量。

### 路径处理

Windows 路径 (`C:\Users\foo`) 在内部规范化为正斜杠 (`C:/Users/foo`)。与 shell 工具交互时，pi 使用正斜杠。

### 已知问题

#### 文件权限

Windows 文件权限与 POSIX 不同。`chmod` 不可用，但 `bash` 工具的权限检查会被跳过。

#### 换行符

如果 `core.autocrlf=true`（Git 默认），文件可能包含 CRLF 行尾。pi 会自动检测并规范化。

#### 性能

在 Windows 上原生运行比在 WSL 中慢。涉及许多小文件操作的工作流（如大型 monorepo）建议使用 WSL。

### 故障排除

#### "无法找到模块"

确保 `node` 在 PATH 中:

```powershell
$env:PATH += ";C:\Program Files\nodejs"
```

#### "EACCES: permission denied"

以管理员身份运行终端，或将 pi 安装到用户目录: `npm install -g --prefix %APPDATA%\npm`。

#### 终端显示乱码

* 使用 [Windows Terminal](https://aka.ms/terminal)
* 在设置中启用真彩色
* 验证字体支持 Unicode 字符

### 资源

* [Microsoft WSL 文档](https://learn.microsoft.com/en-us/windows/wsl/)
* [Windows Terminal 文档](https://learn.microsoft.com/en-us/windows/terminal/)
* [Node.js on Windows](https://nodejs.org/en/download/package-manager/#windows)

---

## 23. Termux on Android（在 Android 的 Termux 上运行）

来源: https://pi.dev/docs/latest/termux

> 在 Android 设备上通过 Termux 运行 pi。

### 安装 Termux

从 [F-Droid](https://f-droid.org/packages/com.termux/) 安装 Termux（**不要**从 Google Play 安装 — Play 版本已过时）。

### 安装 Node.js

```bash
pkg update
pkg install nodejs-lts
```

### 安装 pi

```bash
npm install -g @mariozechner/pi-coding-agent
```

### 存储配置

Termux 默认在内部存储上，可能空间有限。设置外部存储:

```bash
termux-setup-storage
```

将项目存储在 `/data/data/com.termux/files/storage/shared/` 下的目录中。

### 键盘技巧

Termux 提供额外的按键:

| 按键 | 描述 |
|-----|-------------|
| `音量上` | `Ctrl` |
| `音量下` | `Meta`（`Alt`） |
| 长按 | 调出特殊键菜单 |

启用 Termux:API 插件以获得更多按键（Esc、Tab、箭头）。

### Termux:API

安装 [Termux:API](https://f-droid.org/packages/com.termux.api/) 应用以获得:

* 剪贴板访问
* 振动
* 通知
* Toast 消息

```bash
pkg install termux-api
```

### Git

```bash
pkg install git
```

为 Termux 配置 git:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### SSH

```bash
pkg install openssh
```

从远程主机拉取项目:

```bash
ssh user@server
```

### 会话同步

使用 [Synchronize Termux](https://github.com/termux/termux-sync) 或手动同步:

```bash
rsync -avz ~/projects/ user@server:~/projects/
```

### 性能

* 大型 monorepo 较慢（Android 文件系统开销）
* 使用 `--compact-mode` 减少 UI 重绘
* 考虑使用 cloud 部署进行重型工作

### 故障排除

#### "EACCES: permission denied"

Termux 的 home 目录是 `/data/data/com.termux/files/home`。确保所有文件都在这里或外部存储中。

#### "无法找到模块"

重新安装 Node.js: `pkg reinstall nodejs-lts`。

#### 网络问题

Termux 使用 Android 的网络栈。如果 pi 超时:

```bash
ping api.anthropic.com
```

### 电池优化

Android 可能会杀死后台 Termux 进程。禁用电池优化:

* 设置 → 应用 → Termux → 电池 → 不优化

### 资源

* [Termux Wiki](https://wiki.termux.com/)
* [Termux 社区](https://www.reddit.com/r/termux/)
* [F-Droid](https://f-droid.org/)

---

## 24. tmux（tmux 集成）

来源: https://pi.dev/docs/latest/tmux

> 在 tmux 内部或旁边运行 pi，实现持久会话、远程工作和抗断网保护。

### 概述

[tmux](https://github.com/tmux/tmux/wiki) 是一个终端多路复用器，可以:

* 在单个终端中运行多个会话、窗口和窗格
* 保持进程在断开连接后存活
* 从一台机器附加会话到另一台

pi 与 tmux 配合良好，用于远程工作流和长时间运行的任务。

### 安装 tmux

```bash
# macOS
brew install tmux

# Ubuntu/Debian
sudo apt install tmux

# Fedora
sudo dnf install tmux
```

### 基本键位

#### 前缀键

所有 tmux 命令都以 `Ctrl+B` 开头，然后是命令键:

| 序列 | 动作 |
|---------|--------|
| `Ctrl+B "` | 水平分割 |
| `Ctrl+B %` | 垂直分割 |
| `Ctrl+B ↑` | 切换到上方的窗格 |
| `Ctrl+B ↓` | 切换到下方的窗格 |
| `Ctrl+B ←` | 切换到左侧的窗格 |
| `Ctrl+B →` | 切换到右侧的窗格 |
| `Ctrl+B c` | 新建窗口 |
| `Ctrl+B n` | 下一个窗口 |
| `Ctrl+B p` | 上一个窗口 |
| `Ctrl+B d` | 分离（detach） |
| `Ctrl+B s` | 列出会话 |
| `Ctrl+B $` | 重命名会话 |
| `Ctrl+B ,` | 重命名窗口 |
| `Ctrl+B [` | 进入复制模式 |

### 在 tmux 中运行 pi

#### 简单启动

```bash
tmux new -s pi
pi
```

分离: `Ctrl+B d`。重新附加:

```bash
tmux attach -t pi
```

#### 布局示例

左窗格: pi。右窗格: shell 用于测试。

```
┌─────────────────┬──────────────┐
│                 │              │
│       pi        │     shell    │
│                 │              │
│                 │              │
└─────────────────┴──────────────┘
```

创建:

```bash
tmux new -s pi -d
tmux split-window -h -t pi
tmux send-keys -t pi:0.0 'pi' Enter
```

### 抗断网

tmux 最强大的功能是即使 SSH 连接断开，进程也会继续运行:

1. SSH 到远程主机
2. 启动 tmux: `tmux new -s work`
3. 在 tmux 中运行 `pi`
4. 断开 SSH
5. 重新连接
6. 重新附加: `tmux attach -t work`

pi 的会话会持续存在。

### 远程工作流

#### 从本地附加到远程

```bash
ssh user@server -t "tmux attach -t pi"
```

#### 在远程创建新会话

```bash
ssh user@server "tmux new -s pi -d && tmux send-keys -t pi:0.0 'pi' Enter"
```

### 配置

`~/.tmux.conf`:

```bash
# Use 256 colors
set -g default-terminal "screen-256color"
set -ga terminal-overrides ",xterm-256color:Tc"

# Increase scrollback
set -g history-limit 100000

# Faster escape
set -sg escape-time 0

# Mouse support
set -g mouse on

# True color
set -ga terminal-overrides ",*256col*:Tc"
set -ga terminal-overrides ",xterm-256color*:Tc"

# Reload config with r
bind r source-file ~/.tmux.conf \; display "Config reloaded!"
```

### pi 的最佳实践

#### 每个项目一个会话

```bash
tmux new -s myproject
cd ~/projects/myproject
pi
```

#### 命名窗格

使用 `Ctrl+B ,` 重命名窗口，或在 `.tmux.conf` 中:

```bash
bind , command-prompt -I "#W" "rename-window '%%'"
```

#### 使用状态栏显示信息

在 `.tmux.conf` 中:

```bash
set -g status-right "#(hostname) | %H:%M"
```

### 常见问题

#### 颜色不正确

在 `~/.tmux.conf` 中:

```bash
set -g default-terminal "tmux-256color"
set -ga terminal-overrides ",xterm-256color:Tc"
```

#### 鼠标不工作

```bash
set -g mouse on
```

如果鼠标仍不起作用，请在 `~/.pi/agent/settings.json` 中:

```json
{
  "terminal": {
    "mouseEnabled": true
  }
}
```

#### 滚动速度慢

增大回滚缓冲区:

```bash
set -g history-limit 1000000
```

### 资源

* [tmux Wiki](https://github.com/tmux/tmux/wiki)
* [tmux 速查表](https://tmuxcheatsheet.com/)
* [Oh My Tmux](https://github.com/gpakosz/.tmux)

---

## 25. Terminal setup（终端设置）

来源: https://pi.dev/docs/latest/terminal-setup

> 配置你的终端以获得最佳的 pi 体验。

### 字体

pi 使用 Unicode 字符显示图标（工具状态、加载旋转器等）。安装一个 [Nerd Font](https://www.nerdfonts.com/):

* **JetBrainsMono Nerd Font**（推荐）
* **FiraCode Nerd Font**
* **Hack Nerd Font**

#### 配置你的终端

| 终端 | 设置 |
|---------|--------|
| **iTerm2** | Preferences → Profiles → Text → Font |
| **Alacritty** | `~/.config/alacritty/alacritty.toml` |
| **kitty** | `~/.config/kitty/kitty.conf` |
| **WezTerm** | `~/.config/wezterm/wezterm.lua` |
| **Windows Terminal** | Settings → Profile → Appearance |
| **GNOME Terminal** | Preferences → Profile → Custom font |

### 真彩色（True Color）

pi 输出 24 位真彩色。确保你的终端支持。

#### 验证

```bash
echo $COLORTERM
```

应输出 `truecolor` 或 `24bit`。

#### 强制启用

在 shell 配置中:

```bash
export COLORTERM=truecolor
```

### 环境变量

| 变量 | 描述 |
|----------|-------------|
| `TERM` | 终端类型（例如 `xterm-256color`、`tmux-256color`） |
| `COLORTERM` | 颜色深度（`truecolor` 表示 24 位） |
| `LANG` / `LC_ALL` | 语言环境（设置为 `en_US.UTF-8` 或 `C.UTF-8`） |
| `NO_COLOR` | 设为非空值时禁用所有 ANSI 颜色 |
| `FORCE_COLOR` | 强制启用颜色（即使在非 TTY 上） |

### iTerm2

推荐配置:

1. **Preferences → Profiles → Text**:
   * 字体: JetBrainsMono Nerd Font，大小 13
   * 字符间距: 1.0
2. **Preferences → Profiles → Window**:
   * 列数: 120
   * 行数: 40
3. **Preferences → Advanced**:
   * 勾选 "Place cursor at vertical scroll position"

### Alacritty

`~/.config/alacritty/alacritty.toml`:

```toml
[font]
size = 13

[font.normal]
family = "JetBrainsMono Nerd Font"
style = "Regular"

[window]
padding = { x = 8, y = 8 }

[env]
TERM = "xterm-256color"
```

### kitty

`~/.config/kitty/kitty.conf`:

```conf
font_family      JetBrainsMono Nerd Font
font_size        13.0
scrollback_lines 10000
```

### WezTerm

`~/.config/wezterm/wezterm.lua`:

```lua
local wezterm = require 'wezterm'
local config = wezterm.config_builder()

config.font = wezterm.font 'JetBrainsMono Nerd Font'
config.font_size = 13
config.initial_rows = 40
config.initial_cols = 120

return config
```

### Windows Terminal

`%LOCALAPPDATA%\Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json`:

```json
{
  "profiles": {
    "defaults": {
      "font": {
        "face": "JetBrainsMono Nerd Font",
        "size": 12
      }
    }
  }
}
```

### GNOME Terminal

```bash
gsettings set org.gnome.Terminal.Legacy.Profile:/org/gnome/terminal/legacy/profiles:/:b1dcc9dd-5262-4d8d-a863-c897e6d979b9/ font 'JetBrainsMono Nerd Font 13'
```

（用你的 profile UUID 替换 `:b1dcc9dd-...`。）

### SSH 远程服务器

使用 tmux 进行持久会话。参见 [tmux](/docs/latest/tmux)。

```bash
ssh -t user@server "tmux attach -t pi || tmux new -s pi"
```

### 故障排除

#### 字符显示为方框

* 安装 Nerd Font
* 在终端设置中配置字体
* 验证终端支持 Unicode: `echo "✓ ✓ ✗"`

#### 颜色看起来褪色

* 启用真彩色
* 验证 `$COLORTERM=truecolor`

#### 鼠标不工作

* 启用鼠标报告: `set -g mouse on` (tmux)
* 在设置中: `terminal.mouseEnabled: true`

#### 性能问题

* 增大回滚缓冲区
* 减小窗口尺寸
* 禁用鼠标支持

### 资源

* [Nerd Fonts](https://www.nerdfonts.com/)
* [iTerm2 文档](https://iterm2.com/documentation.html)
* [Alacritty 文档](https://alacritty.org/config-alacritty.html)
* [kitty 文档](https://sw.kovidgoyal.net/kitty/conf/)
* [WezTerm 文档](https://wezterm.org/config/files.html)

---

## 26. Shell aliases（Shell 别名）

来源: https://pi.dev/docs/latest/shell-aliases

> 为 pi 命令创建 shell 别名，提高速度。

### 基本别名

在 shell 配置文件中添加一行:

#### zsh (`~/.zshrc`)

```bash
alias pi="pi"
```

#### bash (`~/.bashrc`)

```bash
alias pi="pi"
```

#### fish (`~/.config/fish/config.fish`)

```fish
abbr pi pi
```

### 常用别名

```bash
# 带模型的快速启动
alias pi-sonnet="pi --model anthropic/claude-sonnet-4-5"
alias pi-opus="pi --model anthropic/claude-opus-4-5"
alias pi-haiku="pi --model anthropic/claude-haiku-4-5"

# 继续上一个会话
alias pic="pi --continue"

# 恢复特定会话
alias pir="pi --resume"

# 来自剪贴板的问题
alias piq='pbpaste | pi -p'  # macOS
alias piq='xclip -selection clipboard -o | pi -p'  # Linux

# 打印模式（不交互）
alias pip='pi -p'
```

### 项目特定别名

在你的项目目录中创建 `.envrc` 或在 shell 配置中使用条件:

```bash
# 在 ~/projects/myproject 中自动进入 pi
alias myproject="cd ~/projects/myproject && pi"
```

使用 [direnv](https://direnv.net/) 进行项目特定的 shell 环境。

### 补全

#### zsh

pi 支持 zsh 补全:

```bash
# 加载补全
eval "$(pi --completion=zsh)"
```

#### bash

```bash
eval "$(pi --completion=bash)"
```

#### fish

```bash
pi --completion=fish | source
```

### 函数示例

更复杂的工作流:

```bash
# 在当前 git 仓库中打开 pi
pigit() {
  cd "$(git rev-parse --show-toplevel)" || return
  pi "$@"
}

# 带 git diff 的 pi
pidiff() {
  git diff | pi -p "Review this diff"
}

# 带 git status 的 pi
pistatus() {
  git status --short | pi -p "What changed?"
}
```

### 资源

* [zsh 别名文档](https://zsh.sourceforge.io/Doc/Release/Shell-Builtin-Commands.html)
* [fish abbr 文档](https://fishshell.com/docs/current/cmds/abbr.html)
* [direnv](https://direnv.net/)

---

## 27. Development（开发指南）

来源: https://pi.dev/docs/latest/development

> 了解 pi 仓库布局、构建系统、测试和质量门。

### 仓库结构

pi 仓库是一个 pnpm 工作区，monorepo 结构如下:

```
.
├── packages/
│   ├── coding-agent/        # 核心代理（CLI、RPC、SDK、JSON 事件流）
│   │   ├── src/
│   │   │   ├── cli.ts              # CLI 入口
│   │   │   ├── core/               # 代理核心循环
│   │   │   ├── modes/              # 交互、RPC、JSON、打印模式
│   │   │   ├── tools/              # 内置工具
│   │   │   ├── providers/          # 内置 LLM Provider
│   │   │   ├── session/            # 会话持久化
│   │   │   └── utils/              # 实用函数
│   │   ├── test/                   # 测试
│   │   └── package.json
│   │
│   ├── tui/                  # 终端 UI 库
│   │   ├── src/
│   │   │   ├── components/         # 可重用组件
│   │   │   ├── primitives/         # 原子 UI 原语
│   │   │   └── utils/              # 实用函数
│   │   └── package.json
│   │
│   └── agent/                # Pi 包加载器
│       ├── src/
│       │   ├── package-loader.ts
│       │   └── skill-loader.ts
│       └── package.json
│
├── docs/                     # 此文档站
│   ├── app/
│   ├── components/
│   └── content/
│
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

### pnpm 工作区

```bash
# 安装所有工作区依赖
pnpm install

# 在所有工作区运行命令
pnpm -r run build
pnpm -r run test
```

### 构建

```bash
# 构建所有包
pnpm -r run build

# 构建特定包
pnpm --filter @earendil-works/pi-coding-agent build
pnpm --filter @earendil-works/pi-tui build

# 监听模式（开发）
pnpm --filter @earendil-works/pi-coding-agent dev
```

### 测试

```bash
# 运行所有测试
pnpm -r run test

# 运行特定包的测试
pnpm --filter @earendil-works/pi-coding-agent test

# 监视模式
pnpm --filter @earendil-works/pi-coding-agent test --watch

# 带覆盖率
pnpm --filter @earendil-works/pi-coding-agent test --coverage
```

### 代码质量

#### 类型检查

```bash
pnpm -r run typecheck
```

#### Lint

```bash
pnpm -r run lint
```

#### 格式化

```bash
pnpm -r run format        # 应用 prettier
pnpm -r run format:check  # 验证
```

### 调试

#### 日志

启用详细日志:

```bash
DEBUG=pi:* pi
DEBUG=pi:agent pi
DEBUG=pi:tools pi
```

#### 调试器

VS Code launch.json:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug pi",
      "program": "${workspaceFolder}/packages/coding-agent/dist/cli.js",
      "args": [],
      "console": "integratedTerminal"
    }
  ]
}
```

#### 复现 bug

最小复现:

```bash
# 使用固定模型，无扩展，无技能
pi --model anthropic/claude-sonnet-4-5 --no-extensions
```

### 贡献流程

1. **Fork 仓库**
2. **创建分支**: `git checkout -b feature/my-change`
3. **编写代码** 并附测试
4. **运行所有质量门**: `pnpm -r run typecheck lint test`
5. **提交** 并附描述性消息
6. **推送** 并打开 PR

#### 提交消息约定

我们使用 [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(tools): add new bash tool option
fix(session): handle corrupt session files
docs: update quickstart
test: add coverage for compaction
```

### 添加新的 LLM Provider

参见 `packages/coding-agent/src/providers/` 中的现有 Provider 模板:

1. 在 `packages/coding-agent/src/providers/` 中创建 `myprovider.ts`
2. 实现 `Model` 数组导出
3. 在 `packages/coding-agent/src/providers/index.ts` 中注册
4. 添加 OAuth/Token 流程
5. 编写测试

#### 模板

```typescript
import type { Model, ApiProvider, StreamOptions } from "./types.js";

export class MyProvider implements ApiProvider {
  readonly id = "myprovider";

  async listModels(): Promise<Model[]> {
    return [
      {
        id: "my-model",
        name: "My Model",
        provider: "myprovider",
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsTools: true,
        cost: { input: 0, output: 0 },
      },
    ];
  }

  async streamCompletion(options: StreamOptions): Promise<AsyncIterable<unknown>> {
    // 实现 API 调用
  }
}
```

### 添加新的内置工具

参见 `packages/coding-agent/src/tools/` 中的现有工具:

1. 在 `packages/coding-agent/src/tools/` 中创建 `mytool.ts`
2. 实现工具接口:

```typescript
import type { Tool, ToolContext, ToolResult } from "./types.js";

export const myTool: Tool = {
  name: "my_tool",
  description: "What this tool does",
  parameters: {
    type: "object",
    properties: {
      arg1: { type: "string", description: "First argument" },
    },
    required: ["arg1"],
  },

  async execute(args: { arg1: string }, ctx: ToolContext): Promise<ToolResult> {
    // 实现工具逻辑
    return {
      content: [{ type: "text", text: "Result" }],
    };
  },
};
```

3. 在 `packages/coding-agent/src/tools/index.ts` 中注册
4. 编写测试

### 发布流程

pi 使用 [changesets](https://github.com/changesets/changesets) 进行版本管理:

1. **创建 changeset**: `pnpm changeset`
2. **提交**: `git add . && git commit -m "feat: new feature"`
3. **PR 被合并** → CI 创建 "Version Packages" PR
4. **合并 Version Packages PR** → 包发布到 npm

#### 手动发布

```bash
# 构建
pnpm -r run build

# 登录 npm
npm login

# 发布特定包
pnpm --filter @earendil-works/pi-coding-agent publish
```

### 资源

* [pnpm 工作区文档](https://pnpm.io/workspaces)
* [Conventional Commits](https://www.conventionalcommits.org/)
* [Changesets 文档](https://github.com/changesets/changesets)
* [Node.js 文档](https://nodejs.org/docs)
* [TypeScript 文档](https://www.typescriptlang.org/docs)

---



---



---



---



---



---



---