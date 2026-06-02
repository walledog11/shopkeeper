import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, buildCachedSystemPrompt } from "@/lib/ai/anthropic";
import { pickModel } from "@/lib/ai";
import logger from "@/lib/server/logger";
import type { OrgSettings, RawToolCall } from "@/types";
import { resolveAgentSettings } from "./settings";
import { TOOL_CATEGORIES, selectAgentTools } from "./tools/registry";
import { buildSystemPrompt, buildComposerAskPrompt } from "./prompt";
import { selectToolNamesForInstruction, isOperatorChannel } from "./intent";
import { executeToolWithStatus } from "./tools/executor";
import { ESCALATION_MARKER } from "./tools/thread";
import { buildMessageHistory } from "./message-history";
import { summarizeApprovedDashboardActions, tryRunOperatorOrderStatusFastPath } from "./order-status-fast-path";
import type { ActionEntry, AgentActionMode, AgentActionStatus, AgentContext, AgentResult } from "./types";
import { createModelUsageMetrics, hashInstructionForLog, recordModelUsage } from "./usage";
import { enforceSpendCap, recordSpend } from "./spend";
import {
  recordAgentFailure,
  type AgentFailureAlertRoute,
} from "@/lib/server/agent-failure-alerts";
import type { OpsAlertCounterClient } from "@/lib/server/ops-alerts";
import { recordAgentActionsBatch, type AgentActionApproval } from "./api/agent-actions";

const DEFAULT_MAX_ITERATIONS = 10;
const READ_ONLY_MAX_ITERATIONS = 4;
const TOKEN_BUDGET = 20_000;

const READ_TOOL_NAMES = Object.entries(TOOL_CATEGORIES).flatMap(([name, category]) => (
  category === "read" ? [name] : []
));

export interface RunAgentOptions {
  readOnly?: boolean;
  failureRoute?: AgentFailureAlertRoute;
  failureCounterClient?: OpsAlertCounterClient;
  mode?: AgentActionMode;
  approval?: AgentActionApproval;
  // Pre-generated turn id so the caller can embed it in the agent-turn note
  // and join AgentAction rows back to the note when rendering inline.
  turnId?: string;
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
    action.tool === "send_reply" && action.status === "error"
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
  const effectiveMode: AgentActionMode = options?.mode ?? (readOnly ? "read_only" : "human_approved");
  const approval = effectiveMode === "human_approved" ? options?.approval : undefined;
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

