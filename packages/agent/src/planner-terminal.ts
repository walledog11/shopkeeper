import type Anthropic from "@anthropic-ai/sdk";
import type { AgentContext } from "./agent-context.js";
import { pickModel } from "./ai/index.js";
import {
  appendPendingToolResults,
  pendingToolResultsForLastAssistantMessage,
} from "./planner-replan.js";
import {
  applyBrandVoiceOrderStatusGuard,
  applyMutativeIntentNoActionGuard,
  applyPolicyGapAskOperatorGuard,
  ESCALATION_DRAFT_PROMPT,
  replyDraftPrompt,
  sendReplyHasText,
  shouldForcePlanningEscalation,
  shouldPreferBrandVoiceOrderStatusReply,
  shouldSkipReplyDraftForMutativeIntent,
  shouldSkipReplyDraftForWatchTier,
  stripCreateRefundForAlreadyRefundedOrders,
  stripEmptySendReplyToolCalls,
  stripNonEscalationTerminalTools,
} from "./planner-safety/index.js";
import {
  PLAN_REPLAN_MAX_TOKENS,
  runPlannerModelCall,
  type PlannerUsageTotals,
} from "./planner-model.js";
import { synthesizeMutativeReplanContext } from "./planner-read-skip.js";
import type { ToolStatus } from "./tools/result.js";
import type { OrgSettings, RawToolCall } from "./types.js";

interface TerminalDraftInput {
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

async function draftRequiredTerminalTool(input: TerminalDraftInput): Promise<RawToolCall[]> {
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
  settings?: OrgSettings;
  resolvedSettings: OrgSettings;
  operatorMode: boolean;
  tools: Anthropic.Tool[];
  systemPromptBlocks: Anthropic.Messages.MessageCreateParams["system"];
  planMessages: Anthropic.MessageParam[];
  processedReadBlocks: Anthropic.ToolUseBlock[];
  planningReadStatusMap: ReadonlyMap<string, ToolStatus>;
  readResultsMap: ReadonlyMap<string, string>;
  warnings: string[];
  usageTotals: PlannerUsageTotals;
  rawToolCalls: RawToolCall[];
}

export interface FinalizePlanToolsResult {
  rawToolCalls: RawToolCall[];
  ranEscalationDraft: boolean;
  ranReplyDraft: boolean;
  hasAskOperator: boolean;
  policyGapGuardApplied: boolean;
}

export async function finalizePlanTools(
  input: FinalizePlanToolsInput,
): Promise<FinalizePlanToolsResult> {
  let rawToolCalls = stripCreateRefundForAlreadyRefundedOrders(
    input.ctx,
    input.instruction,
    input.rawToolCalls,
  );
  rawToolCalls = stripEmptySendReplyToolCalls(rawToolCalls);
  rawToolCalls = applyBrandVoiceOrderStatusGuard(
    input.ctx,
    input.instruction,
    input.settings,
    rawToolCalls,
  );

  let ranEscalationDraft = false;
  let ranReplyDraft = false;
  const escalateTool = input.tools.find(tool => tool.name === "escalate_to_human");
  const sendReplyTool = input.tools.find(tool => tool.name === "send_reply");

  if (
    !input.operatorMode
    && escalateTool
    && shouldForcePlanningEscalation({
      ctx: input.ctx,
      instruction: input.instruction,
      rawToolCalls,
      readBlocks: input.processedReadBlocks,
      readStatusMap: input.planningReadStatusMap,
      readResultsMap: input.readResultsMap,
      settings: input.settings,
      operatorMode: input.operatorMode,
    })
  ) {
    rawToolCalls = stripNonEscalationTerminalTools(rawToolCalls);
    if (!rawToolCalls.some(toolCall => toolCall.name === "escalate_to_human")) {
      const drafted = await draftRequiredTerminalTool({
        ctx: input.ctx,
        usageTotals: input.usageTotals,
        resolvedSettings: input.resolvedSettings,
        systemPromptBlocks: input.systemPromptBlocks,
        messages: input.planMessages,
        tool: escalateTool,
        toolName: "escalate_to_human",
        prompt: ESCALATION_DRAFT_PROMPT,
        phase: "escalation_draft",
      });
      rawToolCalls.push(...drafted);
      ranEscalationDraft = drafted.length > 0;
    }
  }

  rawToolCalls = applyMutativeIntentNoActionGuard(input.ctx, rawToolCalls, input.warnings);
  rawToolCalls = applyPolicyGapAskOperatorGuard({
    ctx: input.ctx,
    rawToolCalls,
    readBlocks: input.processedReadBlocks,
    readResultsMap: input.readResultsMap,
    warnings: input.warnings,
  });

  const hasTerminal = () => rawToolCalls.some(toolCall => (
    toolCall.name === "send_reply"
    || toolCall.name === "escalate_to_human"
    || toolCall.name === "ask_operator"
  ));
  if (
    !input.operatorMode
    && !hasTerminal()
    && sendReplyTool
    && !shouldSkipReplyDraftForWatchTier(input.resolvedSettings, input.ctx)
    && !shouldSkipReplyDraftForMutativeIntent(input.ctx, rawToolCalls)
  ) {
    const pendingToolResults = pendingToolResultsForLastAssistantMessage(input.planMessages);
    const draftMessages = [...input.planMessages];
    if (pendingToolResults.length > 0) {
      draftMessages.push({ role: "user", content: pendingToolResults });
    } else if (shouldPreferBrandVoiceOrderStatusReply(
      input.ctx,
      input.instruction,
      input.resolvedSettings,
    )) {
      draftMessages.push({
        role: "user",
        content: synthesizeMutativeReplanContext(input.ctx),
      });
    }
    const drafted = await draftRequiredTerminalTool({
      ctx: input.ctx,
      usageTotals: input.usageTotals,
      resolvedSettings: input.resolvedSettings,
      systemPromptBlocks: input.systemPromptBlocks,
      messages: draftMessages,
      tool: sendReplyTool,
      toolName: "send_reply",
      prompt: replyDraftPrompt(input.resolvedSettings),
      phase: "reply_draft",
      attempts: 2,
      validate: sendReplyHasText,
    });
    rawToolCalls.push(...drafted);
    ranReplyDraft = drafted.length > 0;
  }

  rawToolCalls = applyPolicyGapAskOperatorGuard({
    ctx: input.ctx,
    rawToolCalls,
    readBlocks: input.processedReadBlocks,
    readResultsMap: input.readResultsMap,
    warnings: input.warnings,
  });
  const hasAskOperator = rawToolCalls.some(toolCall => toolCall.name === "ask_operator");

  return {
    rawToolCalls,
    ranEscalationDraft,
    ranReplyDraft,
    hasAskOperator,
    policyGapGuardApplied: rawToolCalls.some(toolCall => toolCall.id === "tu_policy_gap_ask"),
  };
}
