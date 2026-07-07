import { APP_NAME } from "../config.ts";
import type { SourceInfo } from "./source-info.ts";

export type SlashCommandSource = "extension" | "prompt" | "skill";

export interface SlashCommandInfo {
	name: string;
	description?: string;
	source: SlashCommandSource;
	sourceInfo: SourceInfo;
}

export interface BuiltinSlashCommand {
	name: string;
	description: string;
	descriptionZh: string;
}

export const BUILTIN_SLASH_COMMANDS: ReadonlyArray<BuiltinSlashCommand> = [
	{ name: "settings", description: "Open settings menu", descriptionZh: "打开设置菜单" },
	{ name: "model", description: "Select model (opens selector UI)", descriptionZh: "选择模型（打开选择器界面）" },
	{
		name: "scoped-models",
		description: "Enable/disable models for Ctrl+P cycling",
		descriptionZh: "启用/禁用模型以在 Ctrl+P 中切换",
	},
	{
		name: "export",
		description: "Export session (HTML default, or specify path: .html/.jsonl)",
		descriptionZh: "导出会话（默认 HTML，可指定路径）",
	},
	{
		name: "import",
		description: "Import and resume a session from a JSONL file",
		descriptionZh: "从 JSONL 文件导入并恢复会话",
	},
	{
		name: "share",
		description: "Share session as a secret GitHub gist",
		descriptionZh: "将会话分享为私密 GitHub Gist",
	},
	{
		name: "copy",
		description: "Copy last agent message to clipboard",
		descriptionZh: "复制上一条 Agent 消息到剪贴板",
	},
	{ name: "name", description: "Set session display name", descriptionZh: "设置会话显示名称" },
	{ name: "session", description: "Show session info and stats", descriptionZh: "查看会话信息和统计" },
	{ name: "changelog", description: "Show changelog entries", descriptionZh: "查看变更日志" },
	{ name: "hotkeys", description: "Show all keyboard shortcuts", descriptionZh: "查看所有键盘快捷键" },
	{
		name: "fork",
		description: "Create a new fork from a previous user message",
		descriptionZh: "从之前的用户消息创建新分支",
	},
	{
		name: "clone",
		description: "Duplicate the current session at the current position",
		descriptionZh: "复制当前会话",
	},
	{ name: "tree", description: "Navigate session tree (switch branches)", descriptionZh: "导航会话树（切换分支）" },
	{ name: "trust", description: "Save project trust decision for future sessions", descriptionZh: "保存项目信任决策" },
	{ name: "login", description: "Configure provider authentication", descriptionZh: "配置提供商认证" },
	{ name: "logout", description: "Remove provider authentication", descriptionZh: "移除提供商认证" },
	{ name: "new", description: "Start a new session", descriptionZh: "开始新会话" },
	{ name: "compact", description: "Manually compact the session context", descriptionZh: "手动压缩会话上下文" },
	{ name: "resume", description: "Resume a different session", descriptionZh: "恢复其他会话" },
	{
		name: "reload",
		description: "Reload keybindings, extensions, skills, prompts, and themes",
		descriptionZh: "重新加载快捷键、扩展、技能、提示和主题",
	},
	{ name: "quit", description: `Quit ${APP_NAME}`, descriptionZh: "退出 Pi" },
	{ name: "zh", description: "Switch descriptions to Chinese", descriptionZh: "将命令描述切换为中文" },
	{ name: "en", description: "Switch descriptions to English", descriptionZh: "将命令描述切换为英文" },
];
