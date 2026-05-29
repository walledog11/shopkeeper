import type Anthropic from "@anthropic-ai/sdk";
import type { CustomerMemory } from "@clerk/db";
import { anthropic, buildCachedSystemPrompt } from "@/lib/ai/anthropic";
import type { OrgSettings } from "@/types";
import { readModelUsage } from "../usage";
import type { JudgeResult, RubricCheck } from "./types";

const JUDGE_MODEL = "claude-sonnet-4-6";

const JUDGE_SYSTEM_PROMPT = `You evaluate an AI support agent's drafted reply against a list of rubric checks.

For each check, decide whether the reply satisfies the check's description, given the supplied context (brand voice, customer memory, conversation excerpt).

Return your results by calling the report_judgments tool exactly once. Include one entry per check, using the same checkId values that were provided. Keep each reasoning to 1–2 sentences explaining the basis for the pass/fail decision. Do not invent checkIds, and do not skip any checks.

Judge strictly on the rubric description. Do not penalize stylistic choices that the rubric does not call out.`;

export interface JudgeContext {
  orgSettings?: Partial<OrgSettings> | null;
  customerMemory?: CustomerMemory | null;
  recentMessages?: { senderType: string; contentText: string | null }[];
}

const REPORT_TOOL: Anthropic.Tool = {
  name: "report_judgments",
  description: "Report a pass/fail judgment with reasoning for each rubric check.",
  input_schema: {
    type: "object",
    properties: {
      judgments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            checkId: { type: "string" },
            pass: { type: "boolean" },
            reasoning: { type: "string" },
          },
          required: ["checkId", "pass", "reasoning"],
        },
      },
    },
    required: ["judgments"],
  },
};

function renderContext(context: JudgeContext): string {
  const lines: string[] = [];

  const brandVoice = context.orgSettings?.brandVoice ?? null;
  if (brandVoice) {
    lines.push(`Brand voice: ${brandVoice}`);
  }

  if (context.customerMemory) {
    lines.push(`Customer memory: ${JSON.stringify(context.customerMemory)}`);
  }

  if (context.recentMessages && context.recentMessages.length > 0) {
    const transcript = context.recentMessages
      .map((m) => `[${m.senderType}] ${m.contentText ?? ""}`)
      .join("\n");
    lines.push(`Recent conversation:\n${transcript}`);
  }

  return lines.length > 0 ? lines.join("\n\n") : "(no additional context)";
}

function renderChecks(checks: RubricCheck[]): string {
  return checks
    .map((c) => `- ${c.id}: ${c.description}`)
    .join("\n");
}

function parseJudgments(response: Anthropic.Message, expectedIds: Set<string>): JudgeResult[] {
  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === REPORT_TOOL.name,
  );
  if (!toolUse || typeof toolUse.input !== "object" || toolUse.input === null) {
    throw new Error("judge did not return report_judgments tool call");
  }
  const raw = (toolUse.input as { judgments?: unknown }).judgments;
  if (!Array.isArray(raw)) {
    throw new Error("judge tool input missing judgments array");
  }

  const seen = new Set<string>();
  const results: JudgeResult[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const checkId = typeof obj.checkId === "string" ? obj.checkId : null;
    const pass = typeof obj.pass === "boolean" ? obj.pass : null;
    const reasoning = typeof obj.reasoning === "string" ? obj.reasoning : "";
    if (checkId === null || pass === null) continue;
    if (!expectedIds.has(checkId)) continue;
    if (seen.has(checkId)) continue;
    seen.add(checkId);
    results.push({ checkId, pass, reasoning });
  }
  // Surface missing checks as failures so a silent omission can't masquerade as a pass.
  for (const id of expectedIds) {
    if (seen.has(id)) continue;
    results.push({ checkId: id, pass: false, reasoning: "judge did not return a verdict for this check" });
  }
  return results;
}

export interface JudgeReplyArgs {
  checks: RubricCheck[];
  replyText: string;
  context: JudgeContext;
}

export interface JudgeReplyResponse {
  results: JudgeResult[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  };
}

export async function judgeReply(args: JudgeReplyArgs): Promise<JudgeReplyResponse> {
  const { checks, replyText, context } = args;
  if (checks.length === 0) {
    return {
      results: [],
      usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
    };
  }

  const userMessage = [
    `Drafted reply:\n"""\n${replyText}\n"""`,
    `Context:\n${renderContext(context)}`,
    `Rubric checks:\n${renderChecks(checks)}`,
  ].join("\n\n");

  const response = await anthropic.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 1024,
    system: buildCachedSystemPrompt(JUDGE_SYSTEM_PROMPT),
    tools: [REPORT_TOOL],
    tool_choice: { type: "tool", name: REPORT_TOOL.name },
    messages: [{ role: "user", content: userMessage }],
  });

  const expectedIds = new Set(checks.map((c) => c.id));
  const results = parseJudgments(response, expectedIds);
  const usage = readModelUsage(response);

  return {
    results,
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadInputTokens: usage.cacheReadInputTokens,
      cacheCreationInputTokens: usage.cacheCreationInputTokens,
    },
  };
}
