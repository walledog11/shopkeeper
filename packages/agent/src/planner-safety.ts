import type Anthropic from "@anthropic-ai/sdk";
import type { AgentContext } from "./agent-context.js";
import type { RawToolCall } from "./types.js";
import type { ToolStatus } from "./tools/result.js";
import { TOOL_CATEGORIES } from "./tools/registry/index.js";
import {
  hasContradictoryInstructionSignals,
  hasActionableMutativeIntent,
  planningIntentTexts,
} from "./intent.js";
import type { OrgSettings } from "./types.js";
import { resolveAgentSettings } from "./settings.js";

const ORDER_LOOKUP_TOOLS = new Set([
  "get_order_by_name",
  "get_shopify_orders",
  "get_shopify_customer",
  "search_shopify_customers",
]);

export function hasCriticalPlanningReadErrorsForBlocks(
  readBlocks: readonly Anthropic.ToolUseBlock[],
  readStatusMap: ReadonlyMap<string, ToolStatus>,
): boolean {
  return readBlocks.some(
    (block) => ORDER_LOOKUP_TOOLS.has(block.name) && readStatusMap.get(block.id) === "error",
  );
}

export function hasAmbiguousCustomerSearchResult(
  readBlocks: readonly Anthropic.ToolUseBlock[],
  readResultsMap: ReadonlyMap<string, string>,
): boolean {
  for (const block of readBlocks) {
    if (block.name !== "search_shopify_customers") continue;
    const raw = readResultsMap.get(block.id);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 1) return true;
    } catch {
      continue;
    }
  }
  return false;
}

export function shouldForcePlanningEscalation(input: {
  ctx: AgentContext;
  instruction: string;
  rawToolCalls: readonly RawToolCall[];
  readBlocks: readonly Anthropic.ToolUseBlock[];
  readStatusMap: ReadonlyMap<string, ToolStatus>;
  readResultsMap: ReadonlyMap<string, string>;
  settings?: OrgSettings;
  operatorMode: boolean;
}): boolean {
  if (input.operatorMode) return false;
  if (input.rawToolCalls.some((toolCall) => toolCall.name === "escalate_to_human")) return false;

  const intentTexts = planningIntentTexts(input.ctx, input.instruction);
  if (hasContradictoryInstructionSignals(...intentTexts)) return true;
  if (shouldEscalateFulfilledCancelRequest(input.ctx, input.instruction)) return true;
  if (hasAmbiguousCustomerSearchResult(input.readBlocks, input.readResultsMap)) return true;

  const resolvedSettings = resolveAgentSettings(input.settings);
  const customerTexts = input.ctx.recentMessages
    .filter((message) => message.senderType === "customer" && message.contentText?.trim())
    .map((message) => message.contentText as string);
  if (
    resolvedSettings.autonomyTier === "watch"
    && hasActionableMutativeIntent(...customerTexts)
  ) {
    return true;
  }

  if (!hasCriticalPlanningReadErrorsForBlocks(input.readBlocks, input.readStatusMap)) {
    return false;
  }

  if (hasActionableMutativeIntent(...customerTexts)) return true;
  if (input.ctx.recentOrders.length === 0) return true;
  return false;
}

export function shouldSkipReplyDraftForWatchTier(
  settings: OrgSettings | undefined,
  ctx: AgentContext,
): boolean {
  const resolvedSettings = resolveAgentSettings(settings);
  if (resolvedSettings.autonomyTier !== "watch") return false;
  const customerTexts = ctx.recentMessages
    .filter((message) => message.senderType === "customer" && message.contentText?.trim())
    .map((message) => message.contentText as string);
  return hasActionableMutativeIntent(...customerTexts);
}

export function shouldEscalateFulfilledCancelRequest(
  ctx: AgentContext,
  instruction: string,
): boolean {
  const intentTexts = planningIntentTexts(ctx, instruction);
  const wantsCancel = intentTexts.some((text) => /\bcancel(?:lation|led|ing)?\b/i.test(text));
  if (!wantsCancel) return false;
  return ctx.recentOrders.some((order) => order.fulfillment_status === "fulfilled");
}

export function stripNonEscalationTerminalTools(rawToolCalls: RawToolCall[]): RawToolCall[] {
  return rawToolCalls.filter((toolCall) => (
    toolCall.name === "escalate_to_human" || TOOL_CATEGORIES[toolCall.name] === "read"
  ));
}

export const ESCALATION_DRAFT_PROMPT =
  "Planning cannot proceed safely. Call escalate_to_human now — do not send_reply or take mutative action.";

export function replyDraftPrompt(settings?: { brandVoice?: string | null }): string {
  const brandVoice = settings?.brandVoice?.trim();
  if (!brandVoice) {
    return "Now call send_reply to respond to the customer.";
  }
  return `Now call send_reply to respond to the customer. Follow the brand voice section exactly, including any banned phrases or tone constraints.`;
}
