import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, buildSplitCachedSystemPrompt } from "./ai/anthropic.js";
import { pickModel } from "./ai/index.js";
import logger from "./logger.js";
import type { AgentPlan, OrgSettings, RawToolCall } from "./types.js";
import { TOOL_CATEGORIES, selectAgentTools } from "./tools/registry/index.js";
import { buildSystemPromptParts } from "./prompt.js";
import { selectToolNamesForInstruction, isOperatorChannel } from "./intent.js";
import { buildMessageHistory } from "./message-history.js";
import type { AgentContext } from "./agent-context.js";
import { createModelUsageMetrics, hashInstructionForLog, recordModelUsage } from "./usage.js";
import { enforceSpendCap, recordSpend } from "./spend.js";
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
import { mergeReplanToolCalls, selectInitialPlanningTools, REPLAN_INCLUDE_REPLY_PROMPT, REPLAN_RETRY_PROMPT, replanNeedsSendReplyRetry, selectReplanRetryTools } from "./planner-tools.js";
import { tryPlanOrderStatusFastPath } from "./order-status-fast-path.js";
import {
  applyMutativeIntentNoActionGuard,
  ESCALATION_DRAFT_PROMPT,
  replyDraftPrompt,
  sendReplyHasText,
  shouldForceMutativeReplan,
  shouldForcePlanningEscalation,
  shouldSkipReplyDraftForMutativeIntent,
  shouldSkipReplyDraftForWatchTier,
  stripCreateRefundForAlreadyRefundedOrders,
  stripEmptySendReplyToolCalls,
  stripNonEscalationTerminalTools,
} from "./planner-safety.js";
import type { ToolStatus } from "./tools/result.js";

/** Phase-1 Haiku calls emit tool calls only (reads, send_reply, escalate). */
export const PLAN_INITIAL_MAX_TOKENS = 1024;
/** Replan may include send_reply body text alongside mutative tools. */
export const PLAN_REPLAN_MAX_TOKENS = 2048;

