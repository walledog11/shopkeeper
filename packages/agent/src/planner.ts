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
import { derivePlanPath } from "./plan-path.js";
import { mergeReplanToolCalls, selectInitialPlanningTools, REPLAN_INCLUDE_REPLY_PROMPT, REPLAN_RETRY_PROMPT, replanNeedsSendReplyRetry, selectReplanRetryTools } from "./planner-tools.js";
import { tryPlanOrderStatusFastPath } from "./order-status-fast-path.js";

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

  await enforceSpendCap(ctx.orgId, resolvedSettings);

  const fastPathPlan = tryPlanOrderStatusFastPath(ctx, instruction);
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
    max_tokens: 2048,
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
  let lastBlocks: Anthropic.ToolUseBlock[] = blocks1;

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
    let activeLastBlocks = lastBlocks;
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
      const retryResponse = await anthropic.messages.create({
        model: initialModel,
        max_tokens: 2048,
        system: systemPromptBlocks,
        messages: baseMessages,
        tools,
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
      activeLastBlocks = retryBlocks;
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
      const processedReadBlocks = [...readPartition.executable, ...readPartition.skipped];
      const readResults = await executePlanningReadTools({
        ctx,
        settings,
        readBlocks: readPartition.executable,
        skippedBlocks: readPartition.skipped,
      });
      readToolCalls.push(...readResults.readToolCalls);
      for (const [id, content] of readResults.readResultsMap) readResultsMap.set(id, content);
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
      lastBlocks = activeLastBlocks;
      rawToolCalls = activeRawToolCalls;

      await enforceSpendCap(ctx.orgId, resolvedSettings);
      // Re-plan: the model now has the read results and decides the mutative
      // action (refund/cancel/edit) or escalation. This is the judgment call, so
      // it runs on Sonnet.
      const replanModel = pickModel("plan_replan");
      const sendReplyTool = tools.find(t => t.name === "send_reply");
      const runReplan = async (
        messages: Anthropic.MessageParam[],
        replanTools: Anthropic.Tool[],
        phase: "after_read_results" | "replan_retry",
      ) => {
        const response = await anthropic.messages.create({
          model: replanModel,
          max_tokens: 2048,
          system: systemPromptBlocks,
          messages,
          tools: replanTools,
        });
        const toolBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
        const usage = recordModelUsage(usageTotals, response);
        await recordSpend(ctx.orgId, usage, replanModel);
        logger.info({
          orgId: ctx.orgId,
          threadId: ctx.thread.id,
          phase,
          model: replanModel,
          stopReason: response.stop_reason,
          tools: toolBlocks.map(b => b.name),
          usage,
          usageTotals,
        }, "[agent:plan] model call");
        return { response, toolBlocks };
      };

      let { response: replanResponse, toolBlocks: replanBlocks } = await runReplan(planMessages, tools, "after_read_results");
      lastBlocks = replanBlocks;
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
        lastBlocks = replanBlocks;
        planMessages = [...planMessages, { role: "assistant", content: replanResponse.content }];
        ranReplanRetry = true;
      }

      const filteredPhase1Calls = activeRawToolCalls.filter((toolCall) => !contextSkippedReadIds.has(toolCall.id));
      rawToolCalls = mergeReplanToolCalls(
        filteredPhase1Calls,
        replanBlocks.map((b) => ({ id: b.id, name: b.name, input: b.input })),
      );
      ranReplan = true;
    } else {
      planMessages = activePlanMessages;
      lastBlocks = activeLastBlocks;
      rawToolCalls = activeRawToolCalls.filter((toolCall) => !contextSkippedReadIds.has(toolCall.id));
    }
  }

  const steps = buildPlanSteps(rawToolCalls);
  const planPath = derivePlanPath({ ranReplan });

  logger.info({
    orgId: ctx.orgId,
    threadId: ctx.thread.id,
    durationMs: Date.now() - startedAt,
    planPath,
    replanRetried: ranReplanRetry,
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
