import type Anthropic from "@anthropic-ai/sdk";
import logger from "./logger.js";
import type { OrgSettings, ProducedPlanSignalCode } from "./types.js";
import { executeToolStructured } from "./tools/executor.js";
import type { ToolStatus } from "./tools/result.js";
import type { AgentContext, ShopifyOrderSummary } from "./agent-context.js";
import { isStorefrontContext } from "./guest-policy.js";
import { normalizeOrderName } from "./order-reference.js";

type PlanningReadToolResult = {
  readToolCalls: string[];
  readResultsMap: Map<string, string>;
  readStatusMap: Map<string, ToolStatus>;
};

// Whether the order a lookup tool was asked about is already in the planning
// context. If so, a live not-found is fixture/timing noise, not a real "order
// not found", and must not raise the signal that downgrades the auto-execute
// classifier.
function orderAlreadyInContext(block: Anthropic.ToolUseBlock, recentOrders: ShopifyOrderSummary[]): boolean {
  if (recentOrders.length === 0) return false;
  if (block.name === "get_order_by_name") {
    const requested = (block.input as { order_name?: unknown }).order_name;
    if (typeof requested !== "string" || !requested.trim()) return false;
    const target = normalizeOrderName(requested);
    return recentOrders.some(o => normalizeOrderName(o.name) === target);
  }
  // get_shopify_orders is a customer-wide fetch: if context already holds the
  // customer's orders, the redundant live lookup failing is noise.
  return true;
}

// The order a get_order_tracking call targets, if it is already in the planning
// context. get_order_tracking takes a numeric order_id; match it against the
// ids already loaded so a tracking lookup on a known order can be answered from
// context instead of a live fetch.
function trackedOrderInContext(input: unknown, recentOrders: ShopifyOrderSummary[]): ShopifyOrderSummary | null {
  const orderId = (input as { order_id?: unknown }).order_id;
  if (typeof orderId !== "string" || !orderId.trim()) return null;
  return recentOrders.find((o) => o.id === orderId.trim()) ?? null;
}

// Synthetic get_order_tracking result for an order already in context. Keeps the
// capture loop from stranding into an escalation when tracking is unavailable:
// an unshipped order has no tracking to fetch, and a fulfilled order with no live
// tracking is still answerable from its status. Either way, steer the model to
// reply from the order data rather than escalate a routine status question.
function trackingContextSteer(order: ShopifyOrderSummary): string {
  const state = `This order (${order.name}) is already in your context: fulfillment_status=${order.fulfillment_status ?? "null"}, financial_status=${order.financial_status}.`;
  return order.fulfillment_status === null
    ? `${state} It has not shipped yet, so there is no carrier tracking to fetch. Tell the customer it has not shipped yet, from this status, and call send_reply now. Do not escalate_to_human or ask_operator for this routine status question.`
    : `${state} No live carrier tracking is available right now, but this status is enough to answer a routine "where is my order?" question. Reply from it with send_reply now. Do not escalate_to_human or ask_operator just because tracking details are unavailable.`;
}

export function appendInitialPlanningSignals(input: {
  ctx: AgentContext;
  operatorMode: boolean;
  codes: ProducedPlanSignalCode[];
}): void {
  const { ctx, operatorMode, codes } = input;
  if (ctx.recentOrdersFetchFailed) {
    codes.push("recent_orders_fetch_failed");
  }
  // A guest shopper has no Shopify customer by construction, so this would fire
  // on every storefront plan and ask the merchant to verify a link that cannot
  // exist. A signal present on every plan is a signal nobody reads.
  if (ctx.shopify && !ctx.thread.shopifyCustomerId && !operatorMode && !isStorefrontContext(ctx)) {
    codes.push("shopify_customer_unresolved");
  }
}

