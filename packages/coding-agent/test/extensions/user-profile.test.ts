import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	applyUpdate,
	buildProfilePrompt,
	checkCompressNeeded,
	classifySection,
	createDefaultProfile,
	ensureProfileFile,
	extractKeywords,
	parseProfile,
	scoreSection,
	serializeProfile,
	validateUpdate,
	writeProfile,
} from "../../examples/extensions/user-profile.ts";
import { AuthStorage } from "../../src/core/auth-storage.ts";
import { discoverAndLoadExtensions } from "../../src/core/extensions/loader.ts";
import { ExtensionRunner } from "../../src/core/extensions/runner.ts";
import { ModelRegistry } from "../../src/core/model-registry.ts";
import { SessionManager } from "../../src/core/session-manager.ts";

describe("classifySection", () => {
	it("classifies bare headings as always", () => {
		expect(classifySection("## Identity")).toBe("always");
		expect(classifySection("## Coding Preferences")).toBe("always");
	});

	it("classifies [auto] headings", () => {
		expect(classifySection("## [auto] Projects")).toBe("auto");
	});

	it("classifies [ref] headings", () => {
		expect(classifySection("## [ref] Past Decisions")).toBe("ref");
	});
});

describe("parseProfile", () => {
	const sample = `---
version: 1
updated_at: 2026-07-06
disabled: false
---

## Identity
role: Engineer

## [auto] Projects
- Pi coding agent

## [ref] Decisions
- chose extension
`;

	it("parses frontmatter", () => {
		const p = parseProfile(sample);
		expect(p).not.toBeNull();
		expect(p!.version).toBe(1);
		expect(p!.disabled).toBe(false);
	});

	it("parses sections with correct types", () => {
		const p = parseProfile(sample)!;
		expect(p.sections).toHaveLength(3);
		expect(p.sections[0]!.type).toBe("always");
		expect(p.sections[0]!.heading).toBe("Identity");
		expect(p.sections[1]!.type).toBe("auto");
		expect(p.sections[1]!.heading).toBe("[auto] Projects");
		expect(p.sections[2]!.type).toBe("ref");
	});

	it("returns null on unparseable content", () => {
		expect(parseProfile("")).toBeNull();
	});
});

describe("createDefaultProfile", () => {
	it("returns a valid profile template", () => {
		const tmpl = createDefaultProfile();
		expect(typeof tmpl).toBe("string");
		const p = parseProfile(tmpl);
		expect(p).not.toBeNull();
		expect(p!.version).toBe(1.1);
		expect(p!.disabled).toBe(false);
		expect(p!.sections.length).toBeGreaterThan(0);
	});
});

describe("ensureProfileFile", () => {
	const testProfilePath = "C:\\Users\\VECTOR\\AppData\\Local\\Temp\\opencode\\__test_profile.md";

	afterEach(() => {
		try {
			fs.unlinkSync(testProfilePath);
		} catch {}
	});

	it("creates and reads a profile file", () => {
		const p = ensureProfileFile(testProfilePath);
		expect(p.version).toBe(1.1);
		expect(p.disabled).toBe(false);
		expect(p.sections.length).toBeGreaterThan(0);
	});
});

describe("extractKeywords", () => {
	it("extracts meaningful keywords from text", () => {
		const words = extractKeywords("How should I design the Pi monorepo structure?");
		expect(words.has("design")).toBe(true);
		expect(words.has("monorepo")).toBe(true);
		expect(words.has("structure")).toBe(true);
		expect(words.has("the")).toBe(false);
	});
});

describe("scoreSection", () => {
	const now = new Date().toISOString().slice(0, 10);
	const oldDate = "2025-01-01";

	it("returns 0 when no match", () => {
		const msg = new Set(["react", "components"]);
		expect(scoreSection(["projects"], ["something"], msg, oldDate)).toBe(0);
	});

	it("gives +2 for heading match", () => {
		const msg = new Set(["projects"]);
		expect(scoreSection(["projects"], [], msg, oldDate)).toBe(2);
	});

	it("gives +1 for content match", () => {
		const msg = new Set(["react"]);
		expect(scoreSection(["projects"], ["react"], msg, oldDate)).toBe(1);
	});

	it("gives recency bonus when updated within 72h", () => {
		const msg = new Set(["projects"]);
		expect(scoreSection(["projects"], [], msg, now)).toBe(3);
	});
});

