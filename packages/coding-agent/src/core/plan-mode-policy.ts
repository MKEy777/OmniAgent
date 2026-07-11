import { isAbsolute, relative, resolve, sep } from "node:path";

export interface PolicyDecision {
	allowed: boolean;
	reason?: string;
}

const VERSION_COMMANDS = new Set([
	"node",
	"npm",
	"pnpm",
	"yarn",
	"bun",
	"python",
	"python3",
	"pip",
	"pip3",
	"uv",
	"poetry",
	"rustc",
	"cargo",
	"go",
	"java",
	"javac",
	"mvn",
	"gradle",
	"docker",
	"docker-compose",
	"git",
]);

const EXACT_COMMANDS = new Set([
	"pwd",
	"npm config get registry",
	"pnpm config get registry",
	"yarn config get registry",
	"git status --short",
	"git status --porcelain",
	"git diff --stat",
	"git diff --name-only",
	"git ls-files",
	"git rev-parse --show-toplevel",
	"git branch --show-current",
]);

const SHELL_META_PATTERN = /[\n\r|&;<>(){}[\]$`"'*?]/;
const TOOL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9._-]*$/;

const SAFE_READONLY_COMMANDS = new Set([
	"cat",
	"head",
	"tail",
	"wc",
	"file",
	"du",
	"df",
	"stat",
	"env",
	"printenv",
	"uname",
	"hostname",
	"date",
	"uptime",
]);

function normalizeForCompare(path: string): string {
	return resolve(path);
}

export function isPathInsideRoot(path: string, root: string): boolean {
	const resolvedPath = normalizeForCompare(path);
	const resolvedRoot = normalizeForCompare(root);
	const relativePath = relative(resolvedRoot, resolvedPath);
	return (
		relativePath === "" ||
		(relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))
	);
}

export function resolvePlanModePath(cwd: string, path: string): string {
	return resolve(cwd, path);
}

export function isPlanWritePathAllowed(
	cwd: string,
	path: string,
	options: { allowProjectBackgroundWrite: boolean },
): boolean {
	const resolved = resolvePlanModePath(cwd, path);
	const planRoot = resolve(cwd, ".pi", "plan");
	const planContextBackground = resolve(cwd, ".pi", "plan", "context", "project-background.md");
	if (!isPathInsideRoot(resolved, planRoot)) {
		return false;
	}
	if (resolved === planContextBackground) {
		return options.allowProjectBackgroundWrite;
	}

	const relativeToPlan = relative(planRoot, resolved).split(sep);
	if (relativeToPlan.length === 2 && relativeToPlan[1] === "plan.json") {
		return relativeToPlan[0] !== "context" && relativeToPlan[0] !== "" && !relativeToPlan[0].startsWith(".");
	}
	if (relativeToPlan.length >= 3 && relativeToPlan[1] === "context") {
		return relativeToPlan[0] !== "context" && relativeToPlan[0] !== "" && !relativeToPlan[0].startsWith(".");
	}
	return false;
}

export function getPlanReadPathDecision(
	cwd: string,
	path: string,
	explicitExternalReadRoots: string[],
): PolicyDecision {
	const resolved = resolvePlanModePath(cwd, path || ".");
	if (isPathInsideRoot(resolved, cwd)) {
		return { allowed: true };
	}
	for (const root of explicitExternalReadRoots) {
		if (isPathInsideRoot(resolved, root)) {
			return { allowed: true };
		}
	}
	return {
		allowed: false,
		reason: `Plan mode cannot read outside the project unless the user explicitly mentioned that path: ${path}`,
	};
}

export function userTextAllowsProjectBackgroundWrite(text: string): boolean {
	const confirmationWords = [
		"update",
		"write",
		"edit",
		"refresh",
		"confirm",
		"confirmed",
		"allow",
		"\u5141\u8bb8",
		"\u786e\u8ba4",
		"\u66f4\u65b0",
		"\u5199\u5165",
	];
	return new RegExp(`(?:${confirmationWords.join("|")}).{0,80}project-background\\.md`, "i").test(text);
}
export function extractExplicitExternalReadRoots(cwd: string, userText: string): string[] {
	const roots = new Set<string>();
	const tokenPattern = /(?:@)?(?:"([^"]+)"|'([^']+)'|`([^`]+)`|([^\s,;]+))/g;
	for (const match of userText.matchAll(tokenPattern)) {
		const raw = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
		const token = raw.replace(/^@/, "").replace(/[.)\]}]+$/g, "");
		if (!looksLikePathToken(token)) continue;
		const resolved = resolvePlanModePath(cwd, token);
		if (!isPathInsideRoot(resolved, cwd)) {
			roots.add(resolved);
		}
	}
	return [...roots];
}

function looksLikePathToken(token: string): boolean {
	if (!token) return false;
	if (/^[A-Za-z]:[\\/]/.test(token)) return true;
	if (token.startsWith("/") || token.startsWith("\\") || token.startsWith("~")) return true;
	if (token.startsWith("../") || token.startsWith("..\\") || token.startsWith("./") || token.startsWith(".\\")) {
		return true;
	}
	return token.includes("/") || token.includes("\\");
}

export function getPlanBashCommandDecision(command: string): PolicyDecision {
	const trimmed = command.trim().replace(/\s+/g, " ");
	if (!trimmed) {
		return { allowed: false, reason: "Plan mode blocks this bash command. Empty commands are not allowed." };
	}
	if (SHELL_META_PATTERN.test(trimmed)) {
		return { allowed: false, reason: "Plan mode blocks this bash command. Shell syntax is not allowed." };
	}
	if (EXACT_COMMANDS.has(trimmed)) {
		return { allowed: true };
	}

	const parts = trimmed.split(" ");
	if (parts.length === 2 && VERSION_COMMANDS.has(parts[0]) && parts[1] === "--version") {
		return { allowed: true };
	}
	if (parts.length === 2 && (parts[0] === "which" || parts[0] === "where") && TOOL_NAME_PATTERN.test(parts[1])) {
		return { allowed: true };
	}

	if (parts.length >= 1 && SAFE_READONLY_COMMANDS.has(parts[0])) {
		return { allowed: true };
	}

	if (parts[0] === "git" && parts.length >= 2) {
		const gitSubcmd = parts[1];
		const safeGitSubcommands = new Set(["status", "log", "diff", "show", "branch", "tag", "remote", "stash"]);
		if (safeGitSubcommands.has(gitSubcmd)) {
			return { allowed: true };
		}
	}

	if ((parts[0] === "npm" || parts[0] === "pnpm" || parts[0] === "yarn") && parts.length >= 2) {
		const subcmd = parts[1];
		const safeSubcmds = new Set(["list", "ls", "info", "view", "show", "outdated", "why", "explain"]);
		if (safeSubcmds.has(subcmd)) {
			return { allowed: true };
		}
	}

	return {
		allowed: false,
		reason: "Plan mode blocks this bash command. Use read/grep/find/ls or switch to Coding mode.",
	};
}
