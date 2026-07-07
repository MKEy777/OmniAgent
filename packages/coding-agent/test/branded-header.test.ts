import { describe, expect, it } from "vitest";
import { BrandedHeader } from "../src/modes/interactive/components/branded-header.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

function stripAnsi(text: string): string {
	return text.replace(/\u001b\[[0-9;]*m/g, "");
}

describe("BrandedHeader", () => {
	it("renders startup hints for agents, interrupt, recent models, files, and skills", () => {
		initTheme("dark");
		const header = new BrandedHeader();

		const output = stripAnsi(header.render(120).join("\n"));

		expect(output).toContain("tab agents");
		expect(output).toContain("esc interrupt");
		expect(output).toContain("ctrl+m models");
		expect(output).toContain("@file files");
		expect(output).toContain("/name skills");
		expect(output).not.toContain("/plan");
		expect(output).not.toContain("ctrl+p commands");
	});
});
