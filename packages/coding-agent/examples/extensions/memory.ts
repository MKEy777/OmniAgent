import { existsSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { lock as acquireLock } from "proper-lockfile";
import { Type } from "typebox";

// ============================================================================
// Constants
// ============================================================================

const DECAY_ALPHA = 0.5;
const TOKEN_BUDGET = 2000;
const AUTO_CONSOLIDATE_THRESHOLD = 5;
const RULES_GUARD_PATH = ".pi/agent/rules.md";

const MEMORY_CHAR_LIMIT_SOFT = 8000;
const MEMORY_CHAR_LIMIT_HARD = 12000;
const PROFILE_CHAR_LIMIT_SOFT = 3000;
const PROFILE_CHAR_LIMIT_HARD = 5000;

const CONSOLIDATE_LOCK_PATH = ".pi/events/.consolidate.lock";

const EVENT_TYPES = ["preference", "fact", "project", "agent", "history"] as const;
const EVENT_SCOPES = ["user", "agent", "project"] as const;

type EventType = (typeof EVENT_TYPES)[number];
type EventScope = (typeof EVENT_SCOPES)[number];

// ============================================================================
// Helpers
// ============================================================================

function getAgentDir(): string {
	const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
	return join(home, ".pi", "agent");
}

function getProjectDir(cwd: string): string {
	return join(cwd, ".pi");
}

function getEventsDir(cwd: string, sub: string): string {
	return join(cwd, ".pi", "events", sub);
}

function getThreadDir(cwd: string): string {
	return join(cwd, ".pi", "runtime", "threads");
}

async function ensureDir(dir: string): Promise<void> {
	if (!existsSync(dir)) {
		await mkdir(dir, { recursive: true });
	}
}

function isoDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

/** Extract simple keywords from text (lowercased, deduped). 3+ for ASCII, 2+ for CJK. */
function extractKeywords(text: string): string[] {
	const hasCJK = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text);
	const minLen = hasCJK ? 2 : 3;
	const words = text
		.toLowerCase()
		.split(/\W+/)
		.filter((w) => w.length >= minLen && !/^\d+$/.test(w));
	return [...new Set(words)];
}

/** Check if any keyword matches a piece of text. */
function keywordMatch(text: string, keywords: string[]): boolean {
	const lower = text.toLowerCase();
	return keywords.some((k) => lower.includes(k));
}

/** Score = confidence × decay(age) where decay = 1/(1 + α × age_hours). */
function calculateScore(confidence: number, timestamp: string): number {
	const ageHours = (Date.now() - new Date(timestamp).getTime()) / 3_600_000;
	return confidence * (1 / (1 + DECAY_ALPHA * Math.max(0, ageHours)));
}

/** Rough token estimate: ~4 chars per token. */
function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

/** Extract topic for fuzzy merge: first sentence/fragment capped at 60 chars. */
function extractTopic(content: string): string {
	return content
		.split("\n")[0]
		.slice(0, 60)
		.replace(/[[\]().,:!?]/g, "")
		.trim()
		.toLowerCase();
}

// ============================================================================
// Thread state (short-term session memory)
// ============================================================================

interface ThreadState {
	sessionId: string;
	updatedAt: string;
	taskSummary?: string;
	tempFindings?: string[];
	pendingTodos?: string[];
}

function getThreadPath(cwd: string, sessionId: string): string {
	return join(getThreadDir(cwd), `${sessionId}.json`);
}

async function saveThreadState(cwd: string, sessionId: string, state: Partial<ThreadState>): Promise<void> {
	const dir = getThreadDir(cwd);
	await ensureDir(dir);
	const path = getThreadPath(cwd, sessionId);
	const existing: ThreadState = existsSync(path)
		? JSON.parse(await readFile(path, "utf-8").catch(() => "{}"))
		: { sessionId, updatedAt: new Date().toISOString() };
	const merged: ThreadState = { ...existing, ...state, sessionId, updatedAt: new Date().toISOString() };
	await writeFile(path, JSON.stringify(merged, null, 2), "utf-8");
}

async function loadThreadState(cwd: string, sessionId: string): Promise<ThreadState | null> {
	const path = getThreadPath(cwd, sessionId);
	if (!existsSync(path)) return null;
	return JSON.parse(await readFile(path, "utf-8").catch(() => "null"));
}

async function removeThreadState(cwd: string, sessionId: string): Promise<void> {
	const path = getThreadPath(cwd, sessionId);
	if (existsSync(path)) {
		await rename(path, `${path}.bak`).catch(() => {});
	}
}

// ============================================================================
// Content template helpers
// ============================================================================

/** Strip empty placeholder sections (e.g. "## Section\n（占位符）") from agent memory */
function stripEmptySections(content: string): string {
	const lines = content.split("\n");
	const result: string[] = [];
	const placeholderRE = /^[（(][^）)]*[）)]\s*$/;
	let skipNextHeading = false;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const isHeading = /^##\s/.test(line);
		const isPlaceholder = placeholderRE.test(line.trim());
		if (isHeading) {
			// Check if next non-empty line is a placeholder
			let nextNonEmpty = "";
			for (let j = i + 1; j < lines.length; j++) {
				if (lines[j].trim()) {
					nextNonEmpty = lines[j].trim();
					break;
				}
			}
			if (nextNonEmpty && placeholderRE.test(nextNonEmpty)) {
				skipNextHeading = true;
				continue;
			}
			skipNextHeading = false;
		}
		if (skipNextHeading || isPlaceholder) continue;
		result.push(line);
	}
	return result.join("\n");
}

function formatMemoryBlock(rules: string, profile: string, projectMemory: string, recentEvents: string): string {
	const parts: string[] = ["<Memory>"];

	if (rules.trim()) {
		parts.push("[Rules]", rules.trim());
	}

	if (profile.trim()) {
		parts.push("[User Profile]", profile.trim());
	}

	if (projectMemory.trim()) {
		parts.push("[Memory]", projectMemory.trim());
	}

	if (recentEvents.trim()) {
		parts.push("[Recent History]", recentEvents.trim());
	}

	parts.push("</Memory>");
	return parts.join("\n\n");
}

// ============================================================================
// MemoryWriteQueue: debounced writes with atomic rename
// ============================================================================

