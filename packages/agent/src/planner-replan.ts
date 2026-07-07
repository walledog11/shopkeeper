import type Anthropic from "@anthropic-ai/sdk";
import { pickModel } from "./ai/index.js";
import type { AgentContext } from "./agent-context.js";
import { resolveAgentSettings } from "./settings.js";
import type { RawToolCall } from "./types.js";
import type { PlannerUsageTotals } from "./planner-model.js";
import { PLAN_REPLAN_MAX_TOKENS, runPlannerModelCall } from "./planner-model.js";
import {
  mergeReplanToolCalls,
  REPLAN_RETRY_PROMPT,
  replanNeedsSendReplyRetry,
  selectReplanRetryTools,
} from "./planner-tools.js";

export function pendingToolResultsForLastAssistantMessage(
  planMessages: Anthropic.MessageParam[],
  content = "Not executed during planning.",
): Anthropic.ToolResultBlockParam[] {
  const lastMessage = planMessages[planMessages.length - 1];
  const pendingToolUse = lastMessage?.role === "assistant" && Array.isArray(lastMessage.content)
    ? (lastMessage.content as Anthropic.ContentBlock[]).filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      )
    : [];

  return pendingToolUse.map((block) => ({
    type: "tool_result" as const,
    tool_use_id: block.id,
    content,
  }));
}

export function appendPendingToolResults(
  planMessages: Anthropic.MessageParam[],
  content = "Not executed during planning.",
): Anthropic.MessageParam[] {
  const pendingToolResults = pendingToolResultsForLastAssistantMessage(planMessages, content);
  if (pendingToolResults.length === 0) return [...planMessages];
  return [
    ...planMessages,
    {
      role: "user",
      content: pendingToolResults,
    },
  ];
}

export async function runMutativeReplan(input: {
  ctx: AgentContext;
  resolvedSettings: ReturnType<typeof resolveAgentSettings>;
  systemPromptBlocks: Anthropic.Messages.MessageCreateParams["system"];
  planMessages: Anthropic.MessageParam[];
  phase1RawToolCalls: RawToolCall[];
  tools: Anthropic.Tool[];
  operatorMode: boolean;
  usageTotals: PlannerUsageTotals;
  contextSkippedReadIds: Set<string>;
  initialPhase: "after_read_results" | "mutative_context";
}): Promise<{
  rawToolCalls: RawToolCall[];
  planMessages: Anthropic.MessageParam[];
  ranReplanRetry: boolean;
}> {
  const {
    ctx,
    systemPromptBlocks,
    tools,
    operatorMode,
    usageTotals,
    contextSkippedReadIds,
  } = input;
  let planMessages = input.planMessages;
  const activeRawToolCalls = input.phase1RawToolCalls;

  const replanModel = pickModel("plan_replan");
  const sendReplyTool = tools.find((tool) => tool.name === "send_reply");
  const runReplan = async (
    messages: Anthropic.MessageParam[],
    replanTools: Anthropic.Tool[],
    phase: "after_read_results" | "replan_retry" | "mutative_context",
  ) => {
    const { response, toolBlocks } = await runPlannerModelCall({
      ctx,
      usageTotals,
      model: replanModel,
      maxTokens: PLAN_REPLAN_MAX_TOKENS,
      systemPromptBlocks,
      messages,
      tools: replanTools,
      phase,
    });
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
          ...pendingToolResultsForLastAssistantMessage(planMessages),
          { type: "text" as const, text: REPLAN_RETRY_PROMPT },
        ],
      },
    ];
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
