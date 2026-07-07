import { mkdir as fsMkdir, writeFile as fsWriteFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Container, Text } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
import type { ToolDefinition, ToolRenderResultOptions } from "../extensions/types.ts";
import { isPlanWritePathAllowed, resolvePlanModePath } from "../plan-mode-policy.ts";
import { withFileMutationQueue } from "./file-mutation-queue.ts";
import { normalizeDisplayText, renderToolPath, replaceTabs, str } from "./render-utils.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const planWriteSchema = Type.Object({
	path: Type.String({
		description:
			"Full project-relative plan path. Must include the .pi/plan/<name>/ prefix, for example .pi/plan/example/plan.json.",
	}),
	content: Type.String({ description: "Content to write to the plan file" }),
});

export type PlanWriteToolInput = Static<typeof planWriteSchema>;

export interface PlanWriteOperations {
	writeFile: (absolutePath: string, content: string) => Promise<void>;
	mkdir: (dir: string) => Promise<void>;
}

const defaultPlanWriteOperations: PlanWriteOperations = {
	writeFile: (path, content) => fsWriteFile(path, content, "utf-8"),
	mkdir: (dir) => fsMkdir(dir, { recursive: true }).then(() => {}),
};

export interface PlanWriteToolOptions {
	operations?: PlanWriteOperations;
	allowProjectBackgroundWrite?: () => boolean;
}

function formatPlanWriteCall(
	args: { path?: string; file_path?: string; content?: string } | undefined,
	options: ToolRenderResultOptions,
	theme: Theme,
	cwd: string,
): string {
	const rawPath = str(args?.file_path ?? args?.path);
	const fileContent = str(args?.content);
	let text = `${theme.fg("toolTitle", theme.bold("plan_write"))} ${renderToolPath(rawPath, theme, cwd)}`;
	if (fileContent) {
		const lines = replaceTabs(normalizeDisplayText(fileContent)).split("\n");
		const maxLines = options.expanded ? lines.length : 10;
		text += `\n\n${lines
			.slice(0, maxLines)
			.map((line) => theme.fg("toolOutput", line))
			.join("\n")}`;
		if (lines.length > maxLines) {
			text += theme.fg("muted", `\n... (${lines.length - maxLines} more lines)`);
		}
	}
	return text;
}

function formatPlanWriteError(result: { content: Array<{ type: string; text?: string }>; isError?: boolean }): string {
	if (!result.isError) return "";
	return result.content
		.filter((part) => part.type === "text")
		.map((part) => part.text ?? "")
		.join("\n");
}

export function createPlanWriteToolDefinition(
	cwd: string,
	options?: PlanWriteToolOptions,
): ToolDefinition<typeof planWriteSchema, undefined> {
	const ops = options?.operations ?? defaultPlanWriteOperations;
	return {
		name: "plan_write",
		label: "plan_write",
		description:
			"Write Plan mode artifacts. The path must include the full .pi/plan/<name>/ prefix. Only .pi/plan/<name>/plan.json and .pi/plan/<name>/context/** are allowed by default.",
		promptSnippet: "Write structured plan artifacts with full paths under .pi/plan/<name>/",
		promptGuidelines: [
			"Use plan_write with full project-relative paths, for example .pi/plan/example/plan.json or .pi/plan/example/context/notes.md.",
			"Only update .pi/plan/context/project-background.md after explicit user confirmation.",
		],
		parameters: planWriteSchema,
		async execute(_toolCallId, { path, content }: PlanWriteToolInput, signal?: AbortSignal) {
			const allowProjectBackgroundWrite = options?.allowProjectBackgroundWrite?.() ?? false;
			if (!isPlanWritePathAllowed(cwd, path, { allowProjectBackgroundWrite })) {
				throw new Error(
					`Plan mode can only write .pi/plan/<name>/plan.json or .pi/plan/<name>/context/**. Refused: ${path}`,
				);
			}
			const absolutePath = resolvePlanModePath(cwd, path);
			const dir = dirname(absolutePath);
			return withFileMutationQueue(absolutePath, async () => {
				const throwIfAborted = (): void => {
					if (signal?.aborted) throw new Error("Operation aborted");
				};
				throwIfAborted();
				await ops.mkdir(dir);
				throwIfAborted();
				await ops.writeFile(absolutePath, content);
				throwIfAborted();
				return {
					content: [{ type: "text", text: `Successfully wrote ${content.length} bytes to ${path}` }],
					details: undefined,
				};
			});
		},
		renderCall(args, theme, context) {
			const renderArgs = args as { path?: string; file_path?: string; content?: string } | undefined;
			return new Text(formatPlanWriteCall(renderArgs, context, theme, context.cwd), 0, 0);
		},
		renderResult(result, _options, theme, context) {
			const error = formatPlanWriteError({ ...result, isError: context.isError });
			if (!error) {
				const component = (context.lastComponent as Container | undefined) ?? new Container();
				component.clear();
				return component;
			}
			return new Text(theme.fg("error", error), 0, 0);
		},
	};
}

export function createPlanWriteTool(cwd: string, options?: PlanWriteToolOptions): AgentTool<typeof planWriteSchema> {
	return wrapToolDefinition(createPlanWriteToolDefinition(cwd, options));
}
