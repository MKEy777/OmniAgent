import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ── Types ────────────────────────────────────────

export type SectionType = "always" | "auto" | "ref";

export interface ProfileSection {
	type: SectionType;
	heading: string;
	content: string;
	updatedAt: string;
	raw: string;
}

export interface InjectConfig {
	maxAutoSections: number;
	maxProfileChars: number;
}

export interface CompressConfig {
	alwaysMaxChars: number;
	autoMaxChars: number;
	refMaxChars: number;
	profileMaxChars: number;
}

export const DEFAULT_INJECT: InjectConfig = {
	maxAutoSections: 3,
	maxProfileChars: 6000,
};

export const DEFAULT_COMPRESS: CompressConfig = {
	alwaysMaxChars: 2000,
	autoMaxChars: 1200,
	refMaxChars: 3000,
	profileMaxChars: 12000,
};

export interface Profile {
	version: number;
	updatedAt: string;
	disabled: boolean;
	inject: InjectConfig;
	compress: CompressConfig;
	sections: ProfileSection[];
}

// ── Constants ────────────────────────────────────

export const VERSION = "0.1.1";
export const PROFILE_PATH = path.join(os.homedir(), ".pi", "agent", "profile.md");

const DEFAULT_TEMPLATE = `---
version: 1.1
updated_at: ${new Date().toISOString().slice(0, 10)}
disabled: false
inject:
  max_auto_sections: 3
  max_profile_chars: 6000
compress:
  always_max_chars: 2000
  auto_max_chars: 1200
  ref_max_chars: 3000
  profile_max_chars: 12000
---

## Identity
<!-- AI: append only -->
role:

## Communication Preferences
<!-- AI: append or upsert only -->

## Coding Preferences
<!-- AI: append or upsert only -->

## [auto] Projects

## [auto] Technical Interests

## [ref] Past Decisions
`;

// ── Section Classification ───────────────────────

