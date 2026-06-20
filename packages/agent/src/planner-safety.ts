import type Anthropic from "@anthropic-ai/sdk";
import type { AgentContext, ShopifyOrderSummary } from "./agent-context.js";
import type { RawToolCall } from "./types.js";
import type { ToolStatus } from "./tools/result.js";
import { TOOL_CATEGORIES } from "./tools/registry/index.js";
import {
  hasContradictoryInstructionSignals,
  hasActionableMutativeIntent,
  hasMutativeRequestIntent,
  hasForwardedInjectionRefundSignal,
  hasOutOfScopeCommercialRequestSignals,
  hasSuspectedFraudRefundSignals,
  looksLikeOrderStatusIntent,
  ORDER_REFERENCE_RE,
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

function normalizeOrderName(name: string): string {
  const trimmed = name.trim();
  return (trimmed.startsWith("#") ? trimmed : `#${trimmed}`).toUpperCase();
}

function referencedOrderName(text: string): string | null {
  const match = text.match(ORDER_REFERENCE_RE);
  if (!match) return null;
  const raw = match[0];
  const orderNumberMatch = raw.match(/\border\s*#?\s*(\d+)/i);
  if (orderNumberMatch?.[1]) return normalizeOrderName(orderNumberMatch[1]);
  return normalizeOrderName(raw.replace(/^#/, ""));
}

function findReferencedOrder(
  orders: readonly ShopifyOrderSummary[],
  text: string,
): ShopifyOrderSummary | null {
  const reference = referencedOrderName(text);
  if (!reference) return null;
  return orders.find((order) => order.name && normalizeOrderName(order.name) === reference) ?? null;
}

function isOrderFullyRefunded(order: ShopifyOrderSummary): boolean {
  return order.financial_status?.toLowerCase() === "refunded";
}

function refundTargetOrders(ctx: AgentContext, instruction: string): ShopifyOrderSummary[] {
  const intentTexts = planningIntentTexts(ctx, instruction);
  const targets: ShopifyOrderSummary[] = [];
  for (const text of intentTexts) {
    const matched = findReferencedOrder(ctx.recentOrders, text);
    if (matched) targets.push(matched);
  }
  if (targets.length > 0) return targets;

  const wantsRefund = intentTexts.some((text) => /\brefund(?:ed|ing|s)?\b/i.test(text));
  if (wantsRefund && ctx.recentOrders.length === 1) {
    return [ctx.recentOrders[0]];
  }
  return [];
}

function refundTargetsAlreadyFullyRefunded(ctx: AgentContext, instruction: string): boolean {
  const targets = refundTargetOrders(ctx, instruction);
  return targets.length > 0 && targets.every(isOrderFullyRefunded);
}

function refundOrderIdFromToolCall(toolCall: RawToolCall): string | null {
  const input = toolCall.input;
  if (!input || typeof input !== "object") return null;
  const orderId = (input as Record<string, unknown>).order_id;
  return typeof orderId === "string" ? orderId : null;
}

export function shouldBlockCreateRefundForAlreadyRefundedOrder(
  ctx: AgentContext,
  instruction: string,
  rawToolCalls: readonly RawToolCall[],
): boolean {
  if (refundTargetOrders(ctx, instruction).some(isOrderFullyRefunded)) {
    return true;
  }

  return rawToolCalls.some((toolCall) => {
    if (toolCall.name !== "create_refund") return false;
    const orderId = refundOrderIdFromToolCall(toolCall);
    if (!orderId) return false;
    return ctx.recentOrders.some((order) => order.id === orderId && isOrderFullyRefunded(order));
  });
}

export function stripCreateRefundForAlreadyRefundedOrders(
  ctx: AgentContext,
  instruction: string,
  rawToolCalls: RawToolCall[],
): RawToolCall[] {
  if (!shouldBlockCreateRefundForAlreadyRefundedOrder(ctx, instruction, rawToolCalls)) {
    return rawToolCalls;
  }
  return rawToolCalls.filter((toolCall) => toolCall.name !== "create_refund");
}

export function sendReplyHasText(toolCall: RawToolCall): boolean {
  const input = toolCall.input;
  if (!input || typeof input !== "object") return false;
  const text = (input as Record<string, unknown>).text;
  return typeof text === "string" && text.trim().length > 0;
}

export function stripEmptySendReplyToolCalls(rawToolCalls: RawToolCall[]): RawToolCall[] {
  return rawToolCalls.filter((toolCall) => toolCall.name !== "send_reply" || sendReplyHasText(toolCall));
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
  const customerTexts = input.ctx.recentMessages
    .filter((message) => message.senderType === "customer" && message.contentText?.trim())
    .map((message) => message.contentText as string);

  if (hasSuspectedFraudRefundSignals(...customerTexts)) return true;
  if (hasOutOfScopeCommercialRequestSignals(...customerTexts)) return true;
  if (hasForwardedInjectionRefundSignal(...intentTexts)) return true;
  if (hasContradictoryInstructionSignals(...intentTexts)) return true;
  if (shouldEscalateFulfilledCancelRequest(input.ctx, input.instruction)) return true;
  if (hasAmbiguousCustomerSearchResult(input.readBlocks, input.readResultsMap)) return true;

  const resolvedSettings = resolveAgentSettings(input.settings);
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

function customerMessageTexts(ctx: AgentContext): string[] {
  return ctx.recentMessages
    .filter((message) => message.senderType === "customer" && message.contentText?.trim())
    .map((message) => message.contentText as string);
}

function planHasActionTool(rawToolCalls: readonly RawToolCall[]): boolean {
  return rawToolCalls.some((toolCall) => TOOL_CATEGORIES[toolCall.name] === "action");
}

function planHasEscalation(rawToolCalls: readonly RawToolCall[]): boolean {
  return rawToolCalls.some((toolCall) => toolCall.name === "escalate_to_human");
}

function toolsIncludeActionCategory(tools: readonly { name: string }[]): boolean {
  return tools.some((tool) => TOOL_CATEGORIES[tool.name] === "action");
}

export const MUTATIVE_INTENT_NO_ACTION_WARNING =
  "Customer requested a refund/cancel but no action was planned — review before sending.";

export function shouldPreferBrandVoiceOrderStatusReply(
  ctx: AgentContext,
  instruction: string,
  settings?: OrgSettings,
): boolean {
  if (!resolveAgentSettings(settings).brandVoice?.trim()) return false;

  const customerTexts = customerMessageTexts(ctx);
  if (hasActionableMutativeIntent(...customerTexts)) return false;

  const intentTexts = planningIntentTexts(ctx, instruction);
  if (!intentTexts.some((text) => looksLikeOrderStatusIntent(text))) return false;
  if (ctx.recentOrders.length === 0) return false;

  for (const text of intentTexts) {
    if (findReferencedOrder(ctx.recentOrders, text)) return true;
    if (ORDER_REFERENCE_RE.test(text)) return false;
  }

  return true;
}

export function applyBrandVoiceOrderStatusGuard(
  ctx: AgentContext,
  instruction: string,
  settings: OrgSettings | undefined,
  rawToolCalls: RawToolCall[],
): RawToolCall[] {
  if (!shouldPreferBrandVoiceOrderStatusReply(ctx, instruction, settings)) return rawToolCalls;
  return rawToolCalls.filter((toolCall) => (
    toolCall.name !== "escalate_to_human" && TOOL_CATEGORIES[toolCall.name] !== "read"
  ));
}

export function shouldForceMutativeReplan(input: {
  ctx: AgentContext;
  rawToolCalls: readonly RawToolCall[];
  tools: readonly { name: string }[];
  operatorMode: boolean;
  ranReplan: boolean;
}): boolean {
  if (input.operatorMode || input.ranReplan) return false;
  if (!hasMutativeRequestIntent(...customerMessageTexts(input.ctx))) return false;
  if (refundTargetsAlreadyFullyRefunded(input.ctx, "")) return false;
  if (planHasActionTool(input.rawToolCalls)) return false;
  if (planHasEscalation(input.rawToolCalls)) return false;
  return toolsIncludeActionCategory(input.tools);
}

export function shouldSkipReplyDraftForMutativeIntent(
  ctx: AgentContext,
  rawToolCalls: readonly RawToolCall[],
): boolean {
  if (!hasMutativeRequestIntent(...customerMessageTexts(ctx))) return false;
  if (refundTargetsAlreadyFullyRefunded(ctx, "")) return false;
  if (planHasActionTool(rawToolCalls)) return false;
  if (planHasEscalation(rawToolCalls)) return false;
  return true;
}

export function applyMutativeIntentNoActionGuard(
  ctx: AgentContext,
  rawToolCalls: RawToolCall[],
  warnings: string[],
): RawToolCall[] {
  if (!shouldSkipReplyDraftForMutativeIntent(ctx, rawToolCalls)) return rawToolCalls;
  if (!warnings.includes(MUTATIVE_INTENT_NO_ACTION_WARNING)) {
    warnings.push(MUTATIVE_INTENT_NO_ACTION_WARNING);
  }
  return rawToolCalls.filter((toolCall) => toolCall.name !== "send_reply");
}

export function shouldSkipReplyDraftForWatchTier(
  settings: OrgSettings | undefined,
  ctx: AgentContext,
): boolean {
  const resolvedSettings = resolveAgentSettings(settings);
  if (resolvedSettings.autonomyTier !== "watch") return false;
  return hasActionableMutativeIntent(...customerMessageTexts(ctx));
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
