import type { AgentContext, ShopifyOrderSummary } from "../agent-context.js"
import { planningIntentTexts } from "../intent.js"
import { findReferencedOrder } from "../order-reference.js"
import type { RawToolCall } from "../types.js"

function isOrderFullyRefunded(order: ShopifyOrderSummary): boolean {
  return order.financial_status?.toLowerCase() === "refunded"
}

export function refundTargetOrders(
  ctx: AgentContext,
  instruction: string,
): ShopifyOrderSummary[] {
  const intentTexts = planningIntentTexts(ctx, instruction)
  const targets: ShopifyOrderSummary[] = []
  for (const text of intentTexts) {
    const matched = findReferencedOrder(ctx.recentOrders, text)
    if (matched) targets.push(matched)
  }
  if (targets.length > 0) return targets

  const wantsRefund = intentTexts.some(text => /\brefund(?:ed|ing|s)?\b/i.test(text))
  if (wantsRefund && ctx.recentOrders.length === 1) {
    return [ctx.recentOrders[0]]
  }
  return []
}

export function refundTargetsAlreadyFullyRefunded(
  ctx: AgentContext,
  instruction: string,
): boolean {
  const targets = refundTargetOrders(ctx, instruction)
  return targets.length > 0 && targets.every(isOrderFullyRefunded)
}

function refundOrderIdFromToolCall(toolCall: RawToolCall): string | null {
  const input = toolCall.input
  if (!input || typeof input !== "object") return null
  const orderId = (input as Record<string, unknown>).order_id
  return typeof orderId === "string" ? orderId : null
}

export function shouldBlockCreateRefundForAlreadyRefundedOrder(
  ctx: AgentContext,
  instruction: string,
  rawToolCalls: readonly RawToolCall[],
): boolean {
  if (refundTargetOrders(ctx, instruction).some(isOrderFullyRefunded)) {
    return true
  }

  return rawToolCalls.some(toolCall => {
    if (toolCall.name !== "create_refund") return false
    const orderId = refundOrderIdFromToolCall(toolCall)
    if (!orderId) return false
    return ctx.recentOrders.some(order => order.id === orderId && isOrderFullyRefunded(order))
  })
}

export function stripCreateRefundForAlreadyRefundedOrders(
  ctx: AgentContext,
  instruction: string,
  rawToolCalls: RawToolCall[],
): RawToolCall[] {
  if (!shouldBlockCreateRefundForAlreadyRefundedOrder(ctx, instruction, rawToolCalls)) {
    return rawToolCalls
  }
  return rawToolCalls.filter(toolCall => toolCall.name !== "create_refund")
}

export function sendReplyHasText(toolCall: RawToolCall): boolean {
  const input = toolCall.input
  if (!input || typeof input !== "object") return false
  const text = (input as Record<string, unknown>).text
  return typeof text === "string" && text.trim().length > 0
}

export function stripEmptySendReplyToolCalls(rawToolCalls: RawToolCall[]): RawToolCall[] {
  return rawToolCalls.filter(toolCall => toolCall.name !== "send_reply" || sendReplyHasText(toolCall))
}
