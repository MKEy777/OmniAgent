import { describe, expect, it } from "vitest";
import { executeBashWithOperations } from "../src/core/bash-executor.ts";
import { type BashOperations, createBashTool } from "../src/core/tools/bash.ts";

function getTextOutput(result: { content?: Array<{ type: string; text?: string }> }): string {
	return (
		result.content
			?.filter((block) => block.type === "text")
			.map((block) => block.text ?? "")
			.join("\n") ?? ""
	);
}

function createSplitChineseGbkOperations(): BashOperations {
	return {
		exec: async (_command, _cwd, { onData }) => {
			onData(Buffer.from([0xd6]));
			onData(Buffer.from([0xd0, 0xce]));
			onData(Buffer.from([0xc4, 0x0a]));
			return { exitCode: 0 };
		},
	};
}

describe("shell output decoding", () => {
	it("decodes split Windows code page Chinese output in bash tool results", async () => {
		const bash = createBashTool(process.cwd(), { operations: createSplitChineseGbkOperations() });

		const result = await bash.execute("test-call-windows-code-page-chinese", { command: "echo-chinese" });

		expect(getTextOutput(result).trim()).toBe("\u4e2d\u6587");
	});

	it("decodes split Windows code page Chinese output in direct bash execution", async () => {
		const result = await executeBashWithOperations("echo-chinese", process.cwd(), createSplitChineseGbkOperations());

		expect(result.output.trim()).toBe("\u4e2d\u6587");
	});

	it("preserves split UTF-8 output in bash tool results", async () => {
		const euro = Buffer.from("\u20ac\n", "utf-8");
		const operations: BashOperations = {
			exec: async (_command, _cwd, { onData }) => {
				onData(euro.subarray(0, 1));
				onData(euro.subarray(1));
				return { exitCode: 0 };
			},
		};
		const bash = createBashTool(process.cwd(), { operations });

		const result = await bash.execute("test-call-split-utf8", { command: "split-utf8" });

		expect(getTextOutput(result).trim()).toBe("\u20ac");
	});
});