async function runMutativeReplan(input: {
  ctx: AgentContext;
  resolvedSettings: ReturnType<typeof resolveAgentSettings>;
  systemPromptBlocks: Anthropic.Messages.MessageCreateParams["system"];
  planMessages: Anthropic.MessageParam[];
  phase1RawToolCalls: RawToolCall[];
  tools: Anthropic.Tool[];
  operatorMode: boolean;
  usageTotals: ReturnType<typeof createModelUsageMetrics>;
  contextSkippedReadIds: Set<string>;
  initialPhase: "after_read_results" | "mutative_context";
}): Promise<{
  rawToolCalls: RawToolCall[];
  planMessages: Anthropic.MessageParam[];
  ranReplanRetry: boolean;
}> {
  const {
    ctx,
    resolvedSettings,
    systemPromptBlocks,
    tools,
    operatorMode,
    usageTotals,
    contextSkippedReadIds,
  } = input;
  let planMessages = input.planMessages;
  const activeRawToolCalls = input.phase1RawToolCalls;

  await enforceSpendCap(ctx.orgId, resolvedSettings);
  const replanModel = pickModel("plan_replan");
  const sendReplyTool = tools.find((tool) => tool.name === "send_reply");
  const runReplan = async (
    messages: Anthropic.MessageParam[],
    replanTools: Anthropic.Tool[],
    phase: "after_read_results" | "replan_retry" | "mutative_context",
  ) => {
    const response = await anthropic.messages.create({
      model: replanModel,
      max_tokens: PLAN_REPLAN_MAX_TOKENS,
      system: systemPromptBlocks,
      messages,
      tools: replanTools,
    });
    const toolBlocks = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    const usage = recordModelUsage(usageTotals, response);
    await recordSpend(ctx.orgId, usage, replanModel);
    logger.info({
      orgId: ctx.orgId,
      threadId: ctx.thread.id,
      phase,
      model: replanModel,
      stopReason: response.stop_reason,
      tools: toolBlocks.map((block) => block.name),
      usage,
      usageTotals,
    }, "[agent:plan] model call");
    return { response, toolBlocks };
  };

  let ranReplanRetry = false;
  let { response: replanResponse, toolBlocks: replanBlocks } = await runReplan(
    planMessages,
    tools,
    input.initialPhase,
  );
  planMessages = [...planMessages, { role: "assistant", content: replanResponse.content }];

  if (replanNeedsSendReplyRetry(replanBlocks, {
    operatorMode,
    sendReplyAvailable: Boolean(sendReplyTool),
  })) {
    planMessages = [
      ...planMessages,
      {
        role: "user",
        content: [
          ...replanBlocks.map((block) => ({
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: "Not executed during planning.",
          })),
          { type: "text" as const, text: REPLAN_RETRY_PROMPT },
        ],
      },
    ];
    await enforceSpendCap(ctx.orgId, resolvedSettings);
    const retryTools = selectReplanRetryTools(tools, replanBlocks);
    ({ response: replanResponse, toolBlocks: replanBlocks } = await runReplan(
      planMessages,
      retryTools,
      "replan_retry",
    ));
    planMessages = [...planMessages, { role: "assistant", content: replanResponse.content }];
    ranReplanRetry = true;
  }

  const filteredPhase1Calls = activeRawToolCalls.filter((toolCall) => !contextSkippedReadIds.has(toolCall.id));
  const rawToolCalls = mergeReplanToolCalls(
    filteredPhase1Calls,
    replanBlocks.map((block) => ({ id: block.id, name: block.name, input: block.input })),
  );

  return { rawToolCalls, planMessages, ranReplanRetry };
}

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
  const response1 = await anthropic.messages.create({
    model: initialModel,
    max_tokens: PLAN_INITIAL_MAX_TOKENS,
    system: systemPromptBlocks,
    messages: baseMessages,
    tools: initialTools,
  });

  const blocks1 = response1.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const usage1 = recordModelUsage(usageTotals, response1);
  await recordSpend(ctx.orgId, usage1, initialModel);
  logger.info({
    orgId: ctx.orgId,
    threadId: ctx.thread.id,
    phase: "initial",
    model: initialModel,
    stopReason: response1.stop_reason,
    tools: blocks1.map(b => b.name),
    usage: usage1,
    usageTotals,
  }, "[agent:plan] model call");
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
      const retryResponse = await anthropic.messages.create({
        model: initialModel,
        max_tokens: PLAN_INITIAL_MAX_TOKENS,
        system: systemPromptBlocks,
        messages: baseMessages,
        tools: tools.filter((tool) => tool.name !== "send_reply"),
      });
      const retryBlocks = retryResponse.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const retryUsage = recordModelUsage(usageTotals, retryResponse);
      await recordSpend(ctx.orgId, retryUsage, initialModel);
      logger.info({
        orgId: ctx.orgId,
        threadId: ctx.thread.id,
        phase: "initial_full_tools_retry",
        model: initialModel,
        stopReason: retryResponse.stop_reason,
        tools: retryBlocks.map((block) => block.name),
        usage: retryUsage,
        usageTotals,
      }, "[agent:plan] model call");

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

      planMessages = [
        ...activePlanMessages,
        {
          role: "user",
          content: processedReadBlocks.map((block) => ({
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: readResults.readResultsMap.get(block.id) ?? "Not executed during planning.",
          })),
        },
        {
          role: "user",
          content: REPLAN_INCLUDE_REPLY_PROMPT,
        },
      ];

      const replanResult = await runMutativeReplan({
        ctx,
        resolvedSettings,
        systemPromptBlocks,
        planMessages,
        phase1RawToolCalls: activeRawToolCalls,
        tools,
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
      const lastMessage = planMessages[planMessages.length - 1];
      const pendingToolUse = lastMessage?.role === "assistant" && Array.isArray(lastMessage.content)
        ? (lastMessage.content as Anthropic.ContentBlock[]).filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
          )
        : [];
      const draftMessages: Anthropic.MessageParam[] = [...planMessages];
      if (pendingToolUse.length > 0) {
        draftMessages.push({
          role: "user",
          content: pendingToolUse.map((b) => ({
            type: "tool_result" as const,
            tool_use_id: b.id,
            content: "Not executed during planning.",
          })),
        });
      }
      draftMessages.push({ role: "user", content: ESCALATION_DRAFT_PROMPT });

      await enforceSpendCap(ctx.orgId, resolvedSettings);
      const draftModel = pickModel("reply_draft");
      const draftResponse = await anthropic.messages.create({
        model: draftModel,
        max_tokens: PLAN_REPLAN_MAX_TOKENS,
        system: systemPromptBlocks,
        messages: draftMessages,
        tools: [escalateTool],
        tool_choice: { type: "tool", name: "escalate_to_human" },
      });
      const draftBlocks = draftResponse.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "escalate_to_human",
      );
      const draftUsage = recordModelUsage(usageTotals, draftResponse);
      await recordSpend(ctx.orgId, draftUsage, draftModel);
      logger.info({
        orgId: ctx.orgId,
        threadId: ctx.thread.id,
        phase: "escalation_draft",
        model: draftModel,
        stopReason: draftResponse.stop_reason,
        tools: draftBlocks.map((b) => b.name),
        usage: draftUsage,
        usageTotals,
      }, "[agent:plan] model call");
      rawToolCalls.push(...draftBlocks.map((b) => ({ id: b.id, name: b.name, input: b.input })));
      ranEscalationDraft = true;
      hasEscalate = true;
    }
  }

  // Terminal reply guarantee: on a customer channel every plan must end with a
  // send_reply (or an escalation). Phase 1 and replan can finish with a mutative
  // action and no reply, or with nothing at all — force one final send_reply.
  rawToolCalls = applyMutativeIntentNoActionGuard(ctx, rawToolCalls, warnings);
  hasSendReply = rawToolCalls.some((tc) => tc.name === "send_reply");
  hasEscalate = rawToolCalls.some((tc) => tc.name === "escalate_to_human");
  if (
    !operatorMode
    && !hasSendReply
    && !hasEscalate
    && sendReplyTool
    && !shouldSkipReplyDraftForWatchTier(resolvedSettings, ctx)
    && !shouldSkipReplyDraftForMutativeIntent(ctx, rawToolCalls)
  ) {
    const lastMessage = planMessages[planMessages.length - 1];
    const pendingToolUse = lastMessage?.role === "assistant" && Array.isArray(lastMessage.content)
      ? (lastMessage.content as Anthropic.ContentBlock[]).filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
        )
      : [];
    const draftMessages: Anthropic.MessageParam[] = [
      ...planMessages,
      pendingToolUse.length > 0
        ? {
            role: "user",
            content: pendingToolUse.map((b) => ({
              type: "tool_result" as const,
              tool_use_id: b.id,
              content: "Not executed during planning.",
            })),
          }
        : { role: "user", content: replyDraftPrompt(resolvedSettings) },
    ];

    await enforceSpendCap(ctx.orgId, resolvedSettings);
    const draftModel = pickModel("reply_draft");
    let draftBlocks: Anthropic.ToolUseBlock[] = [];
    for (let attempt = 0; attempt < 2 && draftBlocks.length === 0; attempt += 1) {
      const draftResponse = await anthropic.messages.create({
        model: draftModel,
        max_tokens: PLAN_REPLAN_MAX_TOKENS,
        system: systemPromptBlocks,
        messages: draftMessages,
        tools: [sendReplyTool],
        tool_choice: { type: "tool", name: "send_reply" },
      });
      draftBlocks = draftResponse.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "send_reply",
      ).filter((block) => sendReplyHasText({ id: block.id, name: block.name, input: block.input }));
      const draftUsage = recordModelUsage(usageTotals, draftResponse);
      await recordSpend(ctx.orgId, draftUsage, draftModel);
      logger.info({
        orgId: ctx.orgId,
        threadId: ctx.thread.id,
        phase: "reply_draft",
        attempt: attempt + 1,
        model: draftModel,
        stopReason: draftResponse.stop_reason,
        tools: draftBlocks.map((b) => b.name),
        usage: draftUsage,
        usageTotals,
      }, "[agent:plan] model call");
    }
    if (draftBlocks.length > 0) {
      rawToolCalls.push(...draftBlocks.map((b) => ({ id: b.id, name: b.name, input: b.input })));
      ranReplyDraft = true;
    }
  }

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
