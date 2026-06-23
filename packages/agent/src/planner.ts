import type Anthropic from "@anthropic-ai/sdk";
import { buildSplitCachedSystemPrompt } from "./ai/anthropic.js";
import { pickModel } from "./ai/index.js";
import logger from "./logger.js";
import type { AgentPlan, OrgSettings, RawToolCall } from "./types.js";
import { TOOL_CATEGORIES, selectAgentTools } from "./tools/registry/index.js";
import { buildSystemPromptParts } from "./prompt.js";
import { selectToolNamesForInstruction, isOperatorChannel } from "./intent.js";
import { buildMessageHistory } from "./message-history.js";
import type { AgentContext } from "./agent-context.js";
import { createModelUsageMetrics, hashInstructionForLog } from "./usage.js";
import { enforceSpendCap } from "./spend.js";
import { resolveAgentSettings } from "./settings.js";
import { buildPlanSteps } from "./planner-steps.js";
import {
  appendInitialPlanningWarnings,
  appendPlanningReadWarnings,
  executePlanningReadTools,
  partitionPlanningReadBlocks,
} from "./planner-read-tools.js";
import { synthesizeMutativeReplanContext } from "./planner-read-skip.js";
import { derivePlanPath } from "./plan-path.js";
import { selectInitialPlanningTools, REPLAN_INCLUDE_REPLY_PROMPT, POLICY_GAP_REPLAN_PROMPT, selectPolicyGapReplanTools } from "./planner-tools.js";
import { tryPlanOrderStatusFastPath } from "./order-status-fast-path.js";
import {
  PLAN_INITIAL_MAX_TOKENS,
  PLAN_REPLAN_MAX_TOKENS,
  runPlannerModelCall,
} from "./planner-model.js";
import {
  appendPendingToolResults,
  pendingToolResultsForLastAssistantMessage,
  runMutativeReplan,
} from "./planner-replan.js";
import {
  applyMutativeIntentNoActionGuard,
  applyBrandVoiceOrderStatusGuard,
  shouldPreferBrandVoiceOrderStatusReply,
  applyPolicyGapAskOperatorGuard,
  ESCALATION_DRAFT_PROMPT,
  replyDraftPrompt,
  sendReplyHasText,
  shouldForceMutativeReplan,
  shouldForcePlanningEscalation,
  shouldSkipReplyDraftForMutativeIntent,
  shouldSkipReplyDraftForWatchTier,
  shouldUsePolicyGapReplanPrompt,
  stripCreateRefundForAlreadyRefundedOrders,
  stripEmptySendReplyToolCalls,
  stripNonEscalationTerminalTools,
} from "./planner-safety.js";
import type { ToolStatus } from "./tools/result.js";

export { PLAN_INITIAL_MAX_TOKENS, PLAN_REPLAN_MAX_TOKENS } from "./planner-model.js";

