import type Anthropic from "@anthropic-ai/sdk";
import { buildSplitCachedSystemPrompt } from "./ai/anthropic.js";
import type { AgentContext } from "./agent-context.js";
import { buildMessageHistory } from "./message-history.js";
import { isOperatorChannel } from "./intent.js";
import { draftPlannerTerminalTool } from "./planner-terminal.js";
import { buildPlanSteps } from "./planner-steps.js";
import { replyDraftPrompt, sendReplyHasText } from "./planner-safety/index.js";
import { buildSystemPromptParts } from "./prompt.js";
import { resolveAgentSettings } from "./settings.js";
import { selectAgentTools } from "./tools/registry/index.js";
import { enforceSpendCap } from "./spend.js";
import type { OrgSettings, RawToolCall } from "./types.js";
import { createModelUsageMetrics } from "./usage.js";
import logger from "./logger.js";

const TERMINAL_SEND_TOOLS = new Set(["send_reply", "send_email"]);

export function stripTerminalSendTools(toolCalls: RawToolCall[]): RawToolCall[] {
  return toolCalls.filter((toolCall) => !TERMINAL_SEND_TOOLS.has(toolCall.name));
}

export function findTerminalSendTool(toolCalls: RawToolCall[]): RawToolCall | undefined {
  return toolCalls.find((toolCall) => TERMINAL_SEND_TOOLS.has(toolCall.name));
}

function sendEmailHasContent(toolCall: RawToolCall): boolean {
  const input = toolCall.input;
  if (!input || typeof input !== "object") return false;
  const record = input as Record<string, unknown>;
  return typeof record.to === "string" && record.to.trim().length > 0
    && typeof record.subject === "string" && record.subject.trim().length > 0
    && typeof record.body === "string" && record.body.trim().length > 0;
}

function skippedPlanReplyDraftPrompt(
  settings: OrgSettings,
  remainingDescriptions: string[],
  terminalToolName: "send_reply" | "send_email",
): string {
  const actionLines = remainingDescriptions.map((description, index) => `${index + 1}. ${description}`).join("\n");
  const terminalInstruction = terminalToolName === "send_email"
    ? "Call send_email to notify the customer."
    : replyDraftPrompt(settings).replace(/^Now /, "");

  return [
    "The merchant skipped one or more proposed plan steps.",
    "Draft a customer reply that describes ONLY the actions below that will still be taken.",
    "Do NOT mention skipped steps, cancelled actions, or anything the merchant chose not to do.",
    "",
    "Remaining approved actions:",
    actionLines,
    "",
    terminalInstruction,
  ].join("\n");
}

function buildSkippedPlanDraftMessages(
  ctx: AgentContext,
  instruction: string,
  approvedWithoutTerminal: RawToolCall[],
): Anthropic.MessageParam[] {
  const operatorMode = isOperatorChannel(ctx.thread.channelType);
  const historyWindow = operatorMode ? ctx.recentMessages.slice(-4) : ctx.recentMessages;
  const baseMessages = buildMessageHistory(historyWindow, instruction, {
    segregateUntrusted: !operatorMode,
  });

  if (approvedWithoutTerminal.length === 0) return baseMessages;

  const assistantContent = approvedWithoutTerminal.map((toolCall) => ({
    type: "tool_use" as const,
    id: toolCall.id,
    name: toolCall.name,
    input: toolCall.input ?? {},
  })) as Anthropic.ToolUseBlock[];

  return [
    ...baseMessages,
    { role: "assistant", content: assistantContent },
  ];
}

// After `skip N`, the cached send_reply/send_email still describes the full plan.
// Re-draft the terminal send so customer copy matches the remaining approved actions.
export async function refreshTerminalSendAfterSkip(input: {
  ctx: AgentContext;
  instruction: string;
  approvedToolCalls: RawToolCall[];
  settings?: OrgSettings;
}): Promise<RawToolCall[]> {
  const terminalTool = findTerminalSendTool(input.approvedToolCalls);
  if (!terminalTool) return input.approvedToolCalls;

  const withoutTerminal = stripTerminalSendTools(input.approvedToolCalls);
  const remainingSteps = buildPlanSteps(withoutTerminal);
  if (remainingSteps.length === 0) return input.approvedToolCalls;

  const resolvedSettings = resolveAgentSettings(input.settings);
  await enforceSpendCap(input.ctx.orgId, resolvedSettings);

  const { stable, volatile } = buildSystemPromptParts(input.ctx, resolvedSettings);
  const systemPromptBlocks = buildSplitCachedSystemPrompt(stable, volatile);
  const tools = selectAgentTools(resolvedSettings);
  const terminalToolName = terminalTool.name as "send_reply" | "send_email";
  const sendTool = tools.find((tool) => tool.name === terminalToolName);
  if (!sendTool) return input.approvedToolCalls;

  const usageTotals = createModelUsageMetrics();
  const drafted = await draftPlannerTerminalTool({
    ctx: input.ctx,
    usageTotals,
    resolvedSettings,
    systemPromptBlocks,
    messages: buildSkippedPlanDraftMessages(input.ctx, input.instruction, withoutTerminal),
    tool: sendTool,
    toolName: terminalToolName,
    prompt: skippedPlanReplyDraftPrompt(
      resolvedSettings,
      remainingSteps.map((step) => step.description),
      terminalToolName,
    ),
    phase: "skip_reply_redraft",
    attempts: 2,
    validate: terminalToolName === "send_reply" ? sendReplyHasText : sendEmailHasContent,
  });

  if (drafted.length === 0) {
    logger.warn(
      {
        orgId: input.ctx.orgId,
        threadId: input.ctx.thread.id,
        terminalToolName,
      },
      "[agent:plan] skip reply redraft failed — executing without terminal send",
    );
    return withoutTerminal;
  }

  logger.info(
    {
      orgId: input.ctx.orgId,
      threadId: input.ctx.thread.id,
      terminalToolName,
      remainingStepCount: remainingSteps.length,
    },
    "[agent:plan] skip reply redrafted",
  );

  return [...withoutTerminal, ...drafted];
}
