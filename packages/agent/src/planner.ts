import { buildSplitCachedSystemPrompt } from "./ai/anthropic.js";
import { pickModel } from "./ai/index.js";
import type { AgentContext } from "./agent-context.js";
import { runAgentLoop } from "./agent-loop.js";
import { isGuestOnlyTool, isStorefrontContext, storefrontToolNames } from "./guest-policy.js";
import { isOperatorChannel } from "./intent.js";
import { isMerchantAnswerPlanningInstruction } from "./kb-learned.js";
import logger from "./logger.js";
import { buildMessageHistory } from "./message-history.js";
import { decidePlannerTier, isLowRiskPlanOutcome } from "./planner-model-tier.js";
import {
  appendInitialPlanningSignals,
  appendPlanningReadSignals,
} from "./planner-read-tools.js";
import { applyEscalationRouting } from "./escalation-materialization.js";
import { buildPlanRoutingEvidence } from "./planner-evidence.js";
import { decideAutonomy } from "./autonomy.js";
import { validatePlan } from "./plan-validation.js";
import { buildPlanSignals } from "./plan-signals.js";
import { buildPlanSteps } from "./planner-steps.js";
import { buildSystemPromptParts } from "./prompt.js";
import { DEFAULT_MAX_ITERATIONS } from "./run-policy.js";
import { resolveAgentSettings } from "./settings.js";
import { enforceSpendCap } from "./spend.js";
import { selectAgentTools } from "./tools/registry/index.js";
import type { AgentPlan, OrgSettings, PlanRoutingEvidence, ProducedPlanSignalCode } from "./types.js";
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
  // A storefront shopper plans against their allowlist — the guest set, or the
  // verified set once they proved control of the email on an order. Narrowing
  // here rather than at execution means the model never drafts a plan step it
  // would be refused for, so the shopper is never promised a lookup that cannot
  // happen.
  const storefrontTools = storefrontToolNames(ctx);
  let tools = storefrontTools
    ? selectAgentTools(settings, storefrontTools)
    : selectAgentTools(settings).filter((tool) => !isGuestOnlyTool(tool.name));
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

  const maxIterations = resolvedSettings.maxIterations > 0
    ? resolvedSettings.maxIterations
    : DEFAULT_MAX_ITERATIONS;
  // A fresh copy per attempt: runAgentLoop appends assistant and tool-result
  // turns to this array in place, so handing the same one to a re-plan would
  // replay the discarded attempt's half-finished turns into the next model and
  // the API rejects the sequence ("tool_use ids without tool_result blocks").
  const runLoop = (model: string) => runAgentLoop({
    ctx,
    mode: "capture",
    messages: [...baseMessages],
    systemPromptBlocks,
    tools,
    model,
    maxIterations,
    maxTokensPerCall: 4096,
    settings,
    usageTotals,
    captureReprompt: !operatorMode,
  });

  const tier = decidePlannerTier(ctx, { operatorMode });
  let loop = await runLoop(tier.useLowTier ? pickModel("agent_plan_low_risk") : pickModel("agent_run"));

  // The cheap tier is trusted to reply, ask, or escalate — nothing else. If it
  // proposed real work, throw the plan away and re-plan on the judgment tier
  // rather than let a mutative action be decided down-tier. Capture mode means
  // nothing was executed, so the discarded plan has no side effects; the cost of
  // being wrong is one wasted Haiku call.
  let tierDowngraded = tier.useLowTier;
  if (tier.useLowTier && !isLowRiskPlanOutcome(loop.rawToolCalls)) {
    logger.info({
      orgId: ctx.orgId,
      threadId: ctx.thread.id,
      purpose: "agent_plan",
      proposedToolCalls: loop.rawToolCalls.map(toolCall => toolCall.name),
      instructionHash,
    }, "[agent:plan] low-tier plan proposed non-trivial work — re-planning on judgment tier");
    tierDowngraded = false;
    loop = await runLoop(pickModel("agent_run"));
  }

  // Validate the model's captured proposal exactly as authored. An invalid plan
  // stays intact so the merchant can see what failed and routing cannot hide the
  // error by rewriting it into a different, executable plan.
  const validation = validatePlan({ ctx, instruction, rawToolCalls: loop.rawToolCalls });
  let rawToolCalls = [...loop.rawToolCalls];

  const signalCodes: ProducedPlanSignalCode[] = [];
  appendInitialPlanningSignals({ ctx, operatorMode, codes: signalCodes });
  appendPlanningReadSignals({
    codes: signalCodes,
    readBlocks: loop.readBlocks,
    readResultsMap: loop.readResults,
    readStatusMap: loop.readStatus,
    recentOrders: ctx.recentOrders,
  });

  // Persist facts, not a derived disposition. The pure autonomy decision is
  // recomputed wherever the plan is surfaced or executed.
  let routingEvidence: PlanRoutingEvidence = {
    classifierState: "not_applicable",
    codes: [],
  };
  let routingDecision: ReturnType<typeof decideAutonomy>["kind"] | null = null;
  if (!operatorMode && validation.status === "valid") {
    const built = buildPlanRoutingEvidence({
      ctx,
      instruction,
      rawToolCalls,
      readBlocks: loop.readBlocks,
      readStatusMap: loop.readStatus,
      readResultsMap: loop.readResults,
      settings: resolvedSettings,
    });
    routingEvidence = built.evidence;
    signalCodes.push(...built.signalCodes);
    const originalSteps = buildPlanSteps(rawToolCalls);
    const originalSignals = buildPlanSignals(signalCodes, rawToolCalls);
    const verdict = decideAutonomy({
      instruction,
      steps: originalSteps,
      rawToolCalls,
      signals: originalSignals,
      validation,
      routingEvidence,
    }, resolvedSettings);
    routingDecision = verdict.kind;
    if (verdict.kind === "escalate" && routingEvidence.escalationReason) {
      rawToolCalls = applyEscalationRouting(
        rawToolCalls,
        verdict.escalationReason ?? "Needs human review.",
        { keepReply: isStorefrontContext(ctx) },
      );
    }
  }

  const steps = buildPlanSteps(rawToolCalls);
  // Severity is resolved here, against the finished tool calls: a plan the router
  // rewrote is the plan the merchant sees, and the one signals must describe.
  signalCodes.push(...validation.issues.map((issue) => issue.code));
  const signals = buildPlanSignals(signalCodes, rawToolCalls);
  const validationIssueCounts = validation.issues.reduce<Record<string, number>>((counts, issue) => {
    counts[issue.code] = (counts[issue.code] ?? 0) + 1;
    return counts;
  }, {});
  logger.info({
    orgId: ctx.orgId,
    threadId: ctx.thread.id,
    purpose: "agent_plan",
    durationMs: Date.now() - startedAt,
    iterations: loop.iterations,
    reprompted: loop.reprompted,
    loopStop: loop.stop,
    routingDecision,
    routingEvidenceCodes: routingEvidence.codes,
    classifierState: routingEvidence.classifierState,
    modelCalls: usageTotals.modelCalls,
    usageTotals,
    // Rollout observability: group by plannerTierReason to see which intents are
    // being downgraded, and watch plannerTierDowngraded against reply quality.
    plannerTierReason: tier.reason,
    plannerTierDowngraded: tierDowngraded,
    readToolCalls: loop.readBlocks.map(block => block.name),
    rawToolCallCount: rawToolCalls.length,
    rawToolCalls: rawToolCalls.map(toolCall => toolCall.name),
    visibleStepCount: steps.length,
    visibleSteps: steps.map(step => step.tool),
    signalCount: signals.length,
    signalCodes: signals.map(signal => signal.code),
    validationStatus: validation.status,
    validationIssueCodes: validation.issues.map(issue => issue.code),
    validationIssueCounts,
    instructionHash,
  }, "[agent:plan] complete");

  const readResults = loop.readResults.size > 0
    ? Object.fromEntries(loop.readResults)
    : undefined;
  return {
    instruction,
    steps,
    rawToolCalls,
    readResults,
    signals: signals.length > 0 ? signals : undefined,
    validation,
    // Phase 1: derived from `signals` so plans cached by an earlier release stay
    // readable. Drops out with the last consumer of `AgentPlan.warnings`.
    warnings: signals.length > 0 ? signals.map(signal => signal.message) : undefined,
    routingEvidence,
  };
}
