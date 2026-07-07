import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";
import { getPlanBashCommandDecision, isPathInsideRoot } from "../../src/core/plan-mode-policy.ts";
import type { BashOperations } from "../../src/core/tools/bash.ts";
import type { ExtensionFactory } from "../../src/index.ts";
import { createHarness, type Harness } from "./harness.ts";

function getToolResultText(harness: Harness): string {
	return harness.session.messages
		.filter((message) => message.role === "toolResult")
		.flatMap((message) => message.content)
		.filter((part): part is { type: "text"; text: string } => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}

async function runSingleToolCall(
	harness: Harness,
	toolName: string,
	args: Record<string, unknown>,
	prompt = "make a plan",
): Promise<void> {
	harness.setResponses([
		fauxAssistantMessage(fauxToolCall(toolName, args), { stopReason: "toolUse" }),
		fauxAssistantMessage("done"),
	]);
	await harness.session.prompt(prompt);
}

describe("AgentSession plan mode capabilities", () => {
	const harnesses: Harness[] = [];

	afterEach(() => {
		while (harnesses.length > 0) {
			harnesses.pop()?.cleanup();
		}
	});

	it("exposes only the explicit plan mode capability set", async () => {
		const extensionFactory: ExtensionFactory = (pi) => {
			pi.registerTool({
				name: "external_echo",
				label: "external_echo",
				description: "Extension tool that should not be active in plan mode",
				parameters: Type.Object({ text: Type.String() }),
				execute: async (_toolCallId, { text }: { text: string }) => ({
					content: [{ type: "text", text }],
					details: undefined,
				}),
			});
		};
		const harness = await createHarness({ extensionFactories: [extensionFactory] });
		harnesses.push(harness);

		harness.session.setActiveAgent("plan");

		expect(harness.session.getActiveToolNames().sort()).toEqual(["bash", "find", "grep", "ls", "plan_write", "read"]);
	});

	it("documents full .pi/plan paths and tool-first exploration in plan mode", async () => {
		const harness = await createHarness();
		harnesses.push(harness);

		harness.session.setActiveAgent("plan");

		const planWrite = harness.session.getToolDefinition("plan_write");
		expect(planWrite?.description).toContain(".pi/plan/<name>/plan.json");
		expect(planWrite?.description).toContain(".pi/plan/<name>/context/**");
		expect(planWrite?.description).toContain("path must include the full .pi/plan/<name>/ prefix");
		expect((planWrite?.promptGuidelines ?? []).join("\n")).toContain(".pi/plan/example/plan.json");
		expect(harness.session.agent.state.systemPrompt).toContain(
			"Use ls/find/grep/read tools for project exploration instead of bash equivalents.",
		);
		expect(harness.session.agent.state.systemPrompt).toContain(
			"Run bash only for exact allowlisted environment probes, one command per tool call.",
		);
	});

	it("restores coding tools without plan_write after leaving plan mode", async () => {
		const extensionFactory: ExtensionFactory = (pi) => {
			pi.registerTool({
				name: "external_echo",
				label: "external_echo",
				description: "Extension tool that should return in coding mode",
				parameters: Type.Object({ text: Type.String() }),
				execute: async (_toolCallId, { text }: { text: string }) => ({
					content: [{ type: "text", text }],
					details: undefined,
				}),
			});
		};
		const harness = await createHarness({ extensionFactories: [extensionFactory] });
		harnesses.push(harness);

		harness.session.setActiveAgent("plan");
		harness.session.setActiveAgent("coding");

		expect(harness.session.getActiveToolNames().sort()).toEqual(["bash", "edit", "external_echo", "read", "write"]);
	});

	it("allows plan_write only for per-plan files by default", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		harness.session.setActiveAgent("plan");

		await runSingleToolCall(harness, "plan_write", {
			path: ".pi/plan/example/plan.json",
			content: '{"name":"example"}\n',
		});
		await runSingleToolCall(harness, "plan_write", {
			path: ".pi/plan/example/context/notes.md",
			content: "notes\n",
		});

		expect(readFileSync(join(harness.tempDir, ".pi/plan/example/plan.json"), "utf-8")).toContain("example");
		expect(readFileSync(join(harness.tempDir, ".pi/plan/example/context/notes.md"), "utf-8")).toBe("notes\n");
	});

	it("requires explicit user confirmation before writing project-background.md", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		harness.session.setActiveAgent("plan");

		await runSingleToolCall(harness, "plan_write", {
			path: ".pi/plan/context/project-background.md",
			content: "background\n",
		});
		expect(existsSync(join(harness.tempDir, ".pi/plan/context/project-background.md"))).toBe(false);
		expect(getToolResultText(harness)).toContain("project-background.md");

		await runSingleToolCall(
			harness,
			"plan_write",
			{
				path: ".pi/plan/context/project-background.md",
				content: "background\n",
			},
			"please update .pi/plan/context/project-background.md",
		);

		expect(readFileSync(join(harness.tempDir, ".pi/plan/context/project-background.md"), "utf-8")).toBe(
			"background\n",
		);
	});

	it("accepts Chinese confirmation before writing project-background.md", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		harness.session.setActiveAgent("plan");

		await runSingleToolCall(
			harness,
			"plan_write",
			{
				path: ".pi/plan/context/project-background.md",
				content: "background\n",
			},
			"\u8bf7\u66f4\u65b0 .pi/plan/context/project-background.md",
		);

		expect(readFileSync(join(harness.tempDir, ".pi/plan/context/project-background.md"), "utf-8")).toBe(
			"background\n",
		);
	});

	it("rejects plan_write outside the allowed plan tree including traversal", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		harness.session.setActiveAgent("plan");

		for (const path of ["src/index.ts", ".pi/plan/../src/index.ts", ".pi\\plan\\..\\src\\index.ts"]) {
			await runSingleToolCall(harness, "plan_write", { path, content: "x" });
		}

		expect(existsSync(join(harness.tempDir, "src/index.ts"))).toBe(false);
		expect(getToolResultText(harness)).toContain("Plan mode can only write");
	});

	it.skipIf(process.platform !== "win32")("matches Windows plan paths without sibling-root escape", () => {
		const repo = "C:\\repo";
		expect(isPathInsideRoot("C:\\repo\\.pi\\plan\\example\\plan.json", "C:\\repo\\.pi\\plan")).toBe(true);
		expect(isPathInsideRoot("C:\\repo-other\\.pi\\plan\\example\\plan.json", "C:\\repo\\.pi\\plan")).toBe(false);
		expect(isPathInsideRoot(resolve(repo, ".pi\\plan\\..\\src\\index.ts"), "C:\\repo\\.pi\\plan")).toBe(false);
	});

	it("blocks read tools outside the project unless the user explicitly mentioned the path", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		harness.session.setActiveAgent("plan");
		const externalDir = resolve(harness.tempDir, "..", "external-plan-mode");
		mkdirSync(externalDir, { recursive: true });
		const externalFile = join(externalDir, "allowed.txt");
		const siblingFile = join(externalDir, "sibling.txt");
		writeFileSync(externalFile, "allowed");
		writeFileSync(siblingFile, "sibling");

		await runSingleToolCall(harness, "read", { path: siblingFile });
		expect(getToolResultText(harness)).toContain("Plan mode cannot read");

		await runSingleToolCall(harness, "read", { path: externalFile }, `read ${externalFile}`);
		expect(getToolResultText(harness)).toContain("allowed");

		await runSingleToolCall(harness, "read", { path: siblingFile }, `read ${externalFile}`);
		expect(getToolResultText(harness)).toContain("Plan mode cannot read");
	});

	it("does not expand external read roots from tool output", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		harness.session.setActiveAgent("plan");
		const externalDir = resolve(harness.tempDir, "..", "external-plan-output");
		mkdirSync(externalDir, { recursive: true });
		const allowedFile = join(externalDir, "allowed.txt");
		const siblingFile = join(externalDir, "sibling.txt");
		writeFileSync(allowedFile, siblingFile);
		writeFileSync(siblingFile, "sibling");
		harness.setResponses([
			fauxAssistantMessage(fauxToolCall("read", { path: allowedFile }), { stopReason: "toolUse" }),
			fauxAssistantMessage(fauxToolCall("read", { path: siblingFile }), { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);

		await harness.session.prompt(`read ${allowedFile}`);

		expect(getToolResultText(harness)).toContain(siblingFile);
		expect(getToolResultText(harness)).toContain("Plan mode cannot read");
	});

	it("allows only exact read-only bash command shapes in plan mode", () => {
		for (const command of [
			"node --version",
			"python3 --version",
			"cargo --version",
			"docker --version",
			"where node",
			"npm config get registry",
			"git status --short",
			"git diff --name-only",
		]) {
			expect(getPlanBashCommandDecision(command)).toEqual({ allowed: true });
		}

		for (const command of [
			'node -e "console.log(1)"',
			'python -c "print(1)"',
			"npm install",
			"pnpm add left-pad",
			"cargo install ripgrep",
			"npm config get //registry/:_authToken",
			"docker ps",
			"git diff --ext-diff",
			"echo x > file",
		]) {
			expect(getPlanBashCommandDecision(command).allowed).toBe(false);
		}
	});

	it("applies plan bash policy to tool calls and direct executeBash", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		harness.session.setActiveAgent("plan");

		await runSingleToolCall(harness, "bash", { command: 'node -e "console.log(1)"' });
		expect(getToolResultText(harness)).toContain("Plan mode blocks this bash command");

		await expect(harness.session.executeBash("npm install")).rejects.toThrow("Plan mode blocks this bash command");
	});

	it("does not execute configured shell prefixes in plan mode bash", async () => {
		const executedCommands: string[] = [];
		const operations: BashOperations = {
			exec: async (command) => {
				executedCommands.push(command);
				return { exitCode: 0 };
			},
		};
		const marker = join(
			process.env.TEMP ?? process.env.TMP ?? harnesses[0]?.tempDir ?? ".",
			`pi-plan-prefix-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		const harness = await createHarness({
			settings: { shellCommandPrefix: `echo should-not-run > ${marker}` },
		});
		harnesses.push(harness);
		harness.session.setActiveAgent("plan");

		let markerExists = false;
		try {
			await runSingleToolCall(harness, "bash", { command: "node --version" });
			await harness.session.executeBash("node --version", undefined, { operations });
			markerExists = existsSync(marker);
		} finally {
			if (existsSync(marker)) {
				rmSync(marker, { force: true });
			}
		}

		expect(executedCommands).toEqual(["node --version"]);
		expect(markerExists).toBe(false);
	});

	it("reapplies plan profile after reload without expanding tools or losing plan_write policy", async () => {
		const extensionFactory: ExtensionFactory = (pi) => {
			pi.registerTool({
				name: "reload_tool",
				label: "reload_tool",
				description: "Extension tool that should not appear in plan mode after reload",
				parameters: Type.Object({}),
				execute: async () => ({ content: [{ type: "text", text: "reload" }], details: undefined }),
			});
		};
		const harness = await createHarness({ extensionFactories: [extensionFactory] });
		harnesses.push(harness);
		harness.session.setActiveAgent("plan");

		await harness.session.reload();

		expect(harness.session.getActiveToolNames().sort()).toEqual(["bash", "find", "grep", "ls", "plan_write", "read"]);
		const planWrite = harness.session.getToolDefinition("plan_write");
		expect(planWrite).toBeDefined();
		await expect(
			planWrite!.execute(
				"reload-plan-write",
				{ path: ".pi/plan/../src/index.ts", content: "x" },
				undefined,
				undefined,
				harness.session.extensionRunner.createContext(),
			),
		).rejects.toThrow("Plan mode can only write");
		expect(existsSync(join(harness.tempDir, "src/index.ts"))).toBe(false);
	});
});
