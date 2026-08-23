import type Anthropic from "@anthropic-ai/sdk"
import type { AgentContext } from "../agent-context.js"
import { planningIntentTexts } from "../intent.js"
import { findReferencedOrder } from "../order-reference.js"
import type { ToolStatus } from "../tools/result.js"

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

export function shouldEscalateFulfilledCancelRequest(
  ctx: AgentContext,
  instruction: string,
): boolean {
  const intentTexts = planningIntentTexts(ctx, instruction)
  const wantsCancel = intentTexts.some(text => /\bcancel(?:lation|led|ing)?\b/i.test(text))
  return wantsCancel && ctx.recentOrders.some(order => order.fulfillment_status === "fulfilled")
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

  const referenced = findReferencedOrder(ctx.recentOrders, requestText)
  const targets = referenced
    ? [referenced]
    : ctx.recentOrders.length === 1
      ? [ctx.recentOrders[0]]
      : []
  return targets.some(order => order.fulfillment_status === "fulfilled")
}
