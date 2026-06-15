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
} from "./planner-read-tools.js";

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
  const resolvedSettings = resolveAgentSettings(settings);

  await enforceSpendCap(ctx.orgId, resolvedSettings);

  logger.info({
    orgId: ctx.orgId,
    threadId: ctx.thread.id,
    channelType: ctx.thread.channelType,
    messageCount: baseMessages.length,
    toolCount: tools.length,
    tools: tools.map(t => t.name),
    instructionLength: instruction.length,
    instructionHash,
  }, "[agent:plan] start");

  const initialModel = pickModel("plan_initial");
  const response1 = await anthropic.messages.create({
    model: initialModel,
    max_tokens: 2048,
    system: systemPromptBlocks,
    messages: baseMessages,
    tools,
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
  const rawToolCalls: RawToolCall[] = blocks1.map((b) => ({ id: b.id, name: b.name, input: b.input }));

  let planMessages: Anthropic.MessageParam[] = [
    ...baseMessages,
    { role: "assistant", content: response1.content },
  ];
  let lastBlocks: Anthropic.ToolUseBlock[] = blocks1;

  const readBlocks = blocks1.filter(b => TOOL_CATEGORIES[b.name] === "read");
  const warnings: string[] = [];
  const readResultsMap = new Map<string, string>();
  appendInitialPlanningWarnings({ ctx, operatorMode, warnings });

  if (readBlocks.length > 0) {
    const readResults = await executePlanningReadTools({ ctx, settings, readBlocks });
    readToolCalls.push(...readResults.readToolCalls);
    for (const [id, content] of readResults.readResultsMap) readResultsMap.set(id, content);
    appendPlanningReadWarnings({
      warnings,
      readBlocks,
      readResultsMap,
      readStatusMap: readResults.readStatusMap,
      recentOrders: ctx.recentOrders,
    });

    planMessages = [
      ...planMessages,
      {
        role: "user",
        content: blocks1.map(b => ({
          type: "tool_result" as const,
          tool_use_id: b.id,
          content: readResultsMap.get(b.id) ?? "Not executed during planning.",
        })),
      },
    ];

    await enforceSpendCap(ctx.orgId, resolvedSettings);
    // Re-plan: the model now has the read results and decides the mutative
    // action (refund/cancel/edit) or escalation. This is the judgment call, so
    // it runs on Sonnet.
    const replanModel = pickModel("plan_replan");
    const response15 = await anthropic.messages.create({
      model: replanModel,
      max_tokens: 2048,
      system: systemPromptBlocks,
      messages: planMessages,
      tools,
    });
    lastBlocks = response15.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const usage15 = recordModelUsage(usageTotals, response15);
    await recordSpend(ctx.orgId, usage15, replanModel);
    logger.info({
      orgId: ctx.orgId,
      threadId: ctx.thread.id,
      phase: "after_read_results",
      model: replanModel,
      stopReason: response15.stop_reason,
      tools: lastBlocks.map(b => b.name),
      usage: usage15,
      usageTotals,
    }, "[agent:plan] model call");
    rawToolCalls.push(...lastBlocks.map((b) => ({ id: b.id, name: b.name, input: b.input })));
    planMessages = [...planMessages, { role: "assistant", content: response15.content }];
  }

  const hasSendReply = rawToolCalls.some((tc) => tc.name === "send_reply");
  const hasEscalate = rawToolCalls.some((tc) => tc.name === "escalate_to_human");
  const sendReplyTool = tools.find(t => t.name === "send_reply");
  if (!operatorMode && !hasSendReply && !hasEscalate && sendReplyTool) {
    const phase2Messages: Anthropic.MessageParam[] = [
      ...planMessages,
      ...(lastBlocks.length > 0
        ? [{
            role: "user" as const,
            content: lastBlocks.map((b) => ({
              type: "tool_result" as const,
              tool_use_id: b.id,
              content: "Not executed during planning.",
            })),
          }]
        : [{ role: "user" as const, content: "Now call send_reply to respond to the customer." }]
      ),
    ];

    await enforceSpendCap(ctx.orgId, resolvedSettings);
    const draftModel = pickModel("reply_draft");
    const response2 = await anthropic.messages.create({
      model: draftModel,
      max_tokens: 2048,
      system: systemPromptBlocks,
      messages: phase2Messages,
      tools: [sendReplyTool],
      tool_choice: { type: "tool", name: "send_reply" },
    });

    const phase2ToolUse = response2.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "send_reply"
    );
    const usage2 = recordModelUsage(usageTotals, response2);
    await recordSpend(ctx.orgId, usage2, draftModel);
    logger.info({
      orgId: ctx.orgId,
      threadId: ctx.thread.id,
      phase: "reply_preview",
      model: draftModel,
      stopReason: response2.stop_reason,
      tools: phase2ToolUse.map(b => b.name),
      usage: usage2,
      usageTotals,
    }, "[agent:plan] model call");
    rawToolCalls.push(...phase2ToolUse.map((b) => ({ id: b.id, name: b.name, input: b.input })));
  }

  const steps = buildPlanSteps(rawToolCalls);

  logger.info({
    orgId: ctx.orgId,
    threadId: ctx.thread.id,
    durationMs: Date.now() - startedAt,
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