describe("buildProfilePrompt", () => {
	const profile = parseProfile(`---
version: 1
updated_at: 2026-07-06
disabled: false
---

## Identity
role: Engineer

## Communication Preferences
direct and concise

## [auto] Projects
- Pi coding agent

## [ref] Past Decisions
- chose extension
`)!;

	it("includes always sections", () => {
		const result = buildProfilePrompt(profile, "hello");
		expect(result).toContain("Identity");
		expect(result).toContain("Communication Preferences");
	});

	it("does not include ref sections content", () => {
		const result = buildProfilePrompt(profile, "hello");
		expect(result).not.toContain("- chose extension");
	});

	it("includes ref section index", () => {
		const result = buildProfilePrompt(profile, "hello");
		expect(result).toContain("[ref] Past Decisions");
	});

	it("includes matched auto sections", () => {
		const result = buildProfilePrompt(profile, "how to structure the pi agent monorepo?");
		expect(result).toContain("[auto] Projects");
	});
});

describe("validateUpdate", () => {
	const profile = parseProfile(`---
version: 1
disabled: false
---

## Identity
role: Engineer

## [auto] Projects
- Pi coding agent
`)!;

	it("rejects empty reason", () => {
		const err = validateUpdate(profile, "Projects", "new content", "append", "");
		expect(err).not.toBeNull();
		expect(err).toContain("reason");
	});

	it("rejects replace on Identity", () => {
		const err = validateUpdate(profile, "Identity", "new role", "replace", "always uses new role permanently");
		expect(err).not.toBeNull();
		expect(err).toContain("Identity");
	});

	it("allows append on Identity", () => {
		const err = validateUpdate(profile, "Identity", "new info", "append", "consistently adds role updates");
		expect(err).toBeNull();
	});

	it("rejects content with API keys", () => {
		const err = validateUpdate(
			profile,
			"Projects",
			"secret: sk-abc123",
			"append",
			"habit of using secrets in projects",
		);
		expect(err).not.toBeNull();
		expect(err).toContain("sensitive");
	});

	it("rejects highly overlapping content", () => {
		const err = validateUpdate(
			profile,
			"Projects",
			"- Pi coding agent\nduplicate",
			"append",
			"always adds project updates consistently",
		);
		expect(err).not.toBeNull();
		expect(err).toContain("duplicate");
	});
});

describe("applyUpdate", () => {
	const baseProfile = parseProfile(`---
version: 1
disabled: false
---

## [auto] Projects
- existing project
`)!;

	it("appends content to section", () => {
		const updated = applyUpdate(baseProfile, "[auto] Projects", "- new project", "append");
		expect(updated.sections[0]!.content).toContain("- existing project");
		expect(updated.sections[0]!.content).toContain("- new project");
	});

	it("replaces content in replace mode", () => {
		const updated = applyUpdate(baseProfile, "[auto] Projects", "- replaced content", "replace");
		expect(updated.sections[0]!.content).toBe("- replaced content");
	});

	it("upserts key-value content", () => {
		const profile = parseProfile(`---
version: 1
disabled: false
---

## Coding Preferences
lang: TypeScript
`)!;
		const updated = applyUpdate(profile, "Coding Preferences", "lang: Rust", "upsert");
		expect(updated.sections[0]!.content).toContain("lang: Rust");
		expect(updated.sections[0]!.content).not.toContain("lang: TypeScript");
	});

	it("updates section timestamp on write", () => {
		const updated = applyUpdate(baseProfile, "[auto] Projects", "- new", "append");
		expect(updated.sections[0]!.updatedAt).toBe(new Date().toISOString().slice(0, 10));
	});
});

describe("serializeProfile", () => {
	it("produces valid frontmatter and sections", () => {
		const profile = parseProfile(`---
version: 1
disabled: false
---

## Identity
role: Tester
`)!;
		const md = serializeProfile(profile);
		expect(md).toContain("version: 1");
		expect(md).toContain("## Identity");
		expect(md).toContain("role: Tester");
	});

	it("includes updated timestamps in headings", () => {
		const profile = parseProfile(`---
version: 1
disabled: false
---

## Identity
role: Tester
`)!;
		profile.sections[0]!.updatedAt = "2026-07-07";
		const md = serializeProfile(profile);
		expect(md).toContain("<!-- updated: 2026-07-07 -->");
	});
});

describe("writeProfile", () => {
	const testPath = "C:\\Users\\VECTOR\\AppData\\Local\\Temp\\opencode\\__test_write_profile.md";

	afterEach(() => {
		try {
			fs.unlinkSync(testPath);
		} catch {}
	});

	it("writes a profile to disk", () => {
		const profile = parseProfile(`---
version: 1
disabled: false
---

## Identity
role: Writer
`)!;
		writeProfile(testPath, profile);
		const content = fs.readFileSync(testPath, "utf-8");
		expect(content).toContain("role: Writer");
	});
});

