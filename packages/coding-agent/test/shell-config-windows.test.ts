import { afterEach, describe, expect, test, vi } from "vitest";

const moduleMocks = vi.hoisted(() => ({
	existsSync: vi.fn<(path: string) => boolean>(),
	spawnSync:
		vi.fn<(command: string, args?: readonly string[], options?: unknown) => { status: number; stdout: string }>(),
}));

vi.mock("node:fs", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return { ...actual, existsSync: moduleMocks.existsSync };
});

vi.mock("child_process", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return { ...actual, spawnSync: moduleMocks.spawnSync };
});

import { getShellConfig } from "../src/utils/shell.ts";

function setPlatform(value: NodeJS.Platform): PropertyDescriptor | undefined {
	const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
	Object.defineProperty(process, "platform", { configurable: true, value });
	return descriptor;
}

function restorePlatform(descriptor: PropertyDescriptor | undefined): void {
	if (descriptor) {
		Object.defineProperty(process, "platform", descriptor);
	}
}

describe("Windows shell resolution", () => {
	const originalProgramFiles = process.env.ProgramFiles;
	const originalProgramFilesX86 = process.env["ProgramFiles(x86)"];
	const originalComSpec = process.env.ComSpec;

	afterEach(() => {
		vi.restoreAllMocks();
		process.env.ProgramFiles = originalProgramFiles;
		process.env["ProgramFiles(x86)"] = originalProgramFilesX86;
		process.env.ComSpec = originalComSpec;
	});

	test("skips implicit legacy WSL bash.exe", () => {
		const platformDescriptor = setPlatform("win32");
		process.env.ProgramFiles = "C:\\MissingProgramFiles";
		process.env["ProgramFiles(x86)"] = "C:\\MissingProgramFilesX86";
		process.env.ComSpec = "C:\\Windows\\System32\\cmd.exe";
		moduleMocks.existsSync.mockImplementation((path) => path === "C:\\Windows\\System32\\bash.exe");
		moduleMocks.spawnSync.mockReturnValue({
			status: 0,
			stdout: "C:\\Windows\\System32\\bash.exe\r\n",
		});

		try {
			expect(() => getShellConfig()).toThrow("No bash shell found");
		} finally {
			restorePlatform(platformDescriptor);
		}
	});
});