    if (result.actionsPerformed.length > 0) {
      try {
        await recordAgentActionsBatch({
          orgId: ctx.orgId,
          threadId: ctx.thread.id,
          customerId: ctx.customer.id,
          mode: effectiveMode,
          actions: result.actionsPerformed,
          instruction,
          summary: result.summary,
          ...(options?.turnId ? { turnId: options.turnId } : {}),
          ...(approval ? { approval } : {}),
        });
      } catch (err) {
        logger.error({
          err,
          orgId: ctx.orgId,
          threadId: ctx.thread.id,
          actionCount: result.actionsPerformed.length,
        }, "[agent] failed to persist agent action audit rows");
      }
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

    const startedAt = Date.now();
    let result: string;
    let status: AgentActionStatus;
    let errorDetail: string | undefined;
    let threw = false;

    if (readOnly && TOOL_CATEGORIES[toolCall.name] !== "read") {
      result = `Error: ${toolCall.name} is not available in private ask mode.`;
      status = "error";
      errorDetail = result;
    } else if (shouldSkipAfterFailedReply(toolCall.name, actionsPerformed)) {
      result = "Error: skipped status update because send_reply failed.";
      status = "error";
      errorDetail = result;
    } else {
      try {
        const executed = await executeToolWithStatus(toolCall.name, toolCall.input, ctx, settings);
        result = executed.result;
        status = executed.status;
        if (status !== "success") errorDetail = result;
      } catch (err) {
        threw = true;
        const errorMessage = err instanceof Error ? err.message : String(err);
        result = `Error: tool "${toolCall.name}" threw - ${errorMessage}`;
        status = "error";
        errorDetail = errorMessage;
        logger.error({ err, tool: toolCall.name }, "[agent] tool error");
        recordAgentFailureSafely("tool_exception", toolCall.name, errorMessage);
      }
    }

    if (!threw && status === "error") {
      recordAgentFailureSafely("tool_result", toolCall.name, result);
    }

    if (result.startsWith(ESCALATION_MARKER)) {
      escalationReason = result.slice(ESCALATION_MARKER.length).trim() || "No reason provided";
      status = "escalated";
      errorDetail = undefined;
    }

    const durationMs = Date.now() - startedAt;

    logger.info({
      orgId: ctx.orgId,
      threadId: ctx.thread.id,
      tool: toolCall.name,
      resultChars: result.length,
      isError: status === "error" || status === "policy_block",
      status,
      durationMs,
    }, "[agent] tool result");
    executedToolCalls.push(toolCall.name);
    actionsPerformed.push({
      tool: toolCall.name,
      result,
      input: toolCall.input,
      durationMs,
      status,
      category: TOOL_CATEGORIES[toolCall.name],
      ...(errorDetail ? { errorDetail } : {}),
    });
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

    const executeSequentially = async (
      index: number,
      results: Awaited<ReturnType<typeof executeToolCall>>[],
    ): Promise<Awaited<ReturnType<typeof executeToolCall>>[]> => {
      if (index >= toolCalls.length) return results;
      results.push(await executeToolCall(toolCalls[index]));
      return executeSequentially(index + 1, results);
    };

    return executeSequentially(0, []);
  };

  if (!readOnly && !approvedToolCalls?.length) {
    const fastResult = await tryRunOperatorOrderStatusFastPath(ctx, instruction, settings, actionsPerformed);
    if (fastResult) {
      for (const action of fastResult.actionsPerformed) {
        if (action.status === "error") {
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

    const toolResults = await executeToolCalls(executableToolCalls);
    const hasEscalation = toolResults.some((result) => result.content.startsWith(ESCALATION_MARKER));

    if (hasEscalation && escalationReason) {
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
  const messages = buildMessageHistory(history, messageInstruction, { segregateUntrusted: !operatorMode });
  const tools = readOnly
    ? selectAgentTools(settings, READ_TOOL_NAMES)
    : selectAgentTools(settings, selectToolNamesForInstruction(ctx, instruction));
  const systemPrompt = readOnly
    ? buildComposerAskPrompt(ctx, settings)
    : buildSystemPrompt(ctx, settings);
  const systemPromptBlocks = buildCachedSystemPrompt(systemPrompt);
  // The read-only composer-ask loop stays on Haiku; the mutative agent loop
  // (operator + end-to-end runs) is a judgment/mutative path, so it runs on Sonnet.
  const iterationModel = pickModel(readOnly ? "composer_ask" : "agent_run");

  const runModelIteration = async (i: number): Promise<AgentResult> => {
    if (i >= maxIterations) {
      return finish({
        summary: readOnly
          ? "I could not finish answering that. Try asking a narrower question."
          : "Reached maximum steps without completing the task.",
        actionsPerformed,
      }, "max_iterations");
    }

    logger.info({ iteration: i, messageCount: messages.length, readOnly }, "[agent] iteration start");

    await enforceSpendCap(ctx.orgId, s);

    const response = await anthropic.messages.create({
      model: iterationModel,
      max_tokens: readOnly ? 2048 : 4096,
      system: systemPromptBlocks,
      messages,
      tools,
    });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const usage = recordModelUsage(usageTotals, response);
    await recordSpend(ctx.orgId, usage, iterationModel);
    logger.info({
      iteration: i,
      model: iterationModel,
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
      let textBlock: Anthropic.TextBlock | undefined;
      for (const block of response.content) {
        if (block.type === "text") {
          textBlock = block;
          break;
        }
      }
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

    return runModelIteration(i + 1);
  };

  return runModelIteration(0);
}