export async function planAgent(
  ctx: AgentContext,
  instruction: string,
  settings?: OrgSettings
): Promise<AgentPlan> {
  const startedAt = Date.now();
  const usageTotals = createModelUsageMetrics();
  const readToolCalls: string[] = [];
  const instructionHash = hashInstructionForLog(instruction);
  const operatorMode = isOperatorChannel(ctx.thread.channelType);
  const historyWindow = operatorMode ? ctx.recentMessages.slice(-4) : ctx.recentMessages;
  const baseMessages = buildMessageHistory(historyWindow, instruction, { segregateUntrusted: !operatorMode });
  const { stable, volatile } = buildSystemPromptParts(ctx, settings);
  const systemPromptBlocks = buildSplitCachedSystemPrompt(stable, volatile);
  const tools = selectAgentTools(settings, selectToolNamesForInstruction(ctx, instruction));
  const initialTools = selectInitialPlanningTools(tools);
  const resolvedSettings = resolveAgentSettings(settings);
  let processedReadBlocks: Anthropic.ToolUseBlock[] = [];
  const planningReadStatusMap = new Map<string, ToolStatus>();

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
      rawToolCalls: fastPathPlan.rawToolCalls.map((toolCall) => toolCall.name),
      visibleStepCount: fastPathPlan.steps.length,
      visibleSteps: fastPathPlan.steps.map((step) => step.tool),
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
    tools: tools.map(t => t.name),
    initialTools: initialTools.map(t => t.name),
    instructionLength: instruction.length,
    instructionHash,
  }, "[agent:plan] start");

  const initialModel = pickModel("plan_initial");
  const { response: response1, toolBlocks: blocks1 } = await runPlannerModelCall({
    ctx,
    usageTotals,
    model: initialModel,
    maxTokens: PLAN_INITIAL_MAX_TOKENS,
    systemPromptBlocks,
    messages: baseMessages,
    tools: initialTools,
    phase: "initial",
  });
  let rawToolCalls: RawToolCall[] = blocks1.map((b) => ({ id: b.id, name: b.name, input: b.input }));

  let planMessages: Anthropic.MessageParam[] = [
    ...baseMessages,
    { role: "assistant", content: response1.content },
  ];

  const readBlocks = blocks1.filter(b => TOOL_CATEGORIES[b.name] === "read");
  const warnings: string[] = [];
  const readResultsMap = new Map<string, string>();
  let ranReplan = false;
  let ranReplanRetry = false;
  let contextSkippedReadIds = new Set<string>();
  let usePolicyGapReplan = false;
  appendInitialPlanningWarnings({ ctx, operatorMode, warnings });

  if (readBlocks.length > 0) {
    let activeReadBlocks = readBlocks;
    let activeRawToolCalls = rawToolCalls;
    let activePlanMessages = planMessages;
    let allReadsSkippedRetried = false;

    let readPartition = partitionPlanningReadBlocks({
      readBlocks: activeReadBlocks,
      ctx,
      instruction,
    });

    if (readPartition.executable.length === 0 && readPartition.skipped.length > 0) {
      allReadsSkippedRetried = true;
      logger.info({
        orgId: ctx.orgId,
        threadId: ctx.thread.id,
        skippedReads: readPartition.skipped.map((block) => block.name),
      }, "[agent:plan] all reads context-redundant — retrying initial call with full tool set");

      await enforceSpendCap(ctx.orgId, resolvedSettings);
      // Reads were context-redundant — re-ask with the mutative tools so the model
      // can pick the action it skipped the read for. Still no send_reply (the
      // terminal reply-draft owns that), so it can't bail to a bare reply here.
      const { response: retryResponse, toolBlocks: retryBlocks } = await runPlannerModelCall({
        ctx,
        usageTotals,
        model: initialModel,
        maxTokens: PLAN_INITIAL_MAX_TOKENS,
        systemPromptBlocks,
        messages: baseMessages,
        tools: tools.filter((tool) => tool.name !== "send_reply"),
        phase: "initial_full_tools_retry",
      });

      activeReadBlocks = retryBlocks.filter((block) => TOOL_CATEGORIES[block.name] === "read");
      activeRawToolCalls = retryBlocks.map((block) => ({ id: block.id, name: block.name, input: block.input }));
      activePlanMessages = [
        ...baseMessages,
        { role: "assistant", content: retryResponse.content },
      ];
      readPartition = partitionPlanningReadBlocks({
        readBlocks: activeReadBlocks,
        ctx,
        instruction,
      });
    }

    contextSkippedReadIds = new Set(readPartition.skipped.map((block) => block.id));
    const shouldReplan = activeReadBlocks.length > 0 && (
      readPartition.executable.length > 0
      || (readPartition.skipped.length > 0 && allReadsSkippedRetried)
    );

    if (shouldReplan) {
      processedReadBlocks = [...readPartition.executable, ...readPartition.skipped];
      const readResults = await executePlanningReadTools({
        ctx,
        settings,
        readBlocks: readPartition.executable,
        skippedBlocks: readPartition.skipped,
      });
      readToolCalls.push(...readResults.readToolCalls);
      for (const [id, content] of readResults.readResultsMap) readResultsMap.set(id, content);
      for (const [id, status] of readResults.readStatusMap) planningReadStatusMap.set(id, status);
      appendPlanningReadWarnings({
        warnings,
        readBlocks: processedReadBlocks,
        readResultsMap,
        readStatusMap: readResults.readStatusMap,
        recentOrders: ctx.recentOrders,
      });

      usePolicyGapReplan = !operatorMode && shouldUsePolicyGapReplanPrompt({
        ctx,
        readBlocks: processedReadBlocks,
        readResultsMap,
        rawToolCalls: activeRawToolCalls,
      });

      // Pair the active turn's non-read tool_use too — a non-read block (mutative /
      // ask_operator) emitted alongside a read would otherwise reach the replan call
      // unpaired (400 tool_use without tool_result).
      const nonReadToolResults = activeRawToolCalls
        .filter((toolCall) => TOOL_CATEGORIES[toolCall.name] !== "read")
        .map((toolCall) => ({
          type: "tool_result" as const,
          tool_use_id: toolCall.id,
          content: "Not executed during planning.",
        }));
      planMessages = [
        ...activePlanMessages,
        {
          role: "user",
          content: [
            ...processedReadBlocks.map((block) => ({
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: readResults.readResultsMap.get(block.id) ?? "Not executed during planning.",
            })),
            ...nonReadToolResults,
          ],
        },
        {
          role: "user",
          content: usePolicyGapReplan ? POLICY_GAP_REPLAN_PROMPT : REPLAN_INCLUDE_REPLY_PROMPT,
        },
      ];

      const replanResult = await runMutativeReplan({
        ctx,
        resolvedSettings,
        systemPromptBlocks,
        planMessages,
        phase1RawToolCalls: activeRawToolCalls,
        tools: usePolicyGapReplan ? selectPolicyGapReplanTools(tools) : tools,
        operatorMode,
        usageTotals,
        contextSkippedReadIds,
        initialPhase: "after_read_results",
      });
      planMessages = replanResult.planMessages;
      rawToolCalls = replanResult.rawToolCalls;
      ranReplanRetry = replanResult.ranReplanRetry;
      ranReplan = true;
    } else {
      rawToolCalls = activeRawToolCalls.filter((toolCall) => !contextSkippedReadIds.has(toolCall.id));
    }
  }

  if (shouldForceMutativeReplan({ ctx, rawToolCalls, tools, operatorMode, ranReplan })) {
    logger.info({
      orgId: ctx.orgId,
      threadId: ctx.thread.id,
    }, "[agent:plan] mutative intent without action tools — running context replan");

    // Resolve the initial turn's tool_use before appending replan context, else
    // the next model call ships an unpaired tool_use (400 tool_use without tool_result).
    planMessages = appendPendingToolResults(planMessages);
    planMessages = [
      ...planMessages,
      { role: "user", content: synthesizeMutativeReplanContext(ctx) },
      { role: "user", content: REPLAN_INCLUDE_REPLY_PROMPT },
    ];

    const replanResult = await runMutativeReplan({
      ctx,
      resolvedSettings,
      systemPromptBlocks,
      planMessages,
      phase1RawToolCalls: rawToolCalls,
      tools,
      operatorMode,
      usageTotals,
      contextSkippedReadIds,
      initialPhase: "mutative_context",
    });
    planMessages = replanResult.planMessages;
    rawToolCalls = replanResult.rawToolCalls;
    ranReplanRetry = replanResult.ranReplanRetry;
    ranReplan = true;
  }

  rawToolCalls = stripCreateRefundForAlreadyRefundedOrders(ctx, instruction, rawToolCalls);
  rawToolCalls = stripEmptySendReplyToolCalls(rawToolCalls);
  rawToolCalls = applyBrandVoiceOrderStatusGuard(ctx, instruction, settings, rawToolCalls);

  // Safety backstop: contradictory instructions or failed Shopify lookups during
  // planning must escalate instead of forcing a customer reply.
  let ranEscalationDraft = false;
  let ranReplyDraft = false;
  let hasSendReply = rawToolCalls.some((tc) => tc.name === "send_reply");
  let hasEscalate = rawToolCalls.some((tc) => tc.name === "escalate_to_human");
  const escalateTool = tools.find((t) => t.name === "escalate_to_human");
  const sendReplyTool = tools.find((t) => t.name === "send_reply");

  if (
    !operatorMode
    && escalateTool
    && shouldForcePlanningEscalation({
      ctx,
      instruction,
      rawToolCalls,
      readBlocks: processedReadBlocks,
      readStatusMap: planningReadStatusMap,
      readResultsMap,
      settings,
      operatorMode,
    })
  ) {
    rawToolCalls = stripNonEscalationTerminalTools(rawToolCalls);
    hasSendReply = false;
    hasEscalate = rawToolCalls.some((tc) => tc.name === "escalate_to_human");

    if (!hasEscalate) {
      const draftMessages: Anthropic.MessageParam[] = appendPendingToolResults(planMessages);
      draftMessages.push({ role: "user", content: ESCALATION_DRAFT_PROMPT });

      await enforceSpendCap(ctx.orgId, resolvedSettings);
      const draftModel = pickModel("reply_draft");
      const { toolBlocks } = await runPlannerModelCall({
        ctx,
        usageTotals,
        model: draftModel,
        maxTokens: PLAN_REPLAN_MAX_TOKENS,
        systemPromptBlocks,
        messages: draftMessages,
        tools: [escalateTool],
        toolChoice: { type: "tool", name: "escalate_to_human" },
        phase: "escalation_draft",
        selectLoggedToolBlocks: (blocks) => blocks.filter((b) => b.name === "escalate_to_human"),
      });
      const draftBlocks = toolBlocks.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "escalate_to_human",
      );
      rawToolCalls.push(...draftBlocks.map((b) => ({ id: b.id, name: b.name, input: b.input })));
      ranEscalationDraft = true;
      hasEscalate = true;
    }
  }

  // Terminal reply guarantee: on a customer channel every plan must end with a
  // send_reply (or an escalation / merchant question). Phase 1 and replan can finish
  // with a mutative action and no reply, or with nothing at all — force one final
  // send_reply.
  rawToolCalls = applyMutativeIntentNoActionGuard(ctx, rawToolCalls, warnings);
  rawToolCalls = applyPolicyGapAskOperatorGuard({
    ctx,
    rawToolCalls,
    readBlocks: processedReadBlocks,
    readResultsMap,
    warnings,
  });
  hasSendReply = rawToolCalls.some((tc) => tc.name === "send_reply");
  hasEscalate = rawToolCalls.some((tc) => tc.name === "escalate_to_human");
  let hasAskOperator = rawToolCalls.some((tc) => tc.name === "ask_operator");
  if (
    !operatorMode
    && !hasSendReply
    && !hasEscalate
    && !hasAskOperator
    && sendReplyTool
    && !shouldSkipReplyDraftForWatchTier(resolvedSettings, ctx)
    && !shouldSkipReplyDraftForMutativeIntent(ctx, rawToolCalls)
  ) {
    const draftMessages: Anthropic.MessageParam[] = [...planMessages];
    const pendingToolResults = pendingToolResultsForLastAssistantMessage(planMessages);
    if (pendingToolResults.length > 0) {
      draftMessages.push({
        role: "user",
        content: pendingToolResults,
      });
      draftMessages.push({ role: "user", content: replyDraftPrompt(resolvedSettings) });
    } else if (shouldPreferBrandVoiceOrderStatusReply(ctx, instruction, resolvedSettings)) {
      draftMessages.push(
        { role: "user", content: synthesizeMutativeReplanContext(ctx) },
        { role: "user", content: replyDraftPrompt(resolvedSettings) },
      );
    } else {
      draftMessages.push({ role: "user", content: replyDraftPrompt(resolvedSettings) });
    }

    await enforceSpendCap(ctx.orgId, resolvedSettings);
    const draftModel = pickModel("reply_draft");
    let draftBlocks: Anthropic.ToolUseBlock[] = [];
    for (let attempt = 0; attempt < 2 && draftBlocks.length === 0; attempt += 1) {
      const { toolBlocks } = await runPlannerModelCall({
        ctx,
        usageTotals,
        model: draftModel,
        maxTokens: PLAN_REPLAN_MAX_TOKENS,
        systemPromptBlocks,
        messages: draftMessages,
        tools: [sendReplyTool],
        toolChoice: { type: "tool", name: "send_reply" },
        phase: "reply_draft",
        attempt: attempt + 1,
        selectLoggedToolBlocks: (blocks) => blocks.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "send_reply",
        ).filter((block) => sendReplyHasText({ id: block.id, name: block.name, input: block.input })),
      });
      draftBlocks = toolBlocks.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "send_reply",
      ).filter((block) => sendReplyHasText({ id: block.id, name: block.name, input: block.input }));
    }
    if (draftBlocks.length > 0) {
      rawToolCalls.push(...draftBlocks.map((b) => ({ id: b.id, name: b.name, input: b.input })));
      ranReplyDraft = true;
    }
  }

  rawToolCalls = applyPolicyGapAskOperatorGuard({
    ctx,
    rawToolCalls,
    readBlocks: processedReadBlocks,
    readResultsMap,
    warnings,
  });
  hasSendReply = rawToolCalls.some((tc) => tc.name === "send_reply");
  hasAskOperator = rawToolCalls.some((tc) => tc.name === "ask_operator");
  const policyGapGuardApplied = rawToolCalls.some((tc) => tc.id === "tu_policy_gap_ask");

  if (contextSkippedReadIds.size > 0) {
    rawToolCalls = rawToolCalls.filter((toolCall) => !contextSkippedReadIds.has(toolCall.id));
  }

  const steps = buildPlanSteps(rawToolCalls);
  const planPath = derivePlanPath({ ranReplan });

  logger.info({
    orgId: ctx.orgId,
    threadId: ctx.thread.id,
    durationMs: Date.now() - startedAt,
    planPath,
    replanRetried: ranReplanRetry,
    escalationDrafted: ranEscalationDraft,
    askOperatorElected: hasAskOperator,
    policyGapGuardApplied,
    policyGapReplanPrompt: usePolicyGapReplan,
    replyDrafted: ranReplyDraft,
    modelCalls: usageTotals.modelCalls,
    usageTotals,
    readToolCalls,
    rawToolCallCount: rawToolCalls.length,
    rawToolCalls: rawToolCalls.map(tc => tc.name),
    visibleStepCount: steps.length,
    visibleSteps: steps.map(step => step.tool),
    warningCount: warnings.length,
    instructionHash,
  }, "[agent:plan] complete");

  const readResults = readResultsMap.size > 0 ? Object.fromEntries(readResultsMap) : undefined;
  return { instruction, steps, rawToolCalls, readResults, warnings: warnings.length > 0 ? warnings : undefined };
}
