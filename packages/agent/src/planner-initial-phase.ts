import type Anthropic from "@anthropic-ai/sdk";
import { pickModel } from "./ai/index.js";
import type { AgentContext } from "./agent-context.js";
import logger from "./logger.js";
import {
  PLAN_INITIAL_MAX_TOKENS,
  runPlannerModelCall,
  type PlannerUsageTotals,
} from "./planner-model.js";
import {
  appendInitialPlanningWarnings,
  appendPlanningReadWarnings,
  executePlanningReadTools,
  partitionPlanningReadBlocks,
} from "./planner-read-tools.js";
import { runMutativeReplan } from "./planner-replan.js";
import { shouldUsePolicyGapReplanPrompt } from "./planner-safety/index.js";
import {
  POLICY_GAP_REPLAN_PROMPT,
  REPLAN_INCLUDE_REPLY_PROMPT,
  selectPolicyGapReplanTools,
} from "./planner-tools.js";
import { TOOL_CATEGORIES } from "./tools/registry/index.js";
import type { ToolStatus } from "./tools/result.js";
import type { OrgSettings, RawToolCall } from "./types.js";

export interface InitialPlanningPhaseResult {
  rawToolCalls: RawToolCall[];
  planMessages: Anthropic.MessageParam[];
  processedReadBlocks: Anthropic.ToolUseBlock[];
  planningReadStatusMap: Map<string, ToolStatus>;
  readResultsMap: Map<string, string>;
  readToolCalls: string[];
  warnings: string[];
  ranReplan: boolean;
  ranReplanRetry: boolean;
  contextSkippedReadIds: Set<string>;
  usePolicyGapReplan: boolean;
}

export async function runInitialPlanningPhase(input: {
  ctx: AgentContext;
  instruction: string;
  settings?: OrgSettings;
  resolvedSettings: OrgSettings;
  operatorMode: boolean;
  baseMessages: Anthropic.MessageParam[];
  systemPromptBlocks: Anthropic.Messages.MessageCreateParams["system"];
  tools: Anthropic.Tool[];
  initialTools: Anthropic.Tool[];
  usageTotals: PlannerUsageTotals;
}): Promise<InitialPlanningPhaseResult> {
  const initialModel = pickModel("plan_initial");
  const { response, toolBlocks } = await runPlannerModelCall({
    ctx: input.ctx,
    usageTotals: input.usageTotals,
    model: initialModel,
    maxTokens: PLAN_INITIAL_MAX_TOKENS,
    systemPromptBlocks: input.systemPromptBlocks,
    messages: input.baseMessages,
    tools: input.initialTools,
    phase: "initial",
  });
  let rawToolCalls: RawToolCall[] = toolBlocks.map(block => ({
    id: block.id,
    name: block.name,
    input: block.input,
  }));
  let planMessages: Anthropic.MessageParam[] = [
    ...input.baseMessages,
    { role: "assistant", content: response.content },
  ];
  const readBlocks = toolBlocks.filter(block => TOOL_CATEGORIES[block.name] === "read");
  const warnings: string[] = [];
  const readResultsMap = new Map<string, string>();
  const planningReadStatusMap = new Map<string, ToolStatus>();
  const readToolCalls: string[] = [];
  let processedReadBlocks: Anthropic.ToolUseBlock[] = [];
  let ranReplan = false;
  let ranReplanRetry = false;
  let contextSkippedReadIds = new Set<string>();
  let usePolicyGapReplan = false;
  appendInitialPlanningWarnings({ ctx: input.ctx, operatorMode: input.operatorMode, warnings });

  if (readBlocks.length > 0) {
    let activeReadBlocks = readBlocks;
    let activeRawToolCalls = rawToolCalls;
    let activePlanMessages = planMessages;
    let allReadsSkippedRetried = false;
    let readPartition = partitionPlanningReadBlocks({
      readBlocks: activeReadBlocks,
      ctx: input.ctx,
      instruction: input.instruction,
    });

    if (readPartition.executable.length === 0 && readPartition.skipped.length > 0) {
      allReadsSkippedRetried = true;
      logger.info({
        orgId: input.ctx.orgId,
        threadId: input.ctx.thread.id,
        skippedReads: readPartition.skipped.map(block => block.name),
      }, "[agent:plan] all reads context-redundant — retrying initial call with full tool set");

      const retry = await runPlannerModelCall({
        ctx: input.ctx,
        usageTotals: input.usageTotals,
        model: initialModel,
        maxTokens: PLAN_INITIAL_MAX_TOKENS,
        systemPromptBlocks: input.systemPromptBlocks,
        messages: input.baseMessages,
        tools: input.tools.filter(tool => tool.name !== "send_reply"),
        phase: "initial_full_tools_retry",
      });
      activeReadBlocks = retry.toolBlocks.filter(
        block => TOOL_CATEGORIES[block.name] === "read",
      );
      activeRawToolCalls = retry.toolBlocks.map(block => ({
        id: block.id,
        name: block.name,
        input: block.input,
      }));
      activePlanMessages = [
        ...input.baseMessages,
        { role: "assistant", content: retry.response.content },
      ];
      readPartition = partitionPlanningReadBlocks({
        readBlocks: activeReadBlocks,
        ctx: input.ctx,
        instruction: input.instruction,
      });
    }

    contextSkippedReadIds = new Set(readPartition.skipped.map(block => block.id));
    const shouldReplan = activeReadBlocks.length > 0 && (
      readPartition.executable.length > 0
      || (readPartition.skipped.length > 0 && allReadsSkippedRetried)
    );

    if (shouldReplan) {
      processedReadBlocks = [...readPartition.executable, ...readPartition.skipped];
      const readResults = await executePlanningReadTools({
        ctx: input.ctx,
        settings: input.settings,
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
        recentOrders: input.ctx.recentOrders,
      });

      usePolicyGapReplan = !input.operatorMode && shouldUsePolicyGapReplanPrompt({
        ctx: input.ctx,
        readBlocks: processedReadBlocks,
        readResultsMap,
        rawToolCalls: activeRawToolCalls,
      });
      const nonReadToolResults = activeRawToolCalls
        .filter(toolCall => TOOL_CATEGORIES[toolCall.name] !== "read")
        .map(toolCall => ({
          type: "tool_result" as const,
          tool_use_id: toolCall.id,
          content: "Not executed during planning.",
        }));
      planMessages = [
        ...activePlanMessages,
        {
          role: "user",
          content: [
            ...processedReadBlocks.map(block => ({
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
        ctx: input.ctx,
        resolvedSettings: input.resolvedSettings,
        systemPromptBlocks: input.systemPromptBlocks,
        planMessages,
        phase1RawToolCalls: activeRawToolCalls,
        tools: usePolicyGapReplan ? selectPolicyGapReplanTools(input.tools) : input.tools,
        operatorMode: input.operatorMode,
        usageTotals: input.usageTotals,
        contextSkippedReadIds,
        initialPhase: "after_read_results",
      });
      planMessages = replanResult.planMessages;
      rawToolCalls = replanResult.rawToolCalls;
      ranReplanRetry = replanResult.ranReplanRetry;
      ranReplan = true;
    } else {
      rawToolCalls = activeRawToolCalls.filter(
        toolCall => !contextSkippedReadIds.has(toolCall.id),
      );
    }
  }

  return {
    rawToolCalls,
    planMessages,
    processedReadBlocks,
    planningReadStatusMap,
    readResultsMap,
    readToolCalls,
    warnings,
    ranReplan,
    ranReplanRetry,
    contextSkippedReadIds,
    usePolicyGapReplan,
  };
}
