import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, buildCachedSystemPrompt } from "@/lib/ai/anthropic";
import { AI_MODEL } from "@/lib/ai";
import logger from "@/lib/server/logger";
import type { OrgSettings, RawToolCall } from "@/types";
import { resolveAgentSettings } from "./settings";
import { TOOL_CATEGORIES, selectAgentTools } from "./tools";
import { buildSystemPrompt, buildComposerAskPrompt } from "./prompt";
import { selectToolNamesForInstruction, isOperatorChannel } from "./intent";
import { executeTool } from "./tools/executor";
import { ESCALATION_MARKER } from "./tools/thread";
import { buildMessageHistory } from "./message-history";
import { summarizeApprovedDashboardActions, tryRunOperatorOrderStatusFastPath } from "./order-status-fast-path";
import type { ActionEntry, AgentContext, AgentResult } from "./types";
import { createModelUsageMetrics, hashInstructionForLog, recordModelUsage } from "./usage";
import { enforceSpendCap, recordSpend } from "./spend";
import {
  recordAgentFailure,
  type AgentFailureAlertRoute,
} from "@/lib/server/agent-failure-alerts";
import type { OpsAlertCounterClient } from "@/lib/server/ops-alerts";

const DEFAULT_MAX_ITERATIONS = 10;
const READ_ONLY_MAX_ITERATIONS = 4;
const TOKEN_BUDGET = 20_000;

const READ_TOOL_NAMES = Object.entries(TOOL_CATEGORIES)
  .filter(([, category]) => category === "read")
  .map(([name]) => name);

export interface RunAgentOptions {
  readOnly?: boolean;
  failureRoute?: AgentFailureAlertRoute;
  failureCounterClient?: OpsAlertCounterClient;
}

function inputKeys(input: unknown): string[] {
  return input && typeof input === "object" ? Object.keys(input) : [];
}

function inputChars(input: unknown): number {
  return JSON.stringify(input ?? null).length;
}

function canExecuteBatchInParallel(toolNames: readonly string[]): boolean {
  return toolNames.every((name) => TOOL_CATEGORIES[name] === "read");
}

function shouldSkipAfterFailedReply(toolName: string, actionsPerformed: ActionEntry[]): boolean {
  if (toolName !== "update_thread_status") return false;
  return actionsPerformed.some((action) => (
    action.tool === "send_reply" && action.result.toLowerCase().startsWith("error:")
  ));
}

