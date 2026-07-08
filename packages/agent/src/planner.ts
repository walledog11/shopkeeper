import { buildSplitCachedSystemPrompt } from "./ai/anthropic.js";
import type { AgentContext } from "./agent-context.js";
import { isOperatorChannel, selectToolNamesForInstruction } from "./intent.js";
import logger from "./logger.js";
import { buildMessageHistory } from "./message-history.js";
import { tryPlanOrderStatusFastPath } from "./order-status-fast-path.js";
import { derivePlanPath } from "./plan-path.js";
import { buildPlanSteps } from "./planner-steps.js";
import { runInitialPlanningPhase } from "./planner-initial-phase.js";
import { applyEscalationRouting, logRoutingShadow, routePlan } from "./planner-routing.js";
import { finalizePlanTools } from "./planner-terminal.js";
import { selectInitialPlanningTools } from "./planner-tools.js";
import { buildSystemPromptParts } from "./prompt.js";
import { resolveAgentSettings } from "./settings.js";
import { enforceSpendCap } from "./spend.js";
import { selectAgentTools } from "./tools/registry/index.js";
import type { AgentPlan, OrgSettings } from "./types.js";
import { createModelUsageMetrics, hashInstructionForLog } from "./usage.js";

export { PLAN_INITIAL_MAX_TOKENS, PLAN_REPLAN_MAX_TOKENS } from "./planner-model.js";

export async function planAgent(
  ctx: AgentContext,
  instruction: string,
  settings?: OrgSettings,
): Promise<AgentPlan> {
  const startedAt = Date.now();
  const usageTotals = createModelUsageMetrics();
  const instructionHash = hashInstructionForLog(instruction);
  const operatorMode = isOperatorChannel(ctx.thread.channelType);
  const historyWindow = operatorMode ? ctx.recentMessages.slice(-4) : ctx.recentMessages;
  const baseMessages = buildMessageHistory(historyWindow, instruction, {
    segregateUntrusted: !operatorMode,
  });
  const { stable, volatile } = buildSystemPromptParts(ctx, settings);
  const systemPromptBlocks = buildSplitCachedSystemPrompt(stable, volatile);
  const tools = selectAgentTools(settings, selectToolNamesForInstruction(ctx, instruction));
  const initialTools = selectInitialPlanningTools(tools);
  const resolvedSettings = resolveAgentSettings(settings);

  await enforceSpendCap(ctx.orgId, resolvedSettings);

  const fastPathPlan = tryPlanOrderStatusFastPath(ctx, instruction, resolvedSettings);
  if (fastPathPlan) {
    const planPath = derivePlanPath({ fastPath: true, ranReplan: false });
    logger.info({
      orgId: ctx.orgId,
      threadId: ctx.thread.id,
      durationMs: Date.now() - startedAt,
      planPath,
      modelCalls: 0,
      rawToolCallCount: fastPathPlan.rawToolCalls.length,
      rawToolCalls: fastPathPlan.rawToolCalls.map(toolCall => toolCall.name),
      visibleStepCount: fastPathPlan.steps.length,
      visibleSteps: fastPathPlan.steps.map(step => step.tool),
      instructionHash,
      orderStatusFastPath: true,
    }, "[agent:plan] complete");
    return fastPathPlan;
  }

  logger.info({
    orgId: ctx.orgId,
    threadId: ctx.thread.id,
    channelType: ctx.thread.channelType,
    messageCount: baseMessages.length,
    toolCount: tools.length,
    initialToolCount: initialTools.length,
    tools: tools.map(tool => tool.name),
    initialTools: initialTools.map(tool => tool.name),
    instructionLength: instruction.length,
    instructionHash,
  }, "[agent:plan] start");

  const initial = await runInitialPlanningPhase({
    ctx,
    instruction,
    settings,
    resolvedSettings,
    operatorMode,
    baseMessages,
    systemPromptBlocks,
    tools,
    initialTools,
    usageTotals,
  });
  let rawToolCalls = initial.rawToolCalls;
  const { planMessages, ranReplan, ranReplanRetry } = initial;

  const finalized = await finalizePlanTools({
    ctx,
    instruction,
    resolvedSettings,
    operatorMode,
    tools,
    systemPromptBlocks,
    planMessages,
    usageTotals,
    rawToolCalls,
  });
  rawToolCalls = finalized.rawToolCalls;
  if (initial.contextSkippedReadIds.size > 0) {
    rawToolCalls = rawToolCalls.filter(
      toolCall => !initial.contextSkippedReadIds.has(toolCall.id),
    );
  }

  // Phase 3 routing: classify the finalized plan and act on the disposition —
  // materialize a deterministic escalation, record any warnings, and stamp the
  // decision the dashboard consumes. Support-path only (operator plans skip it).
  let routing: AgentPlan["routing"];
  if (!operatorMode) {
    const outcome = routePlan({
      ctx,
      instruction,
      rawToolCalls,
      readBlocks: initial.processedReadBlocks,
      readStatusMap: initial.planningReadStatusMap,
      readResultsMap: initial.readResultsMap,
    });
    if (outcome.decision === "escalate") {
      rawToolCalls = applyEscalationRouting(
        rawToolCalls,
        outcome.escalationReason ?? "Needs human review.",
      );
    }
    for (const warning of outcome.warnings) {
      if (!initial.warnings.includes(warning)) initial.warnings.push(warning);
    }
    routing = {
      decision: outcome.decision,
      signals: outcome.signals,
      question: outcome.question ?? null,
    };
  }

  const steps = buildPlanSteps(rawToolCalls);
  const planPath = derivePlanPath({ ranReplan });
  logger.info({
    orgId: ctx.orgId,
    threadId: ctx.thread.id,
    durationMs: Date.now() - startedAt,
    planPath,
    replanRetried: ranReplanRetry,
    askOperatorElected: finalized.hasAskOperator,
    replyDrafted: finalized.ranReplyDraft,
    routingDecision: routing?.decision ?? null,
    routingSignals: routing?.signals ?? null,
    modelCalls: usageTotals.modelCalls,
    usageTotals,
    readToolCalls: initial.readToolCalls,
    rawToolCallCount: rawToolCalls.length,
    rawToolCalls: rawToolCalls.map(toolCall => toolCall.name),
    visibleStepCount: steps.length,
    visibleSteps: steps.map(step => step.tool),
    warningCount: initial.warnings.length,
    instructionHash,
  }, "[agent:plan] complete");

  // Phase 2 shadow: compare the classifier routing to the live regex guards on
  // the finalized plan. Observability only — must never break planning.
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

  const readResults = initial.readResultsMap.size > 0
    ? Object.fromEntries(initial.readResultsMap)
    : undefined;
  return {
    instruction,
    steps,
    rawToolCalls,
    readResults,
    warnings: initial.warnings.length > 0 ? initial.warnings : undefined,
    routing,
  };
}
