import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Container, Text } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
import type { ToolDefinition, ToolRenderResultOptions } from "../extensions/types.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const QuestionItem = Type.Object({
	question: Type.String({ description: "A clear, specific question to ask the user" }),
	options: Type.Optional(
		Type.Array(Type.String({ description: "A possible answer option" }), {
			minItems: 2,
			maxItems: 5,
			description: "Predefined answer options. Omit to allow free-form response.",
		}),
	),
});

const planQuestionSchema = Type.Object({
	questions: Type.Array(QuestionItem, {
		minItems: 1,
		maxItems: 3,
		description:
			"1-3 questions to ask the user. Each question can optionally have predefined options. Ask only what is critical for producing a good plan.",
	}),
	context: Type.Optional(
		Type.String({
			description: "Brief context explaining why these questions matter for the plan.",
		}),
	),
});

export type PlanQuestionToolInput = Static<typeof planQuestionSchema>;

function formatPlanQuestionCall(
	args: PlanQuestionToolInput | undefined,
	_options: ToolRenderResultOptions,
	theme: Theme,
): string {
	if (!args?.questions?.length) {
		return `${theme.fg("toolTitle", theme.bold("plan_question"))} (no questions)`;
	}

	let text = theme.fg("toolTitle", theme.bold("plan_question"));
	if (args.context) {
		text += `\n${theme.fg("muted", args.context)}`;
	}
	for (let i = 0; i < args.questions.length; i++) {
		const q = args.questions[i];
		text += `\n\n${theme.fg("toolOutput", `Q${i + 1}: ${q.question}`)}`;
		if (q.options?.length) {
			for (let j = 0; j < q.options.length; j++) {
				text += `\n  ${theme.fg("muted", `${j + 1}. ${q.options[j]}`)}`;
			}
		}
	}
	return text;
}

export function createPlanQuestionToolDefinition(): ToolDefinition<typeof planQuestionSchema, undefined> {
	return {
		name: "plan_question",
		label: "plan_question",
		description:
			"Ask the user structured clarifying questions during plan mode. Use this when you need to resolve critical ambiguities before producing a plan. Each question can have optional predefined answers.",
		promptSnippet:
			"Ask 1-3 structured clarifying questions with optional multiple-choice answers. Only use when ambiguity would significantly impact plan quality.",
		promptGuidelines: [
			"Use plan_question only for CRITICAL ambiguities that would change the plan architecture or scope.",
			"Prefer making reasonable assumptions (recorded in assumptions[]) over asking too many questions.",
			"Each question should be specific and actionable, not vague or open-ended.",
			"Provide options when the possible answers are well-defined and limited.",
			"Maximum 3 questions per call. If you need more, the task is likely too vague — summarize what you know and ask the user to clarify the goal first.",
		],
		parameters: planQuestionSchema,
		async execute(_toolCallId, input: PlanQuestionToolInput, _signal?: AbortSignal) {
			const formatted = input.questions
				.map((q, i) => {
					let str = `Q${i + 1}: ${q.question}`;
					if (q.options?.length) {
						str += `\n${q.options.map((opt, j) => `  ${j + 1}. ${opt}`).join("\n")}`;
					}
					return str;
				})
				.join("\n\n");

			const contextLine = input.context ? `\n[Context: ${input.context}]\n\n` : "";

			return {
				content: [
					{
						type: "text",
						text: `${contextLine}${formatted}\n\nPlease answer the questions above to continue planning.`,
					},
				],
				details: undefined,
			};
		},
		renderCall(args, theme, context) {
			const renderArgs = args as PlanQuestionToolInput | undefined;
			return new Text(formatPlanQuestionCall(renderArgs, context, theme), 0, 0);
		},
		renderResult(result, _options, theme, context) {
			const component = (context.lastComponent as Container | undefined) ?? new Container();
			component.clear();
			if (context.isError) {
				const errorText = result.content
					.filter((p) => p.type === "text")
					.map((p) => p.text ?? "")
					.join("\n");
				return new Text(theme.fg("error", errorText), 0, 0);
			}
			return component;
		},
	};
}

export function createPlanQuestionTool(): AgentTool<typeof planQuestionSchema> {
	return wrapToolDefinition(createPlanQuestionToolDefinition());
}