export async function executePlanningReadTools(input: {
  ctx: AgentContext;
  settings?: OrgSettings;
  readBlocks: Anthropic.ToolUseBlock[];
}): Promise<PlanningReadToolResult> {
  const { ctx, settings, readBlocks } = input;
  const readToolCalls: string[] = [];
  const readResultsMap = new Map<string, string>();
  const readStatusMap = new Map<string, ToolStatus>();

  await Promise.all(
    readBlocks.map(async (b) => {
      readToolCalls.push(b.name);
      const toolStartedAt = Date.now();
      const inputKeys = b.input && typeof b.input === "object" ? Object.keys(b.input) : [];
      logger.info({
        orgId: ctx.orgId,
        threadId: ctx.thread.id,
        tool: b.name,
        inputKeys,
        inputChars: JSON.stringify(b.input ?? null).length,
      }, "[agent:plan] read tool call");
      let content: string;
      let status: ToolStatus;
      const trackedOrder = b.name === "get_order_tracking"
        ? trackedOrderInContext(b.input, ctx.recentOrders)
        : null;
      if (trackedOrder && trackedOrder.fulfillment_status === null) {
        // Unshipped order in context: no tracking exists to fetch - skip the live
        // call and steer to a context reply.
        content = trackingContextSteer(trackedOrder);
        status = "ok";
      } else {
        try {
          const executed = await executeToolStructured(b.name, b.input, ctx, settings);
          content = executed.message;
          status = executed.status;
        } catch {
          // A thrown lookup is treated as "nothing found" for signal purposes.
          content = "Lookup failed";
          status = "not_found";
        }
        if (trackedOrder && status !== "ok") {
          // Fulfilled order in context but no live tracking available: answer from
          // its status rather than let an empty tracking result trigger an escalation.
          content = trackingContextSteer(trackedOrder);
          status = "ok";
        }
      }
      logger.info({
        orgId: ctx.orgId,
        threadId: ctx.thread.id,
        tool: b.name,
        durationMs: Date.now() - toolStartedAt,
        resultChars: content.length,
      }, "[agent:plan] read tool result");
      readResultsMap.set(b.id, content);
      readStatusMap.set(b.id, status);
    })
  );

  return { readToolCalls, readResultsMap, readStatusMap };
}

export function appendPlanningReadSignals(input: {
  codes: ProducedPlanSignalCode[];
  readBlocks: Anthropic.ToolUseBlock[];
  readResultsMap: Map<string, string>;
  readStatusMap: Map<string, ToolStatus>;
  recentOrders: ShopifyOrderSummary[];
}): void {
  const { codes, readBlocks, readResultsMap, readStatusMap, recentOrders } = input;
  const readBlocksById = new Map(readBlocks.map((block) => [block.id, block]));
  let hasShopifyCustomerSignal = codes.includes("shopify_customer_unresolved");
  for (const id of readResultsMap.keys()) {
    const block = readBlocksById.get(id);
    if (!block) continue;
    const status = readStatusMap.get(id);
    const isMissing = status === "not_found";
    const isCustomerRead = block.name === "find_customer"
      || block.name === "get_shopify_customer"
      || block.name === "search_shopify_customers";
    const isLookupError = status === "error"
      && (isCustomerRead
        || block.name === "get_shopify_orders"
        || block.name === "get_order_by_name");
    if (isLookupError) {
      codes.push("shopify_lookup_failed");
    } else if (isMissing) {
      if (isCustomerRead && !hasShopifyCustomerSignal) {
        codes.push("shopify_customer_unresolved");
        hasShopifyCustomerSignal = true;
      } else if (block.name === "get_shopify_orders" || block.name === "get_order_by_name") {
        if (!orderAlreadyInContext(block, recentOrders)) {
          codes.push("order_not_found");
        }
      } else if (block.name === "get_order_tracking") {
        codes.push("order_tracking_not_found");
      } else if (block.name === "search_shopify_products") {
        codes.push("product_not_found");
      } else if (block.name === "search_kb") {
        codes.push("kb_no_match");
      }
    }
  }
}
