import { buildSplitCachedSystemPrompt } from "./ai/anthropic.js";
import { pickModel } from "./ai/index.js";
import type { AgentContext } from "./agent-context.js";
import { runAgentLoop } from "./agent-loop.js";
import { isOperatorChannel } from "./intent.js";
import { isMerchantAnswerPlanningInstruction } from "./kb-learned.js";
import logger from "./logger.js";
import { buildMessageHistory } from "./message-history.js";
import {
  appendInitialPlanningWarnings,
  appendPlanningReadWarnings,
} from "./planner-read-tools.js";
import { applyEscalationRouting, logRoutingShadow, routePlan } from "./planner-routing.js";
import {
  stripCreateRefundForAlreadyRefundedOrders,
  stripEmptySendReplyToolCalls,
} from "./planner-safety/index.js";
import { buildPlanSteps } from "./planner-steps.js";
import { buildSystemPromptParts } from "./prompt.js";
import { DEFAULT_MAX_ITERATIONS } from "./run-policy.js";
import { resolveAgentSettings } from "./settings.js";
import { enforceSpendCap } from "./spend.js";
import { selectAgentTools } from "./tools/registry/index.js";
import type { AgentPlan, OrgSettings } from "./types.js";
import { createModelUsageMetrics, hashInstructionForLog } from "./usage.js";
import {
  CONTEXT_BUDGETS,
  resolveContextBudgetMode,
  truncateContextText,
} from "./context-budget.js";

// Planning is a capture-mode run: one loop on the judgment tier, reads execute
// for real, mutative + terminal tools are recorded instead of executed, and the
// loop ends when the model proposes a terminal tool. No side effects. Phase 3
// routing classifies the finalized plan afterwards without editing its tool calls.
export async function planAgent(
  ctx: AgentContext,
  instruction: string,
  settings?: OrgSettings,
): Promise<AgentPlan> {
  const startedAt = Date.now();
  const usageTotals = createModelUsageMetrics();
  const instructionHash = hashInstructionForLog(instruction);
  const contextBudgetMode = resolveContextBudgetMode();
  const modelInstruction = contextBudgetMode === "enforce"
    ? truncateContextText(instruction, CONTEXT_BUDGETS.instructionChars)
    : instruction;
  const operatorMode = isOperatorChannel(ctx.thread.channelType);
  const historyWindow = operatorMode ? ctx.recentMessages.slice(-4) : ctx.recentMessages;
  const baseMessages = buildMessageHistory(historyWindow, modelInstruction, {
    segregateUntrusted: !operatorMode,
  });
  const { stable, volatile } = buildSystemPromptParts(ctx, settings);
  const systemPromptBlocks = buildSplitCachedSystemPrompt(stable, volatile);
  const resolvedSettings = resolveAgentSettings(settings);

  // A merchant-answer replan must reply to the customer with the supplied answer,
  // never re-park the ticket — so drop ask_operator from its tool set.
  const merchantAnswerReplan = isMerchantAnswerPlanningInstruction(instruction);
  let tools = selectAgentTools(settings);
  if (merchantAnswerReplan) {
    tools = tools.filter(tool => tool.name !== "ask_operator");
  }

  await enforceSpendCap(ctx.orgId, resolvedSettings);

  logger.info({
    orgId: ctx.orgId,
    threadId: ctx.thread.id,
    purpose: "agent_plan",
    channelType: ctx.thread.channelType,
    messageCount: baseMessages.length,
    toolCount: tools.length,
    tools: tools.map(tool => tool.name),
    instructionLength: instruction.length,
    modelInstructionLength: modelInstruction.length,
    contextBudgetMode,
    instructionHash,
  }, "[agent:plan] start");

  const loop = await runAgentLoop({
    ctx,
    mode: "capture",
    messages: baseMessages,
    systemPromptBlocks,
    tools,
    model: pickModel("agent_run"),
    maxIterations: resolvedSettings.maxIterations > 0 ? resolvedSettings.maxIterations : DEFAULT_MAX_ITERATIONS,
    maxTokensPerCall: 4096,
    settings,
    usageTotals,
    captureReprompt: !operatorMode,
  });

  // Structural cleanup that survives Phase 3 (order-state checks, not prose):
  // drop refunds for already-refunded orders and empty send_reply calls.
  let rawToolCalls = stripCreateRefundForAlreadyRefundedOrders(ctx, instruction, loop.rawToolCalls);
  rawToolCalls = stripEmptySendReplyToolCalls(rawToolCalls);

  const warnings: string[] = [];
  appendInitialPlanningWarnings({ ctx, operatorMode, warnings });
  appendPlanningReadWarnings({
    warnings,
    readBlocks: loop.readBlocks,
    readResultsMap: loop.readResults,
    readStatusMap: loop.readStatus,
    recentOrders: ctx.recentOrders,
  });

  // Phase 3 routing: classify the plan and act on the disposition — materialize a
  // deterministic escalation, record warnings, stamp the decision the dashboard
  // consumes. Support-path only (operator plans skip it).
  let routing: AgentPlan["routing"];
  if (!operatorMode) {
    const outcome = routePlan({
      ctx,
      instruction,
      rawToolCalls,
      readBlocks: loop.readBlocks,
      readStatusMap: loop.readStatus,
      readResultsMap: loop.readResults,
    });
    if (outcome.decision === "escalate") {
      rawToolCalls = applyEscalationRouting(rawToolCalls, outcome.escalationReason ?? "Needs human review.");
    }
    for (const warning of outcome.warnings) {
      if (!warnings.includes(warning)) warnings.push(warning);
    }
    routing = {
      decision: outcome.decision,
      signals: outcome.signals,
      question: outcome.question ?? null,
    };
  }

  const steps = buildPlanSteps(rawToolCalls);
  logger.info({
    orgId: ctx.orgId,
    threadId: ctx.thread.id,
    purpose: "agent_plan",
    durationMs: Date.now() - startedAt,
    iterations: loop.iterations,
    reprompted: loop.reprompted,
    loopStop: loop.stop,
    routingDecision: routing?.decision ?? null,
    routingSignals: routing?.signals ?? null,
    modelCalls: usageTotals.modelCalls,
    usageTotals,
    readToolCalls: loop.readBlocks.map(block => block.name),
    rawToolCallCount: rawToolCalls.length,
    rawToolCalls: rawToolCalls.map(toolCall => toolCall.name),
    visibleStepCount: steps.length,
    visibleSteps: steps.map(step => step.tool),
    warningCount: warnings.length,
    instructionHash,
  }, "[agent:plan] complete");

  // Phase 2 shadow: compare classifier routing to the live regex guards on the
  // finalized plan. Observability only — must never break planning.
  if (!operatorMode) {
    try {
      logRoutingShadow({ ctx, instruction, rawToolCalls, instructionHash });
    } catch (error) {
      logger.warn({
        orgId: ctx.orgId,
        threadId: ctx.thread.id,
        err: error,
      }, "[agent:plan:shadow] failed");
    }
  }

  const readResults = loop.readResults.size > 0
    ? Object.fromEntries(loop.readResults)
    : undefined;
  return {
    instruction,
    steps,
    rawToolCalls,
    readResults,
    warnings: warnings.length > 0 ? warnings : undefined,
    routing,
  };
}
