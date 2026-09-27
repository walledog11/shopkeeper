import type Anthropic from "@anthropic-ai/sdk"
import type { AgentContext, ShopifyOrderSummary } from "../agent-context.js"
import { planningIntentTexts } from "../intent.js"
import { findReferencedOrder } from "../order-reference.js"
import type { ToolStatus } from "../tools/result.js"
import type { RawToolCall } from "../types.js"

const ORDER_LOOKUP_TOOLS = new Set([
  "get_order_by_name",
  "get_shopify_orders",
  "find_customer",
  "get_shopify_customer",
  "search_shopify_customers",
])

// find_customer answers both "who is this" and "what is on their record", and
// only the first can come back ambiguous. The result shape is the discriminator
// — a by='query' lookup returns the match list, a by='id' lookup returns one
// object — so this reads the result rather than re-reading the call's arguments.
const CUSTOMER_SEARCH_TOOLS = new Set(["find_customer", "search_shopify_customers"])

export function hasCriticalPlanningReadErrorsForBlocks(
  readBlocks: readonly Anthropic.ToolUseBlock[],
  readStatusMap: ReadonlyMap<string, ToolStatus>,
): boolean {
  return readBlocks.some(
    block => ORDER_LOOKUP_TOOLS.has(block.name) && readStatusMap.get(block.id) === "error",
  )
}

export function hasAmbiguousCustomerSearchResult(
  readBlocks: readonly Anthropic.ToolUseBlock[],
  readResultsMap: ReadonlyMap<string, string>,
): boolean {
  for (const block of readBlocks) {
    if (!CUSTOMER_SEARCH_TOOLS.has(block.name)) continue
    const raw = readResultsMap.get(block.id)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 1) return true
    } catch {
      continue
    }
  }
  return false
}

// The orders a request is about: the one its text names, else the customer's
// only order. With several orders and none named, it is about none in
// particular, and another order's state says nothing about it.
function requestTargetOrders(ctx: AgentContext, requestText: string): ShopifyOrderSummary[] {
  const referenced = findReferencedOrder(ctx.recentOrders, requestText)
  if (referenced) return [referenced]
  return ctx.recentOrders.length === 1 ? [ctx.recentOrders[0]] : []
}

export function shouldEscalateFulfilledCancelRequest(
  ctx: AgentContext,
  instruction: string,
  rawToolCalls: readonly RawToolCall[] = [],
): boolean {
  const requestText = planningIntentTexts(ctx, instruction)
    .find(text => /\bcancel(?:lation|led|ing)?\b/i.test(text))
  if (!requestText) return false

  const proposedIds = new Set(rawToolCalls
    .filter(toolCall => toolCall.name === "cancel_order")
    .map(toolCall => String((toolCall.input as { order_id?: unknown } | null)?.order_id ?? "")))
  const targets = [
    ...requestTargetOrders(ctx, requestText),
    ...ctx.recentOrders.filter(order => proposedIds.has(String(order.id))),
  ]
  return targets.some(order => order.fulfillment_status === "fulfilled")
}

export function shouldEscalateFulfilledAddressChangeRequest(
  ctx: AgentContext,
  instruction: string,
): boolean {
  const requestText = planningIntentTexts(ctx, instruction).find(text => {
    const lower = text.toLowerCase()
    return /\b(address|shipping)\b/.test(lower)
      && /\b(change|update|edit|correct|redirect|wrong)\b/.test(lower)
  })
  if (!requestText) return false

  return requestTargetOrders(ctx, requestText).some(order => order.fulfillment_status === "fulfilled")
}
