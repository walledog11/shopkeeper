import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "./ai/anthropic.js";
import logger from "./logger.js";
import type { AgentContext } from "./agent-context.js";
import { recordSpend } from "./spend.js";
import { recordModelUsage, type createModelUsageMetrics } from "./usage.js";

/** Phase-1 Haiku calls emit tool calls only (reads, send_reply, escalate). */
export const PLAN_INITIAL_MAX_TOKENS = 1024;
/** Replan may include send_reply body text alongside mutative tools. */
export const PLAN_REPLAN_MAX_TOKENS = 2048;

export type PlannerUsageTotals = ReturnType<typeof createModelUsageMetrics>;

export async function runPlannerModelCall(input: {
  ctx: AgentContext;
  usageTotals: PlannerUsageTotals;
  model: string;
  maxTokens: number;
  systemPromptBlocks: Anthropic.Messages.MessageCreateParams["system"];
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  phase: string;
  attempt?: number;
  toolChoice?: Anthropic.Messages.MessageCreateParams["tool_choice"];
  selectLoggedToolBlocks?: (toolBlocks: Anthropic.ToolUseBlock[]) => Anthropic.ToolUseBlock[];
}): Promise<{
  response: Anthropic.Message;
  toolBlocks: Anthropic.ToolUseBlock[];
  usage: ReturnType<typeof recordModelUsage>;
}> {
  const {
    ctx,
    usageTotals,
    model,
    maxTokens,
    systemPromptBlocks,
    messages,
    tools,
    phase,
    attempt,
    toolChoice,
    selectLoggedToolBlocks,
  } = input;
  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPromptBlocks,
    messages,
    tools,
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
  });
  const toolBlocks = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  const loggedToolBlocks = selectLoggedToolBlocks ? selectLoggedToolBlocks(toolBlocks) : toolBlocks;
  const usage = recordModelUsage(usageTotals, response);
  await recordSpend(ctx.orgId, usage, model);
  logger.info({
    orgId: ctx.orgId,
    threadId: ctx.thread.id,
    purpose: "agent_plan",
    phase,
    ...(attempt === undefined ? {} : { attempt }),
    model,
    stopReason: response.stop_reason,
    tools: loggedToolBlocks.map((block) => block.name),
    usage,
    usageTotals,
  }, "[agent:plan] model call");
  return { response, toolBlocks, usage };
}
