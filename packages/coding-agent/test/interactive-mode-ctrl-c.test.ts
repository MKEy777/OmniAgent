import { describe, expect, test, vi } from "vitest";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";

type CtrlCThis = {
	editor: { getText: () => string };
	clearEditor: () => void;
	shutdown: () => Promise<void>;
};

type InteractiveModePrototypeWithCtrlC = {
	handleCtrlC(this: CtrlCThis): void;
};

const interactiveModePrototype = InteractiveMode.prototype as unknown as InteractiveModePrototypeWithCtrlC;

describe("InteractiveMode Ctrl+C", () => {
	test("exits immediately when the editor is empty", () => {
		const context: CtrlCThis = {
			editor: { getText: () => "" },
			clearEditor: vi.fn(),
			shutdown: vi.fn(async () => {}),
		};

		interactiveModePrototype.handleCtrlC.call(context);

		expect(context.shutdown).toHaveBeenCalledTimes(1);
		expect(context.clearEditor).not.toHaveBeenCalled();
	});
});