export async function runAgent(
  ctx: AgentContext,
  instruction: string,
  approvedToolCalls?: RawToolCall[],
  settings?: OrgSettings,
  options?: RunAgentOptions,
): Promise<AgentResult> {
  const startedAt = Date.now();
  const usageTotals = createModelUsageMetrics();
  const executedToolCalls: string[] = [];
  const instructionHash = hashInstructionForLog(instruction);
  const s = resolveAgentSettings(settings);
  const readOnly = options?.readOnly ?? false;
  const failureRoute = options?.failureRoute ?? "unknown";
  const failureCounterClient = options?.failureCounterClient;
  const maxIterations = readOnly
    ? READ_ONLY_MAX_ITERATIONS
    : (s.maxIterations > 0 ? s.maxIterations : DEFAULT_MAX_ITERATIONS);
  const actionsPerformed: ActionEntry[] = [];
  const operatorMode = isOperatorChannel(ctx.thread.channelType);
  const failureAlertPromises: Promise<unknown>[] = [];
  let escalationReason: string | null = null;

  const finish = async (result: AgentResult, outcome: string): Promise<AgentResult> => {
    if (failureAlertPromises.length > 0) {
      await Promise.allSettled(failureAlertPromises);
    }

    logger.info({
      orgId: ctx.orgId,
      threadId: ctx.thread.id,
      channelType: ctx.thread.channelType,
      outcome,
      readOnly,
      durationMs: Date.now() - startedAt,
      modelCalls: usageTotals.modelCalls,
      usageTotals,
      approvedToolCallCount: approvedToolCalls?.length ?? 0,
      executedToolCallCount: executedToolCalls.length,
      executedToolCalls,
      actionCount: result.actionsPerformed.length,
      summaryChars: result.summary.length,
      instructionHash,
    }, "[agent] run complete");
    return result;
  };

  const recordAgentFailureSafely = (
    kind: "tool_result" | "tool_exception",
    tool: string,
    detail: string,
  ) => {
    if (readOnly || !failureCounterClient) {
      return;
    }

    const alertPromise = recordAgentFailure({
      kind,
      route: failureRoute,
      orgId: ctx.orgId,
      tool,
      detail,
    }, {
      counterClient: failureCounterClient,
    }).catch((error) => {
      logger.error({
        err: error,
        orgId: ctx.orgId,
        threadId: ctx.thread.id,
        tool,
        route: failureRoute,
      }, "[agent] failure alert error");
    });
    failureAlertPromises.push(alertPromise);
  };

  const executeToolCall = async (toolCall: { id: string; name: string; input: unknown }) => {
    logger.info({
      orgId: ctx.orgId,
      threadId: ctx.thread.id,
      tool: toolCall.name,
      inputKeys: inputKeys(toolCall.input),
      inputChars: inputChars(toolCall.input),
    }, "[agent] tool call");

    let result: string;
    let threw = false;
    if (readOnly && TOOL_CATEGORIES[toolCall.name] !== "read") {
      result = `Error: ${toolCall.name} is not available in private ask mode.`;
    } else if (shouldSkipAfterFailedReply(toolCall.name, actionsPerformed)) {
      result = "Error: skipped status update because send_reply failed.";
    } else {
      try {
        result = await executeTool(toolCall.name, toolCall.input, ctx, settings);
      } catch (err) {
        threw = true;
        const errorMessage = err instanceof Error ? err.message : String(err);
        result = `Error: tool "${toolCall.name}" threw - ${err instanceof Error ? err.message : String(err)}`;
        logger.error({ err, tool: toolCall.name }, "[agent] tool error");
        recordAgentFailureSafely("tool_exception", toolCall.name, errorMessage);
      }
    }

    if (!threw && result.toLowerCase().startsWith("error:")) {
      recordAgentFailureSafely("tool_result", toolCall.name, result);
    }

    logger.info({
      orgId: ctx.orgId,
      threadId: ctx.thread.id,
      tool: toolCall.name,
      resultChars: result.length,
      isError: result.toLowerCase().startsWith("error:"),
    }, "[agent] tool result");
    executedToolCalls.push(toolCall.name);
    actionsPerformed.push({ tool: toolCall.name, result });
    if (result.startsWith(ESCALATION_MARKER)) {
      escalationReason = result.slice(ESCALATION_MARKER.length).trim() || "No reason provided";
    }
    return {
      type: "tool_result" as const,
      tool_use_id: toolCall.id,
      content: result,
    };
  };

  const executeToolCalls = async (toolCalls: { id: string; name: string; input: unknown }[]) => {
    if (canExecuteBatchInParallel(toolCalls.map((toolCall) => toolCall.name))) {
      return Promise.all(toolCalls.map(executeToolCall));
    }

    const results: Awaited<ReturnType<typeof executeToolCall>>[] = [];
    for (const toolCall of toolCalls) {
      results.push(await executeToolCall(toolCall));
    }
    return results;
  };

  if (!readOnly && !approvedToolCalls?.length) {
    const fastResult = await tryRunOperatorOrderStatusFastPath(ctx, instruction, settings, actionsPerformed);
    if (fastResult) {
      for (const action of fastResult.actionsPerformed) {
        if (action.result.toLowerCase().startsWith("error:")) {
          recordAgentFailureSafely("tool_result", action.tool, action.result);
        }
      }
      logger.info({ actionCount: fastResult.actionsPerformed.length }, "[agent] fast order-status result");
      executedToolCalls.push(...fastResult.actionsPerformed.map(action => action.tool));
      return finish(fastResult, "fast_order_status");
    }
  }

  if (!readOnly && approvedToolCalls && approvedToolCalls.length > 0) {
    const executableToolCalls = ctx.thread.channelType === "dashboard_agent"
      ? approvedToolCalls.filter((tc) => TOOL_CATEGORIES[tc.name] === "action")
      : approvedToolCalls;

    if (ctx.thread.channelType === "dashboard_agent" && executableToolCalls.length === 0) {
      return finish({
        summary: "No approved dashboard action was available to execute.",
        actionsPerformed,
      }, "approved_dashboard_actions_empty");
    }

    await executeToolCalls(executableToolCalls);

    if (escalationReason) {
      return finish({
        summary: `Escalated to merchant: ${escalationReason}`,
        actionsPerformed,
      }, "escalated");
    }

    return finish({
      summary: summarizeApprovedDashboardActions(actionsPerformed),
      actionsPerformed,
    }, ctx.thread.channelType === "dashboard_agent" ? "approved_dashboard_actions" : "approved_plan_actions");
  }

  const history = operatorMode || readOnly ? ctx.recentMessages.slice(-4) : ctx.recentMessages;
  const messageInstruction = readOnly
    ? `Private question from the support operator. Do not contact the customer.\n\n${instruction}`
    : instruction;
  const messages = buildMessageHistory(history, messageInstruction);
  const tools = readOnly
    ? selectAgentTools(settings, READ_TOOL_NAMES)
    : selectAgentTools(settings, selectToolNamesForInstruction(ctx, instruction));
  const systemPrompt = readOnly
    ? buildComposerAskPrompt(ctx, settings)
    : buildSystemPrompt(ctx, settings);
  const systemPromptBlocks = buildCachedSystemPrompt(systemPrompt);

  for (let i = 0; i < maxIterations; i += 1) {
    logger.info({ iteration: i, messageCount: messages.length, readOnly }, "[agent] iteration start");

    await enforceSpendCap(ctx.orgId, s);

    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: readOnly ? 2048 : 4096,
      system: systemPromptBlocks,
      messages,
      tools,
      ...(operatorMode && !readOnly && i === 0 && tools.length > 0 ? { tool_choice: { type: "any" } } : {}),
    });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const usage = recordModelUsage(usageTotals, response);
    await recordSpend(ctx.orgId, usage, AI_MODEL);
    logger.info({
      iteration: i,
      stopReason: response.stop_reason,
      tools: toolUseBlocks.map(b => b.name),
      usage,
      totalTokens: usageTotals.totalTokens,
    }, "[agent] iteration end");

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "max_tokens") {
      return finish({
        summary: readOnly
          ? "The answer was cut off because the request was too large. Try asking a more specific question."
          : "Agent response was cut off - the request may be too complex. Try breaking it into smaller steps.",
        actionsPerformed,
      }, "max_tokens");
    }

    if (!readOnly && usageTotals.totalTokens >= TOKEN_BUDGET) {
      return finish({ summary: "Agent stopped - this request required too many steps. Please try a more specific instruction.", actionsPerformed }, "token_budget");
    }

    if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      return finish({
        summary: readOnly
          ? (textBlock?.text?.trim() || "I do not have enough information to answer that.")
          : (textBlock?.text ?? "Done."),
        actionsPerformed,
      }, "end_turn");
    }

    const toolResults = await executeToolCalls(toolUseBlocks);
    messages.push({ role: "user", content: toolResults });

    if (escalationReason) {
      return finish({
        summary: `Escalated to merchant: ${escalationReason}`,
        actionsPerformed,
      }, "escalated");
    }
  }

  return finish({
    summary: readOnly
      ? "I could not finish answering that. Try asking a narrower question."
      : "Reached maximum steps without completing the task.",
    actionsPerformed,
  }, "max_iterations");
}