class MemoryWriteQueue {
	private pending = new Map<string, { content: string; timer: ReturnType<typeof setTimeout> | null }>();

	enqueue(path: string, content: string): void {
		const existing = this.pending.get(path);
		if (existing) {
			clearTimeout(existing.timer!);
		}
		const entry = { content, timer: null as ReturnType<typeof setTimeout> | null };
		this.pending.set(path, entry);
		entry.timer = setTimeout(() => this.flush(path), 2000);
	}

	private async flush(path: string): Promise<void> {
		const entry = this.pending.get(path);
		if (!entry) return;
		this.pending.delete(path);

		const tmp = `${path}.tmp.${process.pid}`;
		await writeFile(tmp, entry.content, "utf-8");
		await rename(tmp, path);
	}

	async flushAll(): Promise<void> {
		const paths = [...this.pending.keys()];
		await Promise.all(paths.map((p) => this.flush(p)));
	}
}

// ============================================================================
// Consolidation logic
// ============================================================================

interface PendingEvent {
	file: string;
	timestamp: string;
	type: EventType;
	scope: EventScope;
	confidence: number;
	content: string;
}

function parseEventFile(content: string, file: string): PendingEvent[] {
	const events: PendingEvent[] = [];
	const blocks = content.split(/\n(?=## )/);

	for (const block of blocks) {
		const trimmed = block.trim();
		if (!trimmed || !trimmed.startsWith("## ")) continue;

		const lines = trimmed.split("\n");
		const timestamp = lines[0].replace("## ", "").trim();
		const typeLine = lines.find((l) => l.startsWith("type: "));
		const scopeLine = lines.find((l) => l.startsWith("scope: "));
		const confLine = lines.find((l) => l.startsWith("confidence: "));
		const contentStart = lines.findIndex((l) => l.startsWith("content:"));
		if (!typeLine || !scopeLine || contentStart === -1) continue;

		const content = lines
			.slice(contentStart + 1)
			.filter((l) => l.startsWith("- "))
			.map((l) => l.replace(/^- /, ""))
			.join("\n");

		events.push({
			file,
			timestamp,
			type: typeLine.replace("type: ", "").trim() as EventType,
			scope: scopeLine.replace("scope: ", "").trim() as EventScope,
			confidence: confLine ? Number.parseFloat(confLine.replace("confidence: ", "").trim()) : 0.8,
			content,
		});
	}

	return events;
}

async function loadPendingEvents(cwd: string): Promise<PendingEvent[]> {
	const pendingDir = getEventsDir(cwd, "pending");
	if (!existsSync(pendingDir)) return [];

	const files = await readdir(pendingDir);
	const events: PendingEvent[] = [];

	for (const file of files) {
		if (!file.endsWith(".md")) continue;
		const content = await readFile(join(pendingDir, file), "utf-8");
		events.push(...parseEventFile(content, file));
	}

	return events;
}

// ============================================================================
// Consolidation logic (shared by command + auto-trigger)
// ============================================================================

function isPlausibleContent(text: string): boolean {
	if (!text || text.length < 10) return false;
	return /^#\s/.test(text.trim());
}

async function checkCharLimit(
	path: string,
	content: string,
	hardLimit: number,
	softLimit: number,
): Promise<{ ok: boolean; message: string }> {
	const len = content.length;
	if (len > hardLimit) {
		const backup = `${path}.bak.${Date.now()}`;
		await rename(path, backup).catch(() => {});
		return { ok: false, message: `Exceeds hard limit (${len}/${hardLimit}), backed up to ${basename(backup)}` };
	}
	if (len > softLimit) {
		return { ok: true, message: `Exceeds soft limit (${len}/${softLimit})` };
	}
	return { ok: true, message: "" };
}

let _consolidateCount = 0;

const REWRITE_INTERVAL = 5;

function rebuildSections(
	existing: string,
	sectionInjections: Record<string, { newLines: string[]; defaultBody: string[] }>,
): string {
	const lines = existing.split("\n");
	const sections: { header: string; body: string[]; isEmpty: boolean }[] = [];
	let current: { header: string; body: string[]; isEmpty: boolean } | null = null;

	for (const line of lines) {
		if (/^##\s/.test(line)) {
			if (current) sections.push(current);
			const trimmed = line.trim();
			current = { header: trimmed, body: [], isEmpty: true };
		} else if (current) {
			const t = line.trim();
			// Detect placeholder lines like （占位符）
			if (!/^[（(][^）)]*[）)]\s*$/.test(t) && t) {
				current.isEmpty = false;
			}
			current.body.push(line);
		}
	}
	if (current) sections.push(current);

	for (const [header, injection] of Object.entries(sectionInjections)) {
		let matched = false;
		for (const section of sections) {
			if (section.header === `## ${header}` || section.header === header.replace(/^##\s*/, "## ")) {
				const existingBullets = section.body.filter((l) => /^- \[/.test(l.trim()));
				for (const line of injection.newLines) {
					if (!existingBullets.some((b) => b.trim() === line.trim())) {
						if (section.isEmpty && existingBullets.length === 0) {
							section.body = section.body.filter((l) => l.trim() && !/^[（(]/.test(l.trim()));
						}
						section.body.push(line);
						section.isEmpty = false;
					}
				}
				matched = true;
				break;
			}
		}
		if (!matched) {
			sections.push({
				header: `## ${header}`,
				body: [...injection.defaultBody, ...injection.newLines],
				isEmpty: false,
			});
		}
	}

	const result: string[] = [];
	let first = true;
	for (const s of sections) {
		if (first) first = false;
		else result.push("");
		result.push(s.header);
		for (const line of s.body) {
			if (line.trim()) result.push(line);
		}
	}
	result.push("");
	return result.join("\n");
}

async function consolidateEvents(
	cwd: string,
	memEvents: PendingEvent[],
	userEvents: PendingEvent[],
	queue: MemoryWriteQueue,
	rewrite: boolean,
): Promise<{ total: number; memory: number; profile: number }> {
	// Step 1: exact dedup (same content + type → keep latest timestamp)
	const exactMap = new Map<string, PendingEvent>();
	for (const ev of [...memEvents, ...userEvents]) {
		const key = `${ev.type}|${ev.content}`;
		const existing = exactMap.get(key);
		if (!existing || new Date(ev.timestamp) > new Date(existing.timestamp)) {
			exactMap.set(key, ev);
		}
	}

	// Step 2: fuzzy merge (same topic + type → merge)
	const fuzzyMap = new Map<string, PendingEvent>();
	for (const ev of exactMap.values()) {
		const topic = extractTopic(ev.content);
		const fkey = `${ev.type}|${topic}`;
		const existing = fuzzyMap.get(fkey);
		if (!existing) {
			fuzzyMap.set(fkey, ev);
		} else if (fkey !== `${ev.type}|${ev.content}`) {
			if (ev.confidence > existing.confidence) {
				existing.confidence = ev.confidence;
			}
			if (new Date(ev.timestamp) > new Date(existing.timestamp)) {
				existing.timestamp = ev.timestamp;
			}
			if (existing.content !== ev.content) {
				existing.content = `${existing.content}\n${ev.content}`;
			}
		}
	}

	const merged = [...fuzzyMap.values()];
	const pEvents = merged.filter((e) => e.scope === "project");
	const aEvents = merged.filter((e) => e.scope === "agent");
	const uEvents = merged.filter((e) => e.scope === "user");

	const projectDir = getProjectDir(cwd);
	const agentDir = getAgentDir();
	await ensureDir(projectDir);
	await ensureDir(agentDir);

	// Write memory.md (project + agent scope)
	const needsMem = pEvents.length > 0 || aEvents.length > 0;
	if (needsMem) {
		const pLines = pEvents.map((e) => `- [${e.confidence}] ${e.content}`);
		const aLines = aEvents.map((e) => `- [${e.confidence}] ${e.content}`);
		const memPath = join(projectDir, "memory.md");
		const existing = existsSync(memPath) ? await readFile(memPath, "utf-8").catch(() => "") : "";

		let updated: string;
		if (existing && !rewrite) {
			const parts: string[] = [existing.trim()];
			if (pLines.length) parts.push(...pLines);
			if (aLines.length) parts.push(...aLines);
			updated = `${parts.join("\n")}\n`;
		} else if (existing && rewrite) {
			updated = rebuildSections(existing, {
				Facts: { newLines: pLines, defaultBody: [] },
				"Agent Self-Evolution": { newLines: aLines, defaultBody: [] },
			});
		} else {
			const sections: string[] = [
				"# Project Memory",
				"",
				"## Background",
				"（项目是什么：目标、核心模块、当前状态、业务背景）",
				"",
				"## Tech Stack",
				"（项目用什么：框架、语言、依赖、运行方式、构建方式）",
				"",
				"## Decisions",
				"（为什么这么做：架构决策、历史取舍、已踩坑、不再采用的方案）",
				"",
				"## Facts",
			];
			if (pLines.length) sections.push(...pLines);
			if (aLines.length) {
				sections.push("", "## Agent Self-Evolution");
				sections.push(...aLines);
			}
			sections.push("", "## History Summaries", "（历史会话摘要）", "");
			updated = sections.join("\n");
		}

		// Drift detection
		if (!isPlausibleContent(updated)) {
			const backup = `${memPath}.bak.${Date.now()}`;
			await rename(memPath, backup).catch(() => {});
			return { total: 0, memory: 0, profile: 0 };
		}

		// Char limit check
		const limit = await checkCharLimit(memPath, updated, MEMORY_CHAR_LIMIT_HARD, MEMORY_CHAR_LIMIT_SOFT);
		if (!limit.ok) {
			queue.enqueue(memPath, `# Project Memory\n\n## ERROR\nConsolidation blocked: ${limit.message}\n`);
			return { total: 0, memory: 0, profile: 0 };
		}
		queue.enqueue(memPath, updated);
	}

	// Write profile.md (user scope)
	const needsProfile = uEvents.length > 0;
	if (needsProfile) {
		const uLines = uEvents.map((e) => `- [${e.confidence}] ${e.content}`);
		const profilePath = join(agentDir, "profile.md");
		const existing = existsSync(profilePath) ? await readFile(profilePath, "utf-8").catch(() => "") : "";

		let updated: string;
		if (existing && !rewrite) {
			updated = `${existing.trim()}\n${uLines.join("\n")}\n`;
		} else if (existing && rewrite) {
			updated = rebuildSections(existing, {
				Preferences: { newLines: uLines, defaultBody: [] },
			});
		} else {
			updated = `# User Profile\n\n## Preferences\n${uLines.join("\n")}\n\n## Communication Style\n（用户的沟通偏好）\n\n## Habits\n（用户的工作习惯）\n`;
		}

		if (!isPlausibleContent(updated)) {
			const backup = `${profilePath}.bak.${Date.now()}`;
			await rename(profilePath, backup).catch(() => {});
			return { total: 0, memory: 0, profile: 0 };
		}

		const limit = await checkCharLimit(profilePath, updated, PROFILE_CHAR_LIMIT_HARD, PROFILE_CHAR_LIMIT_SOFT);
		if (!limit.ok) {
			queue.enqueue(profilePath, `# User Profile\n\n## ERROR\nConsolidation blocked: ${limit.message}\n`);
			return { total: 0, memory: 0, profile: 0 };
		}
		queue.enqueue(profilePath, updated);
	}

	// Move pending → processed
	const pendingDir = getEventsDir(cwd, "pending");
	const processedDir = getEventsDir(cwd, "processed");
	if (existsSync(pendingDir)) {
		await ensureDir(processedDir);
		const files = await readdir(pendingDir);
		for (const file of files) {
			if (!file.endsWith(".md")) continue;
			await rename(join(pendingDir, file), join(processedDir, file)).catch(() => {});
		}
	}

	return { total: merged.length, memory: pEvents.length + aEvents.length, profile: uEvents.length };
}

// ============================================================================
// Extension
// ============================================================================

export default function (pi: ExtensionAPI) {
	const writeQueue = new MemoryWriteQueue();

	// --------------------------------------------------------------------------
	// 1. memory_log tool: append events to pending/
	// --------------------------------------------------------------------------
	pi.registerTool({
		name: "memory_log",
		label: "Memory Log",
		description:
			"Append an event to the pending memory log (append-only). Events are later consolidated into stable memory files (memory.md / agent.md).",
		promptSnippet:
			"memory_log: record observations, preferences, facts, project knowledge, and agent self-evolution insights",
		promptGuidelines: [
			"Use memory_log to persist user preferences, project facts, decisions, and reusable patterns during conversation",
			"Set confidence based on certainty: 0.95+ for explicit user statements, 0.8 for observed patterns, 0.6 for inferences",
			"type=preference for user style/formatting preferences",
			"type=fact for confirmed project facts",
			"type=project for project structure/architecture decisions",
			"type=agent for cross-project reusable agent lessons",
			"type=history for conversation summaries",
			"scope=user for user-stated information",
			"scope=agent for agent's own observations and lessons",
			"scope=project for project-scoped knowledge",
		],
		parameters: Type.Object({
			content: Type.String({ description: "Event content describing what was learned or observed" }),
			type: StringEnum(EVENT_TYPES),
			scope: StringEnum(EVENT_SCOPES),
			confidence: Type.Optional(Type.Number({ description: "Confidence score 0-1 (default 0.8)", default: 0.8 })),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const pendingDir = getEventsDir(ctx.cwd, "pending");
			await ensureDir(pendingDir);

			const now = new Date();
			const threadId = ctx.sessionManager.getSessionId().slice(0, 8);
			const pendingFile = join(pendingDir, `${isoDate(now)}-${threadId}.md`);

			const event = [
				`## ${now.toISOString()}`,
				"",
				`type: ${params.type}`,
				`scope: ${params.scope}`,
				`confidence: ${params.confidence ?? 0.8}`,
				"source: conversation",
				"",
				"content:",
				`- ${params.content.split("\n").join("\n  ")}`,
				"",
			].join("\n");

			await appendFile(pendingFile, event, "utf-8");

			return {
				details: undefined,
				content: [
					{
						type: "text" as const,
						text: `Memory logged: [${params.scope}/${params.type}] ${params.content}`,
					},
				],
			};
		},
	});

	// --------------------------------------------------------------------------
	// 2. session_start: migrate agent.md → profile.md + memory.md
	// --------------------------------------------------------------------------
	pi.on("session_start", async () => {
		const agentDir = getAgentDir();
		const agentMdPath = join(agentDir, "agent.md");
		const sentinelPath = join(agentDir, ".agent.md.migrated");
		const projectDir = getProjectDir(process.cwd());

		if (!existsSync(agentMdPath) || existsSync(sentinelPath)) return;

		const content = await readFile(agentMdPath, "utf-8").catch(() => "");
		if (!content) return;

		await ensureDir(projectDir);
		await ensureDir(agentDir);

		// Append agent.md content to memory.md under ## Agent Self-Evolution
		const memPath = join(projectDir, "memory.md");
		const memExisting = existsSync(memPath) ? await readFile(memPath, "utf-8").catch(() => "") : "";
		const memUpdated = memExisting
			? `${memExisting.trimEnd()}\n\n## Agent Self-Evolution\n\n${content.trim()}\n`
			: `# Project Memory\n\n## Agent Self-Evolution\n\n${content.trim()}\n`;
		await writeFile(memPath, memUpdated, "utf-8");

		// Create empty profile.md
		const profilePath = join(agentDir, "profile.md");
		if (!existsSync(profilePath)) {
			await writeFile(
				profilePath,
				"# User Profile\n\n## Preferences\n（用户的偏好、风格、习惯）\n\n## Communication Style\n（沟通偏好）\n\n## Habits\n（工作习惯）\n",
				"utf-8",
			);
		}

		// Mark migrated
		await rename(agentMdPath, join(agentDir, "agent.md.migrated")).catch(() => {});
		await writeFile(sentinelPath, new Date().toISOString(), "utf-8");
	});

	// --------------------------------------------------------------------------
	// 3. resources_discover: inject static memory files into base system prompt
	// --------------------------------------------------------------------------
	pi.on("resources_discover", async (event) => {
		const paths: string[] = [];
		const agentDir = getAgentDir();

		const rulesPath = join(agentDir, "rules.md");
		if (existsSync(rulesPath)) paths.push(rulesPath);

		const profilePath = join(agentDir, "profile.md");
		if (existsSync(profilePath)) paths.push(profilePath);

		const projectDir = join(event.cwd, ".pi");
		const memoryPath = join(projectDir, "memory.md");
		if (existsSync(memoryPath)) paths.push(memoryPath);

		return { promptPaths: paths.length > 0 ? paths : undefined };
	});

	// --------------------------------------------------------------------------
	// 4. before_agent_start: inject dynamic <Memory> block each prompt round
	// --------------------------------------------------------------------------
	pi.on("before_agent_start", async (event, ctx) => {
		const projectDir = join(ctx.cwd, ".pi");
		const agentDir = getAgentDir();
		const pendingDir = getEventsDir(ctx.cwd, "pending");

		const readOpts = { encoding: "utf-8" as const };

		const [rules, profile, projectMemory] = await Promise.all([
			existsSync(join(agentDir, "rules.md")) ? readFile(join(agentDir, "rules.md"), readOpts).catch(() => "") : "",
			existsSync(join(agentDir, "profile.md"))
				? readFile(join(agentDir, "profile.md"), readOpts).catch(() => "")
				: "",
			existsSync(join(projectDir, "memory.md"))
				? readFile(join(projectDir, "memory.md"), readOpts).catch(() => "")
				: "",
		]);

		// Read recent pending events (last 3 files)
		let recentEvents = "";
		if (existsSync(pendingDir)) {
			const files = await readdir(pendingDir);
			const recentFiles = files.filter((f) => f.endsWith(".md")).slice(-3);
			const contents = await Promise.all(
				recentFiles.map((f) => readFile(join(pendingDir, f), readOpts).catch(() => "")),
			);
			recentEvents = contents.filter(Boolean).join("\n---\n");
		}

		// Read thread state (short-term session memory)
		const sessionId = ctx.sessionManager.getSessionId().slice(0, 8);
		const threadState = await loadThreadState(ctx.cwd, sessionId);
		let threadBlock = "";
		if (threadState) {
			const parts: string[] = [];
			if (threadState.taskSummary) parts.push(`Task: ${threadState.taskSummary}`);
			if (threadState.tempFindings?.length) parts.push(`Findings: ${threadState.tempFindings.join("; ")}`);
			if (threadState.pendingTodos?.length) parts.push(`Todos: ${threadState.pendingTodos.join(", ")}`);
			if (parts.length) threadBlock = `[Thread State]\n${parts.join("\n")}`;
		}

		const memoryBlock = formatMemoryBlock(
			rules,
			stripEmptySections(profile),
			stripEmptySections(projectMemory),
			recentEvents,
		);
		const fullBlock = threadBlock ? `${memoryBlock}\n\n${threadBlock}` : memoryBlock;
		if (!fullBlock.includes("]")) return;

		return { systemPrompt: `${event.systemPrompt}\n\n${fullBlock}` };
	});

	// --------------------------------------------------------------------------
	// 5. context: score-ranked dynamic recall with token budget
	//    Scans all pending/, memory.md, events/processed/ for keyword matches.
	//    Ranks by score = confidence × decay(age), truncates to TOKEN_BUDGET.
	// --------------------------------------------------------------------------
	pi.on("context", async (event, ctx) => {
		const messages = event.messages;
		const lastMsg = messages[messages.length - 1];
		if (!lastMsg || lastMsg.role !== "user") return;

		const text =
			typeof lastMsg.content === "string"
				? lastMsg.content
				: Array.isArray(lastMsg.content)
					? lastMsg.content
							.filter((c) => c.type === "text")
							.map((c) => c.text)
							.join("\n")
					: "";
		if (!text.trim()) return;

		const keywords = extractKeywords(text);
		if (keywords.length === 0) return;

		// Collect candidates from all memory sources
		const candidates: { score: number; block: string }[] = [];
		const readOpts = { encoding: "utf-8" as const };
		const cwd = ctx.cwd;

		// 4a. pending/ events (structured, with confidence/timestamp)
		const pendingDir = getEventsDir(cwd, "pending");
		if (existsSync(pendingDir)) {
			const files = await readdir(pendingDir);
			for (const f of files) {
				if (!f.endsWith(".md")) continue;
				const content = await readFile(join(pendingDir, f), readOpts).catch(() => "");
				if (!content || !keywordMatch(content, keywords)) continue;

				const events = parseEventFile(content, f);
				for (const ev of events) {
					if (keywordMatch(ev.content, keywords)) {
						const score = calculateScore(ev.confidence, ev.timestamp);
						candidates.push({
							score,
							block: `[${ev.scope}/${ev.type}] ${ev.content} (score: ${score.toFixed(2)})`,
						});
					}
				}
			}
		}

		// 4b. memory.md (stable project facts)
		const memoryPath = join(cwd, ".pi", "memory.md");
		if (existsSync(memoryPath)) {
			const content = await readFile(memoryPath, readOpts).catch(() => "");
			if (content && keywordMatch(content, keywords)) {
				candidates.push({ score: 0.5, block: `[memory.md]\n${content}` });
			}
		}

		// 4c. events/processed/ (already consolidated)
		const processedDir = getEventsDir(cwd, "processed");
		if (existsSync(processedDir)) {
			const files = await readdir(processedDir);
			// Only scan the last 3 processed files to limit cost
			const recentFiles = files.filter((f) => f.endsWith(".md")).slice(-3);
			for (const f of recentFiles) {
				const content = await readFile(join(processedDir, f), readOpts).catch(() => "");
				if (content && keywordMatch(content, keywords)) {
					candidates.push({ score: 0.3, block: `[events/processed/${f}]\n${content}` });
				}
			}
		}

		if (candidates.length === 0) return;

		// Rank by score descending
		candidates.sort((a, b) => b.score - a.score);

		// Truncate to token budget
		let totalTokens = 0;
		const selected: string[] = [];
		for (const c of candidates) {
			const tokens = estimateTokens(c.block);
			if (totalTokens + tokens > TOKEN_BUDGET) continue;
			selected.push(c.block);
			totalTokens += tokens;
		}

		if (selected.length === 0) return;

		const recallBlock = ["<Relevant Memory>", ...selected, "</Relevant Memory>"].join("\n");

		return {
			messages: [
				...messages.slice(0, -1),
				{
					role: "custom" as const,
					customType: "memory-recall",
					content: [{ type: "text" as const, text: recallBlock }],
					display: false,
					timestamp: Date.now(),
				},
				lastMsg,
			],
		};
	});

	// --------------------------------------------------------------------------
	// 6. memory_search: long-tail on-demand memory retrieval
	// --------------------------------------------------------------------------
	pi.registerTool({
		name: "memory_search",
		label: "Memory Search",
		description:
			"Search across all memory sources (memory.md, profile.md, events/pending/, events/processed/) by keyword or topic. Use for long-tail memory not already injected in context. Use specific keyword(s) as the query, for example 'Vitest' or 'TypeScript' or '2 空格'. Chinese 2-character keywords work too.",
		promptSnippet: "memory_search: search project memory, agent experience, and event logs by topic",
		parameters: Type.Object({
			query: Type.String({ description: "Keyword or topic to search for in memory" }),
			maxResults: Type.Optional(Type.Number({ description: "Max results to return (default 5)", default: 5 })),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const keywords = extractKeywords(params.query);
			if (keywords.length === 0) {
				return {
					details: undefined,
					content: [{ type: "text" as const, text: "No searchable keywords in query." }],
				};
			}

			const results: { source: string; content: string }[] = [];
			const readOpts = { encoding: "utf-8" as const };
			const cwd = ctx.cwd;

			// Search memory.md
			const memoryPath = join(cwd, ".pi", "memory.md");
			if (existsSync(memoryPath)) {
				const content = await readFile(memoryPath, readOpts).catch(() => "");
				if (content && keywordMatch(content, keywords)) {
					results.push({ source: "memory.md", content });
				}
			}

			// Search profile.md
			const agentDir = getAgentDir();
			const profilePath = join(agentDir, "profile.md");
			if (existsSync(profilePath)) {
				const content = await readFile(profilePath, readOpts).catch(() => "");
				if (content && keywordMatch(content, keywords)) {
					results.push({ source: "profile.md", content });
				}
			}

			// Search events/pending/
			const pendingDir = getEventsDir(cwd, "pending");
			if (existsSync(pendingDir)) {
				const files = await readdir(pendingDir);
				for (const f of files) {
					if (!f.endsWith(".md")) continue;
					const content = await readFile(join(pendingDir, f), readOpts).catch(() => "");
					if (content && keywordMatch(content, keywords)) {
						const matched = content
							.split(/\n(?=## )/)
							.filter((b) => keywordMatch(b, keywords))
							.join("\n---\n");
						if (matched) results.push({ source: `events/pending/${f}`, content: matched });
					}
				}
			}

			// Search events/processed/
			const processedDir = getEventsDir(cwd, "processed");
			if (existsSync(processedDir)) {
				const files = await readdir(processedDir);
				for (const f of files.slice(-10)) {
					if (!f.endsWith(".md")) continue;
					const content = await readFile(join(processedDir, f), readOpts).catch(() => "");
					if (content && keywordMatch(content, keywords)) {
						const matched = content
							.split(/\n(?=## )/)
							.filter((b) => keywordMatch(b, keywords))
							.join("\n---\n");
						if (matched) results.push({ source: `events/processed/${f}`, content: matched });
					}
				}
			}

			if (results.length === 0) {
				return {
					details: undefined,
					content: [{ type: "text" as const, text: `No memory found for: ${params.query}` }],
				};
			}

			const maxResults = params.maxResults ?? 5;
			const top = results.slice(0, maxResults);
			const text = top.map((r) => `[${r.source}]\n${r.content}`).join("\n\n");

			return {
				details: undefined,
				content: [{ type: "text" as const, text }],
			};
		},
	});

	// --------------------------------------------------------------------------
	// 6. memory_replace: replace content in pending events
	// --------------------------------------------------------------------------
	pi.registerTool({
		name: "memory_replace",
		label: "Memory Replace",
		description:
			"Replace content of a pending event by matching text. Searches events/pending/ for an event whose content contains oldText and replaces it with newContent.",
		promptSnippet: "memory_replace: fix or update a pending memory event",
		parameters: Type.Object({
			oldText: Type.String({ description: "Text to find in event content (substring match)" }),
			newContent: Type.String({ description: "Replacement content" }),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const pendingDir = getEventsDir(ctx.cwd, "pending");
			if (!existsSync(pendingDir)) {
				return { details: undefined, content: [{ type: "text" as const, text: "No pending events to modify." }] };
			}

			const files = await readdir(pendingDir);
			let replaced = false;
			for (const f of files) {
				if (!f.endsWith(".md")) continue;
				const fpath = join(pendingDir, f);
				const content = await readFile(fpath, "utf-8").catch(() => "");
				if (!content || !content.includes(params.oldText)) continue;

				const updated = content.replace(/(content:\n)((?:- .*\n?)*)/g, (match, prefix, body) => {
					if (body.includes(params.oldText)) {
						replaced = true;
						return `${prefix}- ${params.newContent.split("\n").join("\n  ")}\n`;
					}
					return match;
				});

				if (updated !== content) {
					await writeFile(fpath, updated, "utf-8");
				}
			}

			return {
				details: undefined,
				content: [{ type: "text" as const, text: replaced ? "Event replaced." : "No matching event found." }],
			};
		},
	});

	// --------------------------------------------------------------------------
	// 7. memory_remove: remove a pending event by matching text
	// --------------------------------------------------------------------------
	pi.registerTool({
		name: "memory_remove",
		label: "Memory Remove",
		description:
			"Remove a pending event by matching text. Searches events/pending/ for an event whose content contains oldText and removes the entire event block.",
		promptSnippet: "memory_remove: delete a pending memory event",
		parameters: Type.Object({
			oldText: Type.String({ description: "Text to find in event content (substring match)" }),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const pendingDir = getEventsDir(ctx.cwd, "pending");
			if (!existsSync(pendingDir)) {
				return { details: undefined, content: [{ type: "text" as const, text: "No pending events to modify." }] };
			}

			const files = await readdir(pendingDir);
			let removed = false;
			for (const f of files) {
				if (!f.endsWith(".md")) continue;
				const fpath = join(pendingDir, f);
				const content = await readFile(fpath, "utf-8").catch(() => "");
				if (!content || !content.includes(params.oldText)) continue;

				// Remove event blocks containing oldText
				const blocks = content.split(/\n(?=## )/);
				const filtered = blocks.filter((b) => !b.includes(params.oldText));
				if (filtered.length !== blocks.length) {
					removed = true;
					await writeFile(fpath, filtered.join(""), "utf-8");
				}
			}

			return {
				details: undefined,
				content: [{ type: "text" as const, text: removed ? "Event removed." : "No matching event found." }],
			};
		},
	});

	// --------------------------------------------------------------------------
	// 8. memory_edit: directly edit stable memory files (LLM tool)
	// --------------------------------------------------------------------------
	pi.registerTool({
		name: "memory_edit",
		label: "Memory Edit",
		description:
			"Directly edit stable memory files (memory.md or profile.md) with atomic backup. Use to correct or replace consolidated content that cannot be changed via memory_log/memory_replace.",
		promptSnippet: "memory_edit: directly overwrite memory.md or profile.md content",
		parameters: Type.Object({
			target: StringEnum(["memory", "profile"] as const),
			content: Type.String({ description: "Full new content for the file" }),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const path =
				params.target === "profile" ? join(getAgentDir(), "profile.md") : join(getProjectDir(ctx.cwd), "memory.md");

			await ensureDir(getAgentDir());

			const existing = existsSync(path) ? await readFile(path, "utf-8").catch(() => "") : "";
			if (existing) {
				const backup = `${path}.bak.${Date.now()}`;
				await rename(path, backup).catch(() => {});
			}

			const tmp = `${path}.tmp.${process.pid}`;
			await writeFile(tmp, params.content, "utf-8");
			await rename(tmp, path);

			return {
				details: undefined,
				content: [
					{
						type: "text" as const,
						text: `${params.target === "profile" ? "Profile" : "Memory"} updated directly (backup created) / 已直接编辑${params.target === "profile" ? "用户画像" : "项目记忆"}（已备份原文件）`,
					},
				],
			};
		},
	});

	// --------------------------------------------------------------------------
	// 9. memory-consolidate command
	// --------------------------------------------------------------------------
	async function doConsolidate(ctx: {
		cwd: string;
		ui: { notify: (msg: string, type?: "error" | "info" | "warning") => void };
	}): Promise<void> {
		const pendingDir = getEventsDir(ctx.cwd, "pending");
		if (!existsSync(pendingDir)) {
			ctx.ui.notify("No pending events to consolidate / 没有待整合的事件", "info");
			return;
		}

		const events = await loadPendingEvents(ctx.cwd);
		if (events.length === 0) {
			ctx.ui.notify("No valid events found in pending/ / pending/ 中没有有效事件", "info");
			return;
		}

		const lockPath = join(ctx.cwd, CONSOLIDATE_LOCK_PATH);
		let release: (() => Promise<void>) | undefined;
		try {
			release = await acquireLock(lockPath, { realpath: false, retries: 3, stale: 5000 });
		} catch {
			ctx.ui.notify("Another session is consolidating, try later / 其他会话正在整合，请稍后重试", "warning");
			return;
		}

		try {
			const memEvents = events.filter((e) => e.scope === "project" || e.scope === "agent");
			const userEvents = events.filter((e) => e.scope === "user");
			const result = await consolidateEvents(ctx.cwd, memEvents, userEvents, writeQueue, false);
			await writeQueue.flushAll();
			ctx.ui.notify(
				`Consolidated ${result.total} events / 已整合 ${result.total} 条事件 (memory ${result.memory}, profile ${result.profile})`,
				"info",
			);
		} finally {
			if (release) await release().catch(() => {});
		}
	}

	pi.registerCommand("memory-consolidate", {
		description:
			"Consolidate pending events into stable memory files / 整合待处理事件到稳定记忆文件 memory.md / profile.md",
		handler: async (_args, ctx) => doConsolidate(ctx),
	});

	async function doClear(ctx: {
		cwd: string;
		ui: { notify: (msg: string, type?: "error" | "info" | "warning") => void };
	}) {
		const projectDir = join(ctx.cwd, ".pi");
		const agentDir = getAgentDir();
		await ensureDir(projectDir);
		await ensureDir(agentDir);

		const emptyMemory = `# Project Memory\n\n## Background\n（项目是什么：目标、核心模块、当前状态、业务背景）\n\n## Tech Stack\n（项目用什么：框架、语言、依赖、运行方式、构建方式）\n\n## Decisions\n（为什么这么做：架构决策、历史取舍、已踩坑、不再采用的方案）\n\n## Facts\n（长期事实，可按 confidence 标注）\n\n## History Summaries\n（历史会话摘要）\n`;
		await writeFile(join(projectDir, "memory.md"), emptyMemory, "utf-8");

		const emptyProfile = `# User Profile\n\n## Preferences\n（用户的偏好、风格、习惯）\n\n## Communication Style\n（沟通偏好）\n\n## Habits\n（工作习惯）\n`;
		await writeFile(join(agentDir, "profile.md"), emptyProfile, "utf-8");

		for (const sub of ["pending", "processed"]) {
			const dir = getEventsDir(ctx.cwd, sub);
			if (existsSync(dir)) {
				const files = await readdir(dir);
				for (const f of files) {
					try {
						await rm(join(dir, f));
					} catch {
						/* ignore */
					}
				}
			}
		}

		const threadDir = getThreadDir(ctx.cwd);
		if (existsSync(threadDir)) {
			const files = await readdir(threadDir);
			for (const f of files) {
				try {
					await rm(join(threadDir, f));
				} catch {
					/* ignore */
				}
			}
		}

		ctx.ui.notify("All memory cleared / 已清空所有记忆", "info");
	}

	pi.registerCommand("memory-clear", {
		description: "Clear all memory / 清空所有记忆（memory.md / profile.md / events / threads）",
		handler: async (_args, ctx) => doClear(ctx),
	});

	async function doClearProject(ctx: {
		cwd: string;
		ui: { notify: (msg: string, type?: "error" | "info" | "warning") => void };
	}) {
		const projectDir = join(ctx.cwd, ".pi");
		await ensureDir(projectDir);
		const emptyMemory = `# Project Memory\n\n## Background\n（项目是什么：目标、核心模块、当前状态、业务背景）\n\n## Tech Stack\n（项目用什么：框架、语言、依赖、运行方式、构建方式）\n\n## Decisions\n（为什么这么做：架构决策、历史取舍、已踩坑、不再采用的方案）\n\n## Facts\n（长期事实，可按 confidence 标注）\n\n## History Summaries\n（历史会话摘要）\n`;
		await writeFile(join(projectDir, "memory.md"), emptyMemory, "utf-8");
		ctx.ui.notify("Project memory cleared / 已清空项目记忆", "info");
	}

	async function doClearGlobal(ctx: {
		cwd: string;
		ui: { notify: (msg: string, type?: "error" | "info" | "warning") => void };
	}) {
		const agentDir = getAgentDir();
		await ensureDir(agentDir);
		const emptyProfile = `# User Profile\n\n## Preferences\n（用户的偏好、风格、习惯）\n\n## Communication Style\n（沟通偏好）\n\n## Habits\n（工作习惯）\n`;
		await writeFile(join(agentDir, "profile.md"), emptyProfile, "utf-8");
		ctx.ui.notify("Global profile cleared / 已清空用户画像", "info");
	}

	pi.registerCommand("memory-clear-project", {
		description: "Clear project memory / 清空项目记忆（memory.md）",
		handler: async (_args, ctx) => doClearProject(ctx),
	});
	pi.registerCommand("memory-clear-global", {
		description: "Clear user profile / 清空用户画像（profile.md）",
		handler: async (_args, ctx) => doClearGlobal(ctx),
	});

	// --------------------------------------------------------------------------
	// 10. memory-view: show memory file status
	// --------------------------------------------------------------------------
	pi.registerCommand("memory-view", {
		description: "Show memory file sizes and counts / 查看记忆文件状态",
		handler: async (_args, ctx) => {
			const projectDir = getProjectDir(ctx.cwd);
			const agentDir = getAgentDir();
			const pendingDir = getEventsDir(ctx.cwd, "pending");
			const processedDir = getEventsDir(ctx.cwd, "processed");

			const lines: string[] = [];

			async function statFile(label: string, path: string, soft: number, hard: number) {
				if (!existsSync(path)) {
					lines.push(`${label}: not found`);
					return;
				}
				const content = await readFile(path, "utf-8").catch(() => "");
				const len = content.length;
				const lineCount = content.split("\n").length;
				const pct = len > 0 ? ` (${((len / soft) * 100).toFixed(0)}% of soft limit)` : "";
				lines.push(`${label}: ${len} chars, ${lineCount} lines${pct}`);
				if (len > hard) lines.push(`  WARNING: exceeds hard limit (${hard})`);
				else if (len > soft) lines.push(`  NOTE: exceeds soft limit (${soft})`);
			}

			await statFile("memory.md", join(projectDir, "memory.md"), MEMORY_CHAR_LIMIT_SOFT, MEMORY_CHAR_LIMIT_HARD);
			await statFile("profile.md", join(agentDir, "profile.md"), PROFILE_CHAR_LIMIT_SOFT, PROFILE_CHAR_LIMIT_HARD);

			if (existsSync(pendingDir)) {
				const files = (await readdir(pendingDir)).filter((f) => f.endsWith(".md"));
				lines.push(`events/pending/: ${files.length} files`);
			} else {
				lines.push("events/pending/: not found");
			}

			if (existsSync(processedDir)) {
				const files = (await readdir(processedDir)).filter((f) => f.endsWith(".md"));
				lines.push(`events/processed/: ${files.length} files`);
			} else {
				lines.push("events/processed/: not found");
			}

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// --------------------------------------------------------------------------
	// 11. Auto-consolidate: triggered when pending file count >= threshold
	//    Also saves thread state (short-term session memory) on each turn.
	// --------------------------------------------------------------------------
	pi.on("turn_end", async (_event, ctx) => {
		// Save thread state
		const sessionId = ctx.sessionManager.getSessionId().slice(0, 8);
		const runDir = getThreadDir(ctx.cwd);
		if (existsSync(runDir)) {
			// Clean up stale thread files (older than 24h)
			const allFiles = await readdir(runDir);
			const now = Date.now();
			for (const f of allFiles) {
				if (!f.endsWith(".json")) continue;
				const fpath = join(runDir, f);
				const stat = await readFile(fpath, "utf-8")
					.then(JSON.parse)
					.catch(() => null);
				if (stat && now - new Date(stat.updatedAt).getTime() > 86_400_000) {
					await removeThreadState(ctx.cwd, f.replace(".json", "")).catch(() => {});
				}
			}
		} else {
			await ensureDir(runDir);
		}

		// Capture temp context from the just-completed turn
		const msgContainer = _event.message as unknown as Record<string, unknown>;
		const turnContent = msgContainer.content;
		const text = !turnContent
			? ""
			: typeof turnContent === "string"
				? turnContent
				: Array.isArray(turnContent)
					? turnContent.map((c: Record<string, unknown>) => String(c.text ?? "")).join("\n")
					: "";
		const tempFindings: string[] = [];
		const pendingTodos: string[] = [];
		for (const line of text.split("\n")) {
			const t = line.trim();
			if (t.startsWith("## ") || t.startsWith("### ")) tempFindings.push(t.replace(/^#+ /, "").slice(0, 80));
			if (/^- \[ \]/.test(t)) pendingTodos.push(t.replace(/^- \[ \] /, "").slice(0, 80));
		}
		await saveThreadState(ctx.cwd, sessionId, {
			taskSummary: tempFindings.slice(0, 3).join("; ") || undefined,
			tempFindings: tempFindings.length > 0 ? tempFindings.slice(0, 5) : undefined,
			pendingTodos: pendingTodos.length > 0 ? pendingTodos.slice(0, 5) : undefined,
		});

		// Auto-consolidate check with lock
		const pendingDir = getEventsDir(ctx.cwd, "pending");
		if (!existsSync(pendingDir)) return;

		const events = await loadPendingEvents(ctx.cwd);
		if (events.length < AUTO_CONSOLIDATE_THRESHOLD) return;

		const lockPath = join(ctx.cwd, CONSOLIDATE_LOCK_PATH);
		let release: (() => Promise<void>) | undefined;
		try {
			release = await acquireLock(lockPath, { realpath: false, retries: 0, stale: 5000 });
		} catch {
			return; // another session consolidating, skip
		}

		try {
			const memEvents = events.filter((e) => e.scope === "project" || e.scope === "agent");
			const userEvents = events.filter((e) => e.scope === "user");
			_consolidateCount++;
			const rewrite = _consolidateCount % REWRITE_INTERVAL === 0;
			const result = await consolidateEvents(ctx.cwd, memEvents, userEvents, writeQueue, rewrite);
			await writeQueue.flushAll();
			const tag = rewrite ? " [compact]" : "";
			ctx.ui.notify(
				`Auto-consolidated ${result.total} events / 自动整合 ${result.total} 条事件 (memory ${result.memory}, profile ${result.profile})${tag}`,
				"info",
			);
		} finally {
			if (release) await release().catch(() => {});
		}
	});

	// --------------------------------------------------------------------------
	// 12. Bash guard: prevent writes to rules.md (reads allowed)
	// --------------------------------------------------------------------------
	pi.on("tool_call", async (event) => {
		if (event.toolName !== "bash" && event.toolName !== "write" && event.toolName !== "edit") return;

		const input = event.input as { command?: string; filePath?: string; path?: string };
		const target = input.command ?? input.filePath ?? input.path ?? "";

		if (!target.includes(RULES_GUARD_PATH) && !target.includes("rules.md")) return;

		// write/edit tools always write to the target path
		if (event.toolName === "write" || event.toolName === "edit") {
			return {
				block: true,
				reason: `HARD POLICY: ${RULES_GUARD_PATH} is user-managed and read-only. The agent CANNOT write to this file by any means. Inform the user to edit it manually. Do not retry.`,
			};
		}

		// bash: only block if writing to rules.md (has redirect), not reading
		const isWrite = /[>|]|tee\s+.*rules\.md|echo.*rules\.md|printf.*rules\.md/.test(target);
		if (isWrite) {
			return {
				block: true,
				reason: `HARD POLICY: ${RULES_GUARD_PATH} is user-managed and read-only. The agent CANNOT write to this file by any means. Inform the user to edit it manually. Do not retry.`,
			};
		}
	});

	// 13. session_shutdown: flush pending writes
	pi.on("session_shutdown", async () => {
		await writeQueue.flushAll();
	});
}
