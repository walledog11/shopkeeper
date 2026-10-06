import type Anthropic from "@anthropic-ai/sdk"
import type { AgentContext } from "../agent-context.js"
import type { RequestAsk } from "../classifier-signals.js"
import { requestTargetOrders } from "./request.js"
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

const CANCEL_ASKS: ReadonlySet<RequestAsk> = new Set(["cancel"])
const CANCEL_TOOLS: ReadonlySet<string> = new Set(["cancel_order"])
const ADDRESS_ASKS: ReadonlySet<RequestAsk> = new Set(["address_change"])
const ADDRESS_TOOLS: ReadonlySet<string> = new Set(["update_shopify_order_address"])

export function shouldEscalateFulfilledCancelRequest(
  ctx: AgentContext,
  rawToolCalls: readonly RawToolCall[] = [],
): boolean {
  return requestTargetOrders(ctx, CANCEL_ASKS, CANCEL_TOOLS, rawToolCalls)
    .some(order => order.fulfillment_status === "fulfilled")
}

export function shouldEscalateFulfilledAddressChangeRequest(
  ctx: AgentContext,
  rawToolCalls: readonly RawToolCall[] = [],
): boolean {
  return requestTargetOrders(ctx, ADDRESS_ASKS, ADDRESS_TOOLS, rawToolCalls)
    .some(order => order.fulfillment_status === "fulfilled")
}
