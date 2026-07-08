import type Anthropic from "@anthropic-ai/sdk";
import type { AgentContext } from "./agent-context.js";
import { pickModel } from "./ai/index.js";
import {
  appendPendingToolResults,
  pendingToolResultsForLastAssistantMessage,
} from "./planner-replan.js";
import {
  isMerchantAnswerPlanningInstruction,
  merchantAnswerReplyDraftPrompt,
} from "./kb-learned.js";
import {
  replyDraftPrompt,
  sendReplyHasText,
  stripCreateRefundForAlreadyRefundedOrders,
  stripEmptySendReplyToolCalls,
} from "./planner-safety/index.js";
import {
  PLAN_REPLAN_MAX_TOKENS,
  runPlannerModelCall,
  type PlannerUsageTotals,
} from "./planner-model.js";
import type { OrgSettings, RawToolCall } from "./types.js";

export interface PlannerTerminalDraftInput {
  ctx: AgentContext;
  usageTotals: PlannerUsageTotals;
  resolvedSettings: OrgSettings;
  systemPromptBlocks: Anthropic.Messages.MessageCreateParams["system"];
  messages: Anthropic.MessageParam[];
  tool: Anthropic.Tool;
  toolName: string;
  prompt: string;
  phase: string;
  attempts?: number;
  validate?: (toolCall: RawToolCall) => boolean;
}

export async function draftPlannerTerminalTool(input: PlannerTerminalDraftInput): Promise<RawToolCall[]> {
  const model = pickModel("reply_draft");
  const messages = appendPendingToolResults(input.messages);
  messages.push({ role: "user", content: input.prompt });
  const attempts = input.attempts ?? 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { toolBlocks } = await runPlannerModelCall({
      ctx: input.ctx,
      usageTotals: input.usageTotals,
      model,
      maxTokens: PLAN_REPLAN_MAX_TOKENS,
      systemPromptBlocks: input.systemPromptBlocks,
      messages,
      tools: [input.tool],
      toolChoice: { type: "tool", name: input.toolName },
      phase: input.phase,
      ...(attempts > 1 ? { attempt } : {}),
      selectLoggedToolBlocks: blocks => blocks.filter(block => {
        if (block.name !== input.toolName) return false;
        const toolCall = { id: block.id, name: block.name, input: block.input };
        return input.validate?.(toolCall) ?? true;
      }),
    });
    const calls = toolBlocks
      .filter(block => block.name === input.toolName)
      .map(block => ({ id: block.id, name: block.name, input: block.input }))
      .filter(toolCall => input.validate?.(toolCall) ?? true);
    if (calls.length > 0) return calls;
  }
  return [];
}

export interface FinalizePlanToolsInput {
  ctx: AgentContext;
  instruction: string;
  resolvedSettings: OrgSettings;
  operatorMode: boolean;
  tools: Anthropic.Tool[];
  systemPromptBlocks: Anthropic.Messages.MessageCreateParams["system"];
  planMessages: Anthropic.MessageParam[];
  usageTotals: PlannerUsageTotals;
  rawToolCalls: RawToolCall[];
}

export interface FinalizePlanToolsResult {
  rawToolCalls: RawToolCall[];
  ranReplyDraft: boolean;
  hasAskOperator: boolean;
}

// Structural cleanup + the terminal reply-draft. Guard routing (escalate /
// needs_review) is decided afterwards in planAgent by `routePlan`, which never
// edits tool calls — so this no longer strips replies, injects ask_operator, or
// forces escalation. The only mutations here are structural: dropping refunds for
// already-refunded orders and empty send_reply calls.
export async function finalizePlanTools(
  input: FinalizePlanToolsInput,
): Promise<FinalizePlanToolsResult> {
  let rawToolCalls = stripCreateRefundForAlreadyRefundedOrders(
    input.ctx,
    input.instruction,
    input.rawToolCalls,
  );
  rawToolCalls = stripEmptySendReplyToolCalls(rawToolCalls);

  const merchantAnswerReplan = isMerchantAnswerPlanningInstruction(input.instruction);
  if (merchantAnswerReplan) {
    rawToolCalls = rawToolCalls.filter(toolCall => toolCall.name !== "ask_operator");
  }

  const sendReplyTool = input.tools.find(tool => tool.name === "send_reply");
  const hasTerminal = rawToolCalls.some(toolCall => (
    toolCall.name === "send_reply"
    || toolCall.name === "escalate_to_human"
    || (!merchantAnswerReplan && toolCall.name === "ask_operator")
  ));

  let ranReplyDraft = false;
  if (!input.operatorMode && !hasTerminal && sendReplyTool) {
    const pendingToolResults = pendingToolResultsForLastAssistantMessage(input.planMessages);
    const draftMessages = [...input.planMessages];
    if (pendingToolResults.length > 0) {
      draftMessages.push({ role: "user", content: pendingToolResults });
    }
    const drafted = await draftPlannerTerminalTool({
      ctx: input.ctx,
      usageTotals: input.usageTotals,
      resolvedSettings: input.resolvedSettings,
      systemPromptBlocks: input.systemPromptBlocks,
      messages: draftMessages,
      tool: sendReplyTool,
      toolName: "send_reply",
      prompt: merchantAnswerReplan
        ? merchantAnswerReplyDraftPrompt(input.resolvedSettings)
        : replyDraftPrompt(input.resolvedSettings),
      phase: merchantAnswerReplan ? "merchant_answer_reply_draft" : "reply_draft",
      attempts: 2,
      validate: sendReplyHasText,
    });
    rawToolCalls.push(...drafted);
    ranReplyDraft = drafted.length > 0;
  }

  const hasAskOperator = rawToolCalls.some(toolCall => toolCall.name === "ask_operator");

  return { rawToolCalls, ranReplyDraft, hasAskOperator };
}
