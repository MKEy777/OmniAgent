import { TUI } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { defaultEditorTheme } from "../../tui/test/test-themes.ts";
import { VirtualTerminal } from "../../tui/test/virtual-terminal.ts";
import { KeybindingsManager } from "../src/core/keybindings.ts";
import { CustomEditor } from "../src/modes/interactive/components/custom-editor.ts";

describe("CustomEditor app keybindings", () => {
	it("submits enter instead of treating legacy ctrl+m as model cycling", () => {
		const editor = new CustomEditor(new TUI(new VirtualTerminal()), defaultEditorTheme, new KeybindingsManager());
		const cycleModel = vi.fn();
		const submit = vi.fn();

		editor.onAction("app.model.cycleForward", cycleModel);
		editor.onSubmit = submit;
		editor.setText("hello");

		editor.handleInput("\r");

		expect(cycleModel).not.toHaveBeenCalled();
		expect(submit).toHaveBeenCalledWith("hello");
	});

	it("cycles agents on tab without triggering model cycling", () => {
		const editor = new CustomEditor(new TUI(new VirtualTerminal()), defaultEditorTheme, new KeybindingsManager());
		const cycleAgent = vi.fn();
		const cycleModel = vi.fn();

		editor.onAction("app.agent.cycle", cycleAgent);
		editor.onAction("app.model.cycleForward", cycleModel);

		editor.handleInput("\t");

		expect(cycleAgent).toHaveBeenCalledOnce();
		expect(cycleModel).not.toHaveBeenCalled();
	});
});
