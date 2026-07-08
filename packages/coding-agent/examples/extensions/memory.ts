import { existsSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ============================================================================
// Constants
// ============================================================================

const DECAY_ALPHA = 0.5;
const TOKEN_BUDGET = 2000;
const AUTO_CONSOLIDATE_THRESHOLD = 5;
const RULES_GUARD_PATH = ".pi/agent/rules.md";

const EVENT_TYPES = ["preference", "fact", "project", "agent", "history"] as const;
const EVENT_SCOPES = ["user", "agent", "project"] as const;

type EventType = (typeof EVENT_TYPES)[number];
type EventScope = (typeof EVENT_SCOPES)[number];

// ============================================================================
// Helpers
// ============================================================================

function getGlobalDir(): string {
	const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
	return join(home, ".pi", "agent");
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

/** Extract simple keywords from text (lowercased, 3+ char words, deduped). */
function extractKeywords(text: string): string[] {
	const words = text
		.toLowerCase()
		.split(/\W+/)
		.filter((w) => w.length >= 3);
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

function formatMemoryBlock(rules: string, projectMemory: string, agentMemory: string, recentEvents: string): string {
	const parts: string[] = ["<Memory>"];

	if (rules.trim()) {
		parts.push("[Rules]", rules.trim());
	}

	if (projectMemory.trim()) {
		parts.push("[Project Memory]", projectMemory.trim());
	}

	if (agentMemory.trim()) {
		parts.push("[Agent Memory]", agentMemory.trim());
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

async function consolidateEvents(
	cwd: string,
	projectEvents: PendingEvent[],
	agentEvents: PendingEvent[],
	queue: MemoryWriteQueue,
): Promise<{ total: number; project: number; agent: number }> {
	// Step 1: exact dedup (same content + type → keep latest timestamp)
	const exactMap = new Map<string, PendingEvent>();
	for (const ev of [...projectEvents, ...agentEvents]) {
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
			// Merge: keep higher confidence, newer timestamp, merge content
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
	const aEvents = merged.filter((e) => e.scope === "agent" || e.scope === "user");

	const projectDir = join(cwd, ".pi");
	const globalDir = getGlobalDir();
	await ensureDir(projectDir);
	await ensureDir(join(globalDir));

	if (pEvents.length > 0) {
		const pLines = pEvents.map((e) => `- [${e.confidence}] ${e.content}`);
		const pPath = join(projectDir, "memory.md");
		const existing = existsSync(pPath) ? await readFile(pPath, "utf-8").catch(() => "") : "";
		const updated = existing
			? `${existing.trim()}\n${pLines.join("\n")}\n`
			: `# Project Memory\n\n## Background\n（项目是什么：目标、核心模块、当前状态、业务背景）\n\n## Tech Stack\n（项目用什么：框架、语言、依赖、运行方式、构建方式）\n\n## Decisions\n（为什么这么做：架构决策、历史取舍、已踩坑、不再采用的方案）\n\n## Facts\n${pLines.join("\n")}\n\n## History Summaries\n（历史会话摘要）\n`;
		queue.enqueue(pPath, updated);
	}

	if (aEvents.length > 0) {
		const aLines = aEvents.map((e) => `- [${e.confidence}] ${e.content}`);
		const aPath = join(globalDir, "agent.md");
		const existing = existsSync(aPath) ? await readFile(aPath, "utf-8").catch(() => "") : "";
		const updated = existing
			? `${existing.trim()}\n${aLines.join("\n")}\n`
			: `# Agent Self-Evolution Memory\n\n## Working Patterns\n${aLines.join("\n")}\n\n## Coding Lessons\n（编码经验、踩坑、可复用解法）\n\n## Planning Lessons\n（任务拆解、规划经验）\n\n## Failure Cases\n（失败案例与正确做法）\n\n## User Interaction Lessons\n（与用户协作、沟通的经验）\n`;
		queue.enqueue(aPath, updated);
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

	return { total: merged.length, project: pEvents.length, agent: aEvents.length };
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
	// 2. resources_discover: inject static memory files into base system prompt
	// --------------------------------------------------------------------------
	pi.on("resources_discover", async (event) => {
		const paths: string[] = [];
		const globalDir = getGlobalDir();

		const rulesPath = join(globalDir, "rules.md");
		const agentPath = join(globalDir, "agent.md");
		if (existsSync(rulesPath)) paths.push(rulesPath);
		if (existsSync(agentPath)) paths.push(agentPath);

		const projectDir = join(event.cwd, ".pi");
		const memoryPath = join(projectDir, "memory.md");
		if (existsSync(memoryPath)) paths.push(memoryPath);

		return { promptPaths: paths.length > 0 ? paths : undefined };
	});

	// --------------------------------------------------------------------------
	// 3. before_agent_start: inject dynamic <Memory> block each prompt round
	// --------------------------------------------------------------------------
	pi.on("before_agent_start", async (event, ctx) => {
		const projectDir = join(ctx.cwd, ".pi");
		const globalDir = getGlobalDir();
		const pendingDir = getEventsDir(ctx.cwd, "pending");

		// Read static files
		const readOpts = { encoding: "utf-8" as const };

		const [rules, projectMemory, agentMemory] = await Promise.all([
			existsSync(join(globalDir, "rules.md")) ? readFile(join(globalDir, "rules.md"), readOpts).catch(() => "") : "",
			existsSync(join(projectDir, "memory.md"))
				? readFile(join(projectDir, "memory.md"), readOpts).catch(() => "")
				: "",
			existsSync(join(globalDir, "agent.md")) ? readFile(join(globalDir, "agent.md"), readOpts).catch(() => "") : "",
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

		const memoryBlock = formatMemoryBlock(rules, projectMemory, agentMemory, recentEvents);
		const fullBlock = threadBlock ? `${memoryBlock}\n\n${threadBlock}` : memoryBlock;
		if (!fullBlock.includes("]")) return;

		return { systemPrompt: `${event.systemPrompt}\n\n${fullBlock}` };
	});

	// --------------------------------------------------------------------------
	// 4. context: score-ranked dynamic recall with token budget
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
	// 5. memory_search: long-tail on-demand memory retrieval
	// --------------------------------------------------------------------------
	pi.registerTool({
		name: "memory_search",
		label: "Memory Search",
		description:
			"Search across all memory sources (memory.md, agent.md, events/pending/, events/processed/) by keyword or topic. Use for long-tail memory not already injected in context.",
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

			// Search agent.md
			const globalDir = getGlobalDir();
			const agentPath = join(globalDir, "agent.md");
			if (existsSync(agentPath)) {
				const content = await readFile(agentPath, readOpts).catch(() => "");
				if (content && keywordMatch(content, keywords)) {
					results.push({ source: "agent.md", content });
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
	// 6. memory-consolidate command
	// --------------------------------------------------------------------------
	async function doConsolidate(ctx: {
		cwd: string;
		ui: { notify: (msg: string, type?: "error" | "info" | "warning") => void };
	}): Promise<void> {
		const pendingDir = getEventsDir(ctx.cwd, "pending");
		if (!existsSync(pendingDir)) {
			ctx.ui.notify("No pending events to consolidate", "info");
			return;
		}

		const events = await loadPendingEvents(ctx.cwd);
		if (events.length === 0) {
			ctx.ui.notify("No valid events found in pending/", "info");
			return;
		}

		const projectEvents = events.filter((e) => e.scope === "project");
		const agentEvents = events.filter((e) => e.scope === "agent" || e.scope === "user");
		const result = await consolidateEvents(ctx.cwd, projectEvents, agentEvents, writeQueue);
		await writeQueue.flushAll();
		ctx.ui.notify(`Consolidated ${result.total} events (${result.project} project, ${result.agent} agent)`, "info");
	}

	pi.registerCommand("memory-consolidate", {
		description: "Consolidate pending events into stable memory files (memory.md / agent.md)",
		handler: async (_args, ctx) => doConsolidate(ctx),
	});

	// --------------------------------------------------------------------------
	// 7. Auto-consolidate: triggered when pending file count >= threshold
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

		// Auto-consolidate check
		const pendingDir = getEventsDir(ctx.cwd, "pending");
		if (!existsSync(pendingDir)) return;

		const files = await readdir(pendingDir);
		const pendingFiles = files.filter((f) => f.endsWith(".md"));
		if (pendingFiles.length < AUTO_CONSOLIDATE_THRESHOLD) return;

		// Fire-and-forget: don't block turn end
		const events = await loadPendingEvents(ctx.cwd);
		if (events.length === 0) return;

		const projectEvents = events.filter((e) => e.scope === "project");
		const agentEvents = events.filter((e) => e.scope === "agent" || e.scope === "user");
		const result = await consolidateEvents(ctx.cwd, projectEvents, agentEvents, writeQueue);
		await writeQueue.flushAll();
		ctx.ui.notify(
			`Auto-consolidated ${result.total} events (${result.project} project, ${result.agent} agent)`,
			"info",
		);
	});

	// --------------------------------------------------------------------------
	// 8. Bash guard: prevent writes to rules.md
	// --------------------------------------------------------------------------
	pi.on("tool_call", async (event) => {
		if (event.toolName !== "bash" && event.toolName !== "write" && event.toolName !== "edit") return;

		const input = event.input as { command?: string; filePath?: string; path?: string };
		const target = input.command ?? input.filePath ?? input.path ?? "";

		if (target.includes(RULES_GUARD_PATH) || target.includes("rules.md")) {
			return {
				block: true,
				reason: `Blocked by memory extension: ${RULES_GUARD_PATH} is read-only (user-managed). Use ~/.pi/agent/rules.md manually.`,
			};
		}
	});

	// 9. session_shutdown: flush pending writes and clean up thread state
	pi.on("session_shutdown", async () => {
		await writeQueue.flushAll();
	});
}
