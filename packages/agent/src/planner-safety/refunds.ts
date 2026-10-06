import type { AgentContext, ShopifyOrderSummary } from "../agent-context.js"
import type { RequestAsk } from "../classifier-signals.js"
import { requestTargetOrders } from "./request.js"
import type { RawToolCall } from "../types.js"

function isOrderFullyRefunded(order: ShopifyOrderSummary): boolean {
  return order.financial_status?.toLowerCase() === "refunded"
}

function isOrderPaid(order: ShopifyOrderSummary): boolean {
  return order.financial_status?.toLowerCase() === "paid"
}

const REFUND_ASKS: ReadonlySet<RequestAsk> = new Set(["refund"])
const REFUND_TOOLS: ReadonlySet<string> = new Set(["create_refund", "create_partial_refund"])

export function refundTargetsAlreadyFullyRefunded(
  ctx: AgentContext,
  rawToolCalls: readonly RawToolCall[] = [],
): boolean {
  return requestTargetOrders(ctx, REFUND_ASKS, REFUND_TOOLS, rawToolCalls).some(isOrderFullyRefunded)
}

export function refundTargetsNonPaidOrder(
  ctx: AgentContext,
  rawToolCalls: readonly RawToolCall[],
): boolean {
  return requestTargetOrders(ctx, REFUND_ASKS, REFUND_TOOLS, rawToolCalls).some(order => !isOrderPaid(order))
}

export function shouldBlockCreateRefundForAlreadyRefundedOrder(
  ctx: AgentContext,
  rawToolCalls: readonly RawToolCall[],
): boolean {
  return refundTargetsAlreadyFullyRefunded(ctx, rawToolCalls)
}

export function sendReplyHasText(toolCall: RawToolCall): boolean {
  const input = toolCall.input
  if (!input || typeof input !== "object") return false
  const text = (input as Record<string, unknown>).text
  return typeof text === "string" && text.trim().length > 0
}
