import type Anthropic from "@anthropic-ai/sdk"
import type { AgentContext } from "../agent-context.js"
import { planningIntentTexts } from "../intent.js"
import type { ToolStatus } from "../tools/result.js"

const ORDER_LOOKUP_TOOLS = new Set([
  "get_order_by_name",
  "get_shopify_orders",
  "get_shopify_customer",
  "search_shopify_customers",
])

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
    if (block.name !== "search_shopify_customers") continue
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

export const MUTATIVE_INTENT_NO_ACTION_WARNING =
  "Customer requested a refund/cancel but no action was planned — review before sending."

export function shouldEscalateFulfilledCancelRequest(
  ctx: AgentContext,
  instruction: string,
): boolean {
  const intentTexts = planningIntentTexts(ctx, instruction)
  const wantsCancel = intentTexts.some(text => /\bcancel(?:lation|led|ing)?\b/i.test(text))
  return wantsCancel && ctx.recentOrders.some(order => order.fulfillment_status === "fulfilled")
}
