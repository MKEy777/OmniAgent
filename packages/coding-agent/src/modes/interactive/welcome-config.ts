import chalk from "chalk";

export const COLORS = {
	bg: chalk.hex("#E5E7EB"),
	panelBg: chalk.hex("#C9CDD5"),
	textMuted: chalk.hex("#8A93A8"),
	textNormal: chalk.hex("#64748B"),
	blue: chalk.hex("#2563EB"),
	blueBright: chalk.hex("#3B82F6"),
	purple: chalk.hex("#8B5CF6"),
	purpleBright: chalk.hex("#A855F7"),
	cursor: chalk.hex("#2563EB"),
	white: chalk.hex("#FFFFFF"),
};

export let BRAND_TITLE = "HELLO YM";
export let PLACEHOLDER = 'Ask anything... "Fix broken tests"';
export let STATUS_MODE = "Build";
export let STATUS_AGENT = "Pi Agent";
export let STATUS_MODEL = "DeepSeek V4 Flash Free";
export let STATUS_REASONING = "high";
export let STATUS_VERSION = "0.1.0";

export function setBrandTitle(title: string): void {
	BRAND_TITLE = title;
}
export function setPlaceholder(text: string): void {
	PLACEHOLDER = text;
}
export function setStatusMode(mode: string): void {
	STATUS_MODE = mode;
}
export function setStatusAgent(agent: string): void {
	STATUS_AGENT = agent;
}
export function setStatusModel(model: string): void {
	STATUS_MODEL = model;
}
export function setStatusReasoning(reasoning: string): void {
	STATUS_REASONING = reasoning;
}
export function setStatusVersion(version: string): void {
	STATUS_VERSION = version;
}

export interface ShortcutEntry {
	key: string;
	desc: string;
}

export let SHORTCUTS: ShortcutEntry[] = [
	{ key: "tab", desc: "agents" },
	{ key: "esc", desc: "interrupt" },
	{ key: "ctrl+m", desc: "models" },
	{ key: "@file", desc: "files" },
	{ key: "/name", desc: "skills" },
];

export function setShortcuts(shortcuts: ShortcutEntry[]): void {
	SHORTCUTS = shortcuts;
}

export let TIPS: string[] = [
	"Use @file to reference files in your message",
	"Use /name to invoke a skill by name",
	"Use /skill:name when a skill name conflicts with a command",
	"Use /model to choose any model",
	"Use !! to run bash commands (excluded from context)",
	"Use /zh and /en to switch command descriptions between Chinese and English",
];

export function setTips(tips: string[]): void {
	TIPS = tips;
}

export const ASCII_HELLO = [
	"██╗  ██╗███████╗██╗     ██╗      ██████╗ ",
	"██║  ██║██╔════╝██║     ██║     ██╔═══██╗",
	"███████║█████╗  ██║     ██║     ██║   ██║",
	"██╔══██║██╔══╝  ██║     ██║     ██║   ██║",
	"██║  ██║███████╗███████╗███████╗╚██████╔╝",
	"╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝ ╚═════╝ ",
];

export const ASCII_YM = [
	"██╗   ██╗███╗   ███╗",
	"╚██╗ ██╔╝████╗ ████║",
	" ╚████╔╝ ██╔████╔██║",
	"  ╚██╔╝  ██║╚██╔╝██║",
	"   ██║   ██║ ╚═╝ ██║",
	"   ╚═╝   ╚═╝     ╚═╝",
];

export const ASCII_TITLE_WIDTH = ASCII_HELLO[0].length + 4 + ASCII_YM[0].length;