describe("user-profile extension integration", () => {
	let tempDir: string;
	let extensionsDir: string;
	let sessionManager: SessionManager;
	let modelRegistry: ModelRegistry;
	const extensionActions = {
		sendMessage: () => {},
		sendUserMessage: () => {},
		appendEntry: () => {},
		setSessionName: () => {},
		getSessionName: () => undefined,
		setLabel: () => {},
		getActiveTools: () => [],
		getAllTools: () => [],
		setActiveTools: () => {},
		refreshTools: () => {},
		getCommands: () => [],
		setModel: async () => false,
		getThinkingLevel: () => "off" as const,
		setThinkingLevel: () => {},
	};
	const extensionContextActions = {
		getModel: () => undefined,
		isIdle: () => true,
		isProjectTrusted: () => true,
		getSignal: () => undefined,
		abort: () => {},
		hasPendingMessages: () => false,
		shutdown: () => {},
		getContextUsage: () => undefined,
		compact: () => {},
		getSystemPrompt: () => "",
	};

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-profile-test-"));
		extensionsDir = path.join(tempDir, "extensions");
		fs.mkdirSync(extensionsDir);
		sessionManager = SessionManager.inMemory();
		const authStorage = AuthStorage.create(path.join(tempDir, "auth.json"));
		modelRegistry = ModelRegistry.create(authStorage);
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	async function loadPatchedExtension(): Promise<{ extPath: string; runner: ExtensionRunner }> {
		const extPath = path.join(extensionsDir, "profile.ts");
		const sourceDir = new URL("../../examples/extensions/", import.meta.url);
		const realExt = fs.readFileSync(new URL("user-profile.ts", sourceDir), "utf-8");
		const profilePath = path.join(tempDir, "profile.md").replace(/\\/g, "\\\\");
		const patched = realExt.replace(/const PROFILE_PATH = .*/, `const PROFILE_PATH = "${profilePath}"`);
		fs.writeFileSync(extPath, patched, "utf-8");

		const result = await discoverAndLoadExtensions([extPath], tempDir);
		const runner = new ExtensionRunner(result.extensions, result.runtime, tempDir, sessionManager, modelRegistry);
		runner.bindCore(extensionActions, extensionContextActions);
		return { extPath, runner };
	}

	it("loads and registers updateProfile tool", async () => {
		const { runner } = await loadPatchedExtension();
		const tools = runner.getAllRegisteredTools();
		expect(tools.some((t) => t.definition.name === "updateProfile")).toBe(true);
	});

	it("creates profile.md on first before_agent_start", async () => {
		const { runner } = await loadPatchedExtension();
		await runner.emitBeforeAgentStart("hello", undefined, "base system prompt", { cwd: tempDir });
		expect(fs.existsSync(path.join(tempDir, "profile.md"))).toBe(true);
		const content = fs.readFileSync(path.join(tempDir, "profile.md"), "utf-8");
		expect(content).toContain("## Identity");
	});

	it("injects profile sections into system prompt on before_agent_start", async () => {
		// Write a profile.md manually
		const manualProfile = `---
version: 1
updated_at: 2026-07-07
disabled: false
---

## Identity
role: Integration Tester

## Communication Preferences
direct and technical

## [auto] Projects
- Profile project

## [ref] Past Decisions
- chose extension approach
`;
		fs.writeFileSync(path.join(tempDir, "profile.md"), manualProfile, "utf-8");

		const { runner } = await loadPatchedExtension();
		const chained = await runner.emitBeforeAgentStart("hello", undefined, "base", { cwd: tempDir });

		expect(chained).toBeDefined();
		expect(chained!.systemPrompt).toContain("[Identity]");
		expect(chained!.systemPrompt).toContain("role: Integration Tester");
		expect(chained!.systemPrompt).toContain("[Communication Preferences]");
		expect(chained!.systemPrompt).toContain("direct and technical");
		expect(chained!.systemPrompt).toContain("[ref] Past Decisions");
		expect(chained!.systemPrompt).toContain("</user_profile>");
	});
});

describe("frontmatter inject/compress", () => {
	it("uses defaults when frontmatter is missing", () => {
		const p = parseProfile("## Identity\nrole: dev");
		expect(p!.inject.maxAutoSections).toBe(3);
		expect(p!.compress.autoMaxChars).toBe(1200);
	});

	it("parses inject config from frontmatter", () => {
		const md = `---\ninject:\n  max_auto_sections: 5\n---\n\n## Identity\n`;
		const p = parseProfile(md)!;
		expect(p.inject.maxAutoSections).toBe(5);
	});

	it("parses compress config from frontmatter", () => {
		const md = `---\ncompress:\n  auto_max_chars: 800\n---\n\n## Identity\n`;
		const p = parseProfile(md)!;
		expect(p.compress.autoMaxChars).toBe(800);
	});
});