export function classifySection(heading: string): SectionType {
	if (/^##\s*\[auto\]/i.test(heading)) return "auto";
	if (/^##\s*\[ref\]/i.test(heading)) return "ref";
	return "always";
}

// ── Profile Parsing ──────────────────────────────

export function parseProfile(content: string): Profile | null {
	try {
		if (!content || content.trim() === "") return null;
		const lines = content.split("\n");
		let i = 0;

		// Parse YAML frontmatter
		if (lines[i]?.trim() === "---") {
			i++;
			const frontmatterLines: string[] = [];
			while (i < lines.length && lines[i]?.trim() !== "---") {
				frontmatterLines.push(lines[i]!);
				i++;
			}
			i++;
			const fm: Record<string, any> = {};
			let currentKey = "";
			for (const l of frontmatterLines) {
				const im = l.match(/^(\w+):\s*(.*)/);
				if (im) {
					currentKey = im[1]!;
					fm[currentKey] = im[2]!.trim();
				} else {
					const nm = l.match(/^\s{2}(\w+):\s*(.*)/);
					if (nm && currentKey) {
						if (!fm[currentKey] || typeof fm[currentKey] !== "object") {
							fm[currentKey] = {};
						}
						fm[currentKey][nm[1]!] = nm[2]!.trim();
					}
				}
			}
			return {
				version: Number(fm.version) || 1,
				updatedAt: fm.updated_at || new Date().toISOString().slice(0, 10),
				disabled: fm.disabled === "true",
				inject: {
					maxAutoSections: Number(fm.inject?.max_auto_sections) || DEFAULT_INJECT.maxAutoSections,
					maxProfileChars: Number(fm.inject?.max_profile_chars) || DEFAULT_INJECT.maxProfileChars,
				},
				compress: {
					alwaysMaxChars: Number(fm.compress?.always_max_chars) || DEFAULT_COMPRESS.alwaysMaxChars,
					autoMaxChars: Number(fm.compress?.auto_max_chars) || DEFAULT_COMPRESS.autoMaxChars,
					refMaxChars: Number(fm.compress?.ref_max_chars) || DEFAULT_COMPRESS.refMaxChars,
					profileMaxChars: Number(fm.compress?.profile_max_chars) || DEFAULT_COMPRESS.profileMaxChars,
				},
				sections: parseSections(lines.slice(i).join("\n")),
			};
		}

		return {
			version: 1,
			updatedAt: "",
			disabled: false,
			inject: DEFAULT_INJECT,
			compress: DEFAULT_COMPRESS,
			sections: parseSections(content),
		};
	} catch {
		return null;
	}
}

function parseSections(md: string): ProfileSection[] {
	const sections: ProfileSection[] = [];
	const lines = md.split("\n");
	let current: Partial<ProfileSection> | null = null;

	for (const line of lines) {
		const hm = line.match(/^##\s+(.+)$/);
		if (hm) {
			if (current?.heading) {
				sections.push(finalizeSection(current));
			}
			const rawHeading = hm[1]!;
			const updatedAtMatch = rawHeading.match(/<!--\s*updated:\s*([\d-]+)\s*-->/);
			current = {
				type: classifySection(`## ${rawHeading}`),
				heading: rawHeading.replace(/<!--[\s\S]*?-->/g, "").trim(),
				raw: line,
				content: "",
				updatedAt: updatedAtMatch ? updatedAtMatch[1]! : new Date().toISOString().slice(0, 10),
			};
		} else if (current) {
			current.content += (current.content ? "\n" : "") + line;
		}
	}
	if (current?.heading) {
		sections.push(finalizeSection(current));
	}
	return sections;
}

function finalizeSection(s: Partial<ProfileSection>): ProfileSection {
	return {
		type: s.type!,
		heading: s.heading!,
		content: s.content!.trim(),
		updatedAt: s.updatedAt!,
		raw: s.raw!,
	};
}

export function createDefaultProfile(): string {
	return DEFAULT_TEMPLATE;
}

export function ensureProfileFile(fpath: string): Profile {
	const dir = path.dirname(fpath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	if (!fs.existsSync(fpath)) {
		fs.writeFileSync(fpath, DEFAULT_TEMPLATE, "utf-8");
	}
	const content = fs.readFileSync(fpath, "utf-8");
	return parseProfile(content) ?? parseProfile(DEFAULT_TEMPLATE)!;
}

// ── Keyword Extraction ────────────────────────────

const STOP_WORDS = new Set([
	"the",
	"a",
	"an",
	"is",
	"are",
	"was",
	"were",
	"be",
	"been",
	"being",
	"have",
	"has",
	"had",
	"do",
	"does",
	"did",
	"will",
	"would",
	"could",
	"should",
	"may",
	"might",
	"shall",
	"can",
	"need",
	"i",
	"you",
	"he",
	"she",
	"it",
	"we",
	"they",
	"my",
	"your",
	"his",
	"her",
	"its",
	"our",
	"their",
	"me",
	"him",
	"us",
	"them",
	"this",
	"that",
	"these",
	"those",
	"in",
	"on",
	"at",
	"by",
	"with",
	"from",
	"to",
	"for",
	"of",
	"about",
	"as",
	"into",
	"through",
	"during",
	"before",
	"after",
	"above",
	"below",
	"between",
	"out",
	"off",
	"over",
	"under",
	"again",
	"further",
	"then",
	"once",
	"here",
	"there",
	"when",
	"where",
	"why",
	"how",
	"all",
	"each",
	"every",
	"both",
	"few",
	"more",
	"most",
	"other",
	"some",
	"such",
	"no",
	"nor",
	"not",
	"only",
	"own",
	"same",
	"so",
	"than",
	"too",
	"very",
	"just",
	"because",
	"but",
	"and",
	"or",
	"if",
	"while",
	"what",
	"which",
	"who",
	"whom",
]);

export function extractKeywords(text: string): Set<string> {
	const words = text.toLowerCase().split(/[\s,.;:!?()[\]{}<>"'/\\|`~@#$%^&*\-=+]+/);
	const result = new Set<string>();
	for (const word of words) {
		if (word.length > 2 && !STOP_WORDS.has(word)) {
			result.add(word);
		}
	}
	return result;
}

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[\s,.;:!?()[\]{}<>"'/\\|`~@#$%^&*\-=+]+/)
		.filter((w) => w.length > 2);
}

// ── Relevance Scoring ────────────────────────────

export function scoreSection(
	headingWords: string[],
	contentWords: string[],
	messageWords: Set<string>,
	updatedAt: string,
): number {
	let score = 0;
	for (const w of headingWords) {
		if (messageWords.has(w)) score += 2;
	}
	for (const w of contentWords) {
		if (messageWords.has(w)) score += 1;
	}
	const hoursSinceUpdate = (Date.now() - new Date(updatedAt).getTime()) / 3_600_000;
	if (hoursSinceUpdate < 72) score += 1;
	return score;
}

// ── Prompt Building ──────────────────────────────

export function buildProfilePrompt(
	profile: Profile,
	userMessage: string,
	maxAuto: number = 3,
	maxChars: number = 6000,
): string {
	const result: string[] = [];
	const messageWords = extractKeywords(userMessage);

	const alwaysSections = profile.sections.filter((s) => s.type === "always");
	const autoSections = profile.sections.filter((s) => s.type === "auto");
	const refSections = profile.sections.filter((s) => s.type === "ref");

	const scored = autoSections
		.map((s) => ({
			section: s,
			score: scoreSection(tokenize(s.heading), tokenize(s.content), messageWords, s.updatedAt),
		}))
		.sort((a, b) => b.score - a.score);

	const selectedAuto = scored
		.filter((s) => s.score >= 2)
		.slice(0, maxAuto)
		.map((s) => s.section);

	result.push("<user_profile>");

	for (const s of alwaysSections) {
		result.push(s.content ? `[${s.heading}]\n${s.content}` : `[${s.heading}]`);
	}

	if (selectedAuto.length > 0) {
		result.push("");
		result.push("--- current context ---");
		for (const s of selectedAuto) {
			result.push(s.content ? `[${s.heading}]\n${s.content}` : `[${s.heading}]`);
		}
	}

	if (refSections.length > 0) {
		result.push("");
		result.push("--- available sections ---");
		for (const s of refSections) {
			result.push(
				`  ${s.heading} (use \`/profile view --section "${s.heading.replace(/\[ref\]\s*/i, "").trim()}"\`)`,
			);
		}
	}

	result.push("");
	result.push(
		"Update the profile with updateProfile when you detect stable, long-term preferences, project facts, or communication patterns.",
	);
	result.push("</user_profile>");

	let fullPrompt = result.join("\n");

	// Drop auto sections if over maxChars
	if (fullPrompt.length > maxChars) {
		result.length = 0;
		result.push("<user_profile>");
		for (const s of alwaysSections) {
			result.push(s.content ? `[${s.heading}]\n${s.content}` : `[${s.heading}]`);
		}
		if (refSections.length > 0) {
			result.push("");
			result.push("--- available sections ---");
			for (const s of refSections) {
				result.push(
					`  ${s.heading} (use \`/profile view --section "${s.heading.replace(/\[ref\]\s*/i, "").trim()}"\`)`,
				);
			}
		}
		result.push("");
		result.push("</user_profile>");
		fullPrompt = result.join("\n");
	}

	// Hard truncate as last resort
	if (fullPrompt.length > maxChars) {
		fullPrompt = `${fullPrompt.slice(0, maxChars)}\n<!-- truncated -->\n</user_profile>`;
	}

	return fullPrompt;
}

// ── Update Profile ────────────────────────────────

function findSection(profile: Profile, sectionName: string): ProfileSection | undefined {
	return profile.sections.find(
		(s) =>
			s.heading.toLowerCase().includes(sectionName.toLowerCase()) ||
			s.heading
				.replace(/\[(auto|ref)\]\s*/i, "")
				.trim()
				.toLowerCase()
				.includes(sectionName.toLowerCase()),
	);
}

const SENSITIVE_PATTERNS = [
	/sk-[a-zA-Z0-9]{20,}/,
	/api[-_]?key/i,
	/(password|passwd|secret)\s*[:=]/i,
	/-----BEGIN\s+(RSA|OPENSSH|PRIVATE)\s+KEY-----/,
];

function countOverlap(newContent: string, existingContent: string): number {
	if (!existingContent) return 0;
	const newWords = new Set(newContent.toLowerCase().split(/\s+/));
	const existingWords = existingContent.toLowerCase().split(/\s+/);
	if (newWords.size === 0) return 0;
	let matches = 0;
	for (const w of existingWords) {
		if (newWords.has(w)) matches++;
	}
	return matches / existingWords.length;
}

export function validateUpdate(
	profile: Profile,
	sectionName: string,
	content: string,
	mode: string,
	reason: string,
): string | null {
	if (mode === "compress") {
		// Compress: only check section exists and sensitive content
		if (!findSection(profile, sectionName)) return `section "${sectionName}" not found`;
		for (const pattern of SENSITIVE_PATTERNS) {
			if (pattern.test(content)) return "content contains sensitive information";
		}
		return null;
	}

	if (!reason || reason.length < 5) {
		return "reason is required and must be meaningful";
	}

	// Longevity check: reason must imply long-term value
	const LONGEVITY_KEYWORDS =
		/always|长期|consistently|habit|prefer|长期|permanent|长久|typically|usually|often|一般|通常|偏好/g;
	if (!LONGEVITY_KEYWORDS.test(reason)) {
		return "reason must indicate long-term value (e.g., 'always uses Python', 'prefers concise code', 'habit of using TypeScript')";
	}

	const section = findSection(profile, sectionName);
	if (!section) return `section "${sectionName}" not found`;

	if (section.type === "always") {
		if (section.heading === "Identity" && mode !== "append") {
			return "Identity section only allows append mode";
		}
		if (mode === "replace") return "always sections do not allow replace mode";
	}

	for (const pattern of SENSITIVE_PATTERNS) {
		if (pattern.test(content)) return "content contains sensitive information";
	}

	if (mode === "append" || mode === "upsert") {
		const overlap = countOverlap(content, section.content);
		if (overlap > 0.6) return "content is largely duplicate of existing section content";
	}

	return null;
}

export function applyUpdate(
	profile: Profile,
	sectionName: string,
	content: string,
	mode: "append" | "upsert" | "replace" | "compress",
): Profile {
	const today = new Date().toISOString().slice(0, 10);
	return {
		...profile,
		sections: profile.sections.map((s) => {
			const match =
				s.heading.toLowerCase().includes(sectionName.toLowerCase()) ||
				s.heading
					.replace(/\[(auto|ref)\]\s*/i, "")
					.trim()
					.toLowerCase()
					.includes(sectionName.toLowerCase());
			if (!match) return s;

			let newContent = s.content;
			if (mode === "replace" || mode === "compress") {
				newContent = content;
			} else if (mode === "append") {
				newContent = s.content ? `${s.content}\n${content}` : content;
			} else if (mode === "upsert") {
				newContent = upsertContent(s.content, content);
			}

			return { ...s, content: newContent, updatedAt: today };
		}),
	};
}

function upsertContent(existing: string, newLines: string): string {
	const lines = existing.split("\n").filter(Boolean);
	const updates = newLines.split("\n").filter(Boolean);
	const updatedLines = [...lines];

	for (const update of updates) {
		const keyMatch = update.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
		if (!keyMatch) {
			updatedLines.push(update);
			continue;
		}
		const key = keyMatch[1]!;
		const idx = updatedLines.findIndex((l) => l.startsWith(`${key}:`) || l.startsWith(`${key} :`));
		if (idx >= 0) {
			updatedLines[idx] = update;
		} else {
			updatedLines.push(update);
		}
	}

	return updatedLines.join("\n");
}

export function serializeProfile(profile: Profile): string {
	const lines: string[] = [];
	lines.push("---");
	lines.push(`version: ${profile.version}`);
	lines.push(`updated_at: ${profile.updatedAt}`);
	lines.push(`disabled: ${profile.disabled}`);
	lines.push("inject:");
	lines.push(`  max_auto_sections: ${profile.inject.maxAutoSections}`);
	lines.push(`  max_profile_chars: ${profile.inject.maxProfileChars}`);
	lines.push("compress:");
	lines.push(`  always_max_chars: ${profile.compress.alwaysMaxChars}`);
	lines.push(`  auto_max_chars: ${profile.compress.autoMaxChars}`);
	lines.push(`  ref_max_chars: ${profile.compress.refMaxChars}`);
	lines.push(`  profile_max_chars: ${profile.compress.profileMaxChars}`);
	lines.push("---");
	lines.push("");

	for (const section of profile.sections) {
		const ts = section.updatedAt;
		const heading = ts
			? section.raw.includes("<!--")
				? section.raw.replace(/<!--.*?-->/, `<!-- updated: ${ts} -->`)
				: `${section.raw} <!-- updated: ${ts} -->`
			: section.raw;
		lines.push(heading);
		if (section.content) {
			lines.push(section.content);
		}
		lines.push("");
	}

	return lines.join("\n");
}

export interface CompressCheckResult {
	needsCompress: boolean;
	overLimit: Array<{
		heading: string;
		chars: number;
		limit: number;
		action: "notify" | "compress";
	}>;
	totalChars: number;
}

export function checkCompressNeeded(profile: Profile): CompressCheckResult {
	const overLimit: CompressCheckResult["overLimit"] = [];
	let totalChars = 0;

	for (const section of profile.sections) {
		const chars = section.content.length;
		totalChars += chars;

		if (section.type === "always" && chars > profile.compress.alwaysMaxChars) {
			overLimit.push({
				heading: section.heading,
				chars,
				limit: profile.compress.alwaysMaxChars,
				action: "notify",
			});
		} else if (section.type === "auto" && chars > profile.compress.autoMaxChars) {
			overLimit.push({
				heading: section.heading,
				chars,
				limit: profile.compress.autoMaxChars,
				action: "compress",
			});
		} else if (section.type === "ref" && chars > profile.compress.refMaxChars) {
			overLimit.push({
				heading: section.heading,
				chars,
				limit: profile.compress.refMaxChars,
				action: "compress",
			});
		}
	}

	const needsCompress =
		totalChars > profile.compress.profileMaxChars || overLimit.some((o) => o.action === "compress");

	return { needsCompress, overLimit, totalChars };
}

export function writeProfile(fpath: string, profile: Profile): void {
	fs.writeFileSync(fpath, serializeProfile(profile), "utf-8");
}

// ── Extension Factory ────────────────────────────

export default function (pi: ExtensionAPI) {
	// ── Tool: updateProfile ─────────────────────
	pi.registerTool(
		defineTool({
			name: "updateProfile",
			label: "Update Profile",
			description:
				"Update the user profile with long-term preferences, project facts, or communication patterns observed during conversation. Validates content before writing.",
			parameters: Type.Object({
				section: Type.String({
					description: "Section heading (e.g. 'Identity', '[auto] Projects', 'Coding Preferences')",
				}),
				content: Type.String({ description: "Content to write" }),
				mode: Type.Optional(
					Type.Union([
						Type.Literal("append"),
						Type.Literal("upsert"),
						Type.Literal("replace"),
						Type.Literal("compress"),
					]),
				),
				reason: Type.String({ description: "Why this belongs in the long-term profile" }),
			}),
			execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
				const mode = params.mode ?? "append";
				const contentRaw = fs.readFileSync(PROFILE_PATH, "utf-8");
				const profile = parseProfile(contentRaw);
				if (!profile) {
					return {
						content: [{ type: "text", text: "Error: profile file is corrupted. Run `/profile edit` to fix it." }],
						details: undefined,
					};
				}

				const validationError = validateUpdate(profile, params.section, params.content, mode, params.reason);
				if (validationError) {
					return {
						content: [{ type: "text", text: `Validation failed: ${validationError}` }],
						details: undefined,
						isError: true,
					};
				}

				const updated = applyUpdate(profile, params.section, params.content, mode);
				writeProfile(PROFILE_PATH, updated);
				return {
					content: [
						{
							type: "text",
							text: `Profile section "${params.section}" updated (mode: ${mode}). Current content:\n${updated.sections.find((s) => s.heading.toLowerCase().includes(params.section.toLowerCase()))?.content ?? ""}`,
						},
					],
					details: undefined,
				};
			},
		}),
	);

	// ── Hook: before_agent_start ────────────────
	pi.on("before_agent_start", async (event, ctx) => {
		const content = fs.existsSync(PROFILE_PATH) ? fs.readFileSync(PROFILE_PATH, "utf-8") : "";
		const profile = content ? parseProfile(content) : ensureProfileFile(PROFILE_PATH);
		if (!profile) {
			ctx?.ui?.notify?.("Profile parse error — skipping profile injection", "warning");
			return;
		}
		if (profile.disabled) return;

		const userPrompt = event.prompt || "";
		const profilePrompt = buildProfilePrompt(
			profile,
			userPrompt,
			profile.inject.maxAutoSections,
			profile.inject.maxProfileChars,
		);
		return { systemPrompt: `${event.systemPrompt}\n${profilePrompt}` };
	});

	// ── Command: /profile ──────────────────────
	pi.registerCommand("profile", {
		description: "View, edit, or update the user profile",
		getArgumentCompletions: (prefix) => {
			const cmds = ["view", "edit", "update", "compress", "sections", "enable", "disable"];
			return cmds.filter((c) => c.startsWith(prefix)).map((v) => ({ value: v, label: v }));
		},
		handler: async (args, ctx) => {
			const [subcommand, ...rest] = args.trim().split(/\s+/);
			const profileContent = fs.existsSync(PROFILE_PATH) ? fs.readFileSync(PROFILE_PATH, "utf-8") : "";
			const profile = profileContent ? parseProfile(profileContent) : null;

			switch (subcommand) {
				case "view": {
					const sectionFilter = rest
						.join(" ")
						.replace(/^--section\s*/i, "")
						.trim();
					if (sectionFilter && profile) {
						const matched = profile.sections.filter((s) =>
							s.heading.toLowerCase().includes(sectionFilter.toLowerCase()),
						);
						if (matched.length === 0) {
							ctx.ui.notify(`No sections matching "${sectionFilter}"`, "info");
							return;
						}
						for (const s of matched) {
							ctx.ui.notify(`[${s.type}] ${s.heading}\n${s.content || "(empty)"}`, "info");
						}
					} else {
						ctx.ui.notify(profileContent || "Profile file not found. Run a conversation to create it.", "info");
					}
					break;
				}

				case "sections": {
					if (!profile) {
						ctx.ui.notify("No profile found", "info");
						return;
					}
					const lines = [`Profile: ${profile.disabled ? "disabled" : "enabled"}`, ""];
					for (const s of profile.sections) {
						const typeLabel = s.type === "always" ? "[always]" : s.type === "auto" ? "[auto]  " : "[ref]   ";
						const displayHeading = s.heading.replace(/\[(auto|ref)\]\s*/i, "").trim();
						const chars = s.content.length;
						const limit =
							s.type === "always"
								? profile.compress.alwaysMaxChars
								: s.type === "auto"
									? profile.compress.autoMaxChars
									: profile.compress.refMaxChars;
						const over = chars > limit ? " \u26a0" : "";
						lines.push(
							`${typeLabel} ${displayHeading.padEnd(28)} ${String(chars).padStart(4)}/${String(limit).padStart(4)} chars${over}  updated: ${s.updatedAt}`,
						);
					}
					ctx.ui.notify(lines.join("\n"), "info");
					break;
				}

				case "edit": {
					ctx.ui.notify(
						`Profile file: ${PROFILE_PATH}\nEdit it directly with any text editor. Changes take effect on next interaction.`,
						"info",
					);
					break;
				}

				case "update": {
					if (!profile) {
						ctx.ui.notify("No profile to update", "info");
						return;
					}
					pi.sendUserMessage(
						"Please review our conversation history and update the user profile " +
							"if you notice any meaningful preferences, habits, project context, " +
							"or communication patterns worth recording. Call the updateProfile tool if appropriate.",
						{ deliverAs: "nextTurn" as any }, // sendUserMessage type omits "nextTurn" but the runtime handles it
					);
					ctx.ui.notify("Update request queued for next interaction", "info");
					break;
				}

				case "compress": {
					if (!profile) {
						ctx.ui.notify("No profile to compress", "info");
						return;
					}
					const check = checkCompressNeeded(profile);
					const compressible = check.overLimit.filter((o) => o.action === "compress");
					if (!check.needsCompress && compressible.length === 0) {
						ctx.ui.notify("No sections need compression", "info");
						return;
					}
					pi.sendUserMessage(
						"Profile sections need compression:\n" +
							compressible.map((o) => `  ${o.heading} (${o.chars}/${o.limit} chars)`).join("\n") +
							"\n\nReview each over-limit section and call updateProfile with mode:compress to deduplicate, merge, archive outdated info to [ref] Archive, or summarize.",
						{ deliverAs: "nextTurn" as any },
					);
					ctx.ui.notify("Compress request queued for next interaction", "info");
					break;
				}

				case "enable":
				case "disable": {
					if (!profile) {
						ctx.ui.notify("No profile found", "info");
						return;
					}
					const newDisabled = subcommand === "disable";
					const updated = { ...profile, disabled: newDisabled };
					writeProfile(PROFILE_PATH, updated);
					ctx.ui.notify(`Profile ${newDisabled ? "disabled" : "enabled"}`, "info");
					break;
				}

				default: {
					ctx.ui.notify(
						"Usage: /profile <subcommand>\n\n" +
							"  view                  Show full profile\n" +
							"  view --section <kw>   Show matching sections\n" +
							"  edit                  Show file path for manual editing\n" +
							"  update                Request AI to review and update profile\n" +
							"  compress              Request AI to compress over-limit sections\n" +
							"  sections              List all sections with char counts\n" +
							"  enable                Enable profile injection\n" +
							"  disable               Disable profile injection",
						"info",
					);
				}
			}
		},
	});

	// ── Hook: session_before_tree ─────────────
	// Fires at the "continue/fork/tree/quit" prompt after every turn,
	// including after Ctrl+C interrupt — more reliable than session_shutdown.
	pi.on("session_before_tree", async (_event, ctx) => {
		const content = fs.existsSync(PROFILE_PATH) ? fs.readFileSync(PROFILE_PATH, "utf-8") : "";
		if (!content) return;

		const entries = ctx.sessionManager.getEntries();
		const recentMessages = entries.filter((e) => e.type === "message").length;
		if (recentMessages < 3) return;

		const profile = parseProfile(content);
		if (!profile) return;

		// Throttle: only trigger once every 10 messages since last profile update
		const lastUpdate = new Date(profile.updatedAt).getTime();
		const messagesSinceUpdate = entries.filter(
			(e) => e.type === "message" && new Date(e.timestamp ?? 0).getTime() > lastUpdate,
		).length;
		if (messagesSinceUpdate < 10) return;

		// Check compress needs first (higher priority)
		const compressCheck = checkCompressNeeded(profile);
		const compressible = compressCheck.overLimit.filter((o) => o.action === "compress");
		const alwaysOver = compressCheck.overLimit.filter((o) => o.action === "notify");

		if (compressible.length > 0) {
			pi.sendUserMessage(
				"Profile sections over limit:\n" +
					compressible.map((o) => `  ${o.heading} (${o.chars}/${o.limit} chars)`).join("\n") +
					"\n\nReview and call updateProfile with mode:compress to deduplicate, merge, archive, or summarize.",
				{ deliverAs: "nextTurn" as any },
			);
		} else if (alwaysOver.length > 0) {
			pi.sendUserMessage(
				"Always sections are large:\n" +
					alwaysOver.map((o) => `  ${o.heading} (${o.chars}/${o.limit} chars)`).join("\n") +
					"\n\nConsider editing them manually via /profile edit.",
				{ deliverAs: "nextTurn" as any },
			);
		} else {
			// Only request update review if no compress/notify was needed
			pi.sendUserMessage(
				"Review the recent conversation for any long-term user preferences, " +
					"project context, or communication patterns worth recording, " +
					"and call updateProfile if appropriate.",
				{ deliverAs: "nextTurn" as any },
			);
		}
	});

	// ── Hook: session_before_compact ──────────
	pi.on("session_before_compact", async (_event, ctx) => {
		const content = fs.existsSync(PROFILE_PATH) ? fs.readFileSync(PROFILE_PATH, "utf-8") : "";
		if (!content) return;
		const entries = ctx.sessionManager.getEntries();
		const recentMessages = entries.filter((e) => e.type === "message").length;
		if (recentMessages < 3) return;
		const profile = parseProfile(content);
		if (!profile) return;
		const compressCheck = checkCompressNeeded(profile);
		const compressible = compressCheck.overLimit.filter((o) => o.action === "compress");
		if (compressible.length > 0) {
			pi.sendUserMessage(
				"Before compaction, profile sections over limit:\n" +
					compressible.map((o) => `  ${o.heading} (${o.chars}/${o.limit} chars)`).join("\n") +
					"\n\nReview and call updateProfile with mode:compress to deduplicate, merge, archive, or summarize.",
				{ deliverAs: "nextTurn" as any },
			);
		} else {
			pi.sendUserMessage(
				"Before compaction, review the recent conversation for any long-term user preferences, project context, or communication patterns worth recording, and call updateProfile if appropriate.",
				{ deliverAs: "nextTurn" as any },
			);
		}
	});
}