describe("checkCompressNeeded", () => {
	it("returns needsCompress=false for small profile", () => {
		const p = parseProfile(`## Identity\nrole: dev`)!;
		const r = checkCompressNeeded(p);
		expect(r.needsCompress).toBe(false);
		expect(r.overLimit).toHaveLength(0);
	});

	it("flags auto section over limit with action=compress", () => {
		const p = parseProfile(`## [auto] Projects\n${"x".repeat(1300)}`)!;
		const r = checkCompressNeeded(p);
		expect(r.overLimit).toHaveLength(1);
		expect(r.overLimit[0]!.action).toBe("compress");
	});

	it("flags always section over limit with action=notify", () => {
		const p = parseProfile(`## Identity\n${"x".repeat(2200)}`)!;
		const r = checkCompressNeeded(p);
		expect(r.overLimit).toHaveLength(1);
		expect(r.overLimit[0]!.action).toBe("notify");
	});

	it("flags total profile over limit", () => {
		const big = Array.from({ length: 50 }, (_, i) => `## [auto] Section${i}\n${"x".repeat(300)}`).join("\n");
		const p = parseProfile(big)!;
		const r = checkCompressNeeded(p);
		expect(r.needsCompress).toBe(true);
	});
});

describe("buildProfilePrompt with inject config", () => {
	it("respects maxAuto parameter", () => {
		const md = `## [auto] Alpha\nimportant data here\n## [auto] Beta\nother data\n## [auto] Gamma\ndata\n## [auto] Delta\nstuff`;
		const p = parseProfile(md)!;
		const result = buildProfilePrompt(p, "Alpha project important data", 1, 99999);
		expect(result).toContain("[auto] Alpha");
		expect(result).not.toContain("[auto] Beta");
	});

	it("drops auto sections when over maxChars", () => {
		const md = `## Identity\nrole\n## [auto] Projects\n${"x".repeat(2000)}`;
		const p = parseProfile(md)!;
		const result = buildProfilePrompt(p, "projects", 3, 500);
		expect(result).toContain("Identity");
		expect(result).not.toContain("[auto] Projects");
	});

	it("truncates profile when still over maxChars after removing auto", () => {
		const md = `## Identity\n${"x".repeat(1000)}`;
		const p = parseProfile(md)!;
		const result = buildProfilePrompt(p, "hello", 3, 100);
		expect(result).toContain("<!-- truncated -->");
	});
});

describe("validateUpdate compress mode", () => {
	it("skips all normal validation for compress mode", () => {
		const p = parseProfile(`## [auto] Projects\nold content`)!;
		const err = validateUpdate(p, "Projects", "new compressed content", "compress", "");
		expect(err).toBeNull();
	});

	it("rejects compress on non-existent section", () => {
		const p = parseProfile(`## Identity\nrole`)!;
		const err = validateUpdate(p, "Nonexistent", "content", "compress", "compress reason");
		expect(err).toContain("not found");
	});

	it("rejects compress with sensitive content", () => {
		const p = parseProfile(`## [auto] Projects\nstuff`)!;
		const err = validateUpdate(p, "Projects", "this contains api_key: secret_value", "compress", "compress reason");
		expect(err).toContain("sensitive");
	});
});

describe("applyUpdate compress mode", () => {
	it("replaces section content (same as replace)", () => {
		const p = parseProfile(`## [auto] Projects\nold\nstuff`)!;
		const updated = applyUpdate(p, "Projects", "compressed content", "compress");
		expect(updated.sections[0]!.content).toBe("compressed content");
	});

	it("updates timestamp", () => {
		const p = parseProfile(`## [auto] Projects\nold`)!;
		const updated = applyUpdate(p, "Projects", "new", "compress");
		expect(updated.sections[0]!.updatedAt).toBe(new Date().toISOString().slice(0, 10));
	});
});

describe("ensureProfileFile with new template", () => {
	it("creates profile with inject/compress frontmatter", () => {
		const tmp = path.join(os.tmpdir(), `profile-test-${Date.now()}.md`);
		try {
			const p = ensureProfileFile(tmp);
			expect(p.inject.maxAutoSections).toBe(3);
			expect(p.compress.autoMaxChars).toBe(1200);
		} finally {
			if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
		}
	});
});
