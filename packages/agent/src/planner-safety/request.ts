import type { AgentContext, ShopifyOrderSummary } from "../agent-context.js";
import { classifierAlignmentState, type RequestAsk } from "../classifier-signals.js";
import { findOrderByName } from "../order-reference.js";
import type { RawToolCall } from "../types.js";

/** Classification is request context, never evidence of permission or provider state. */
export function currentRequestSignals(ctx: AgentContext) {
  return classifierAlignmentState(
    ctx.classifierSignals, ctx.thread.requestSourceMessageId, ctx.thread.latestCustomerMessageId,
  ) === "aligned" ? ctx.classifierSignals : null;
}

/** Resolve current classified targets and proposed tool targets independently. */
export function requestTargetOrders(
  ctx: AgentContext,
  asks: ReadonlySet<RequestAsk>,
  tools: ReadonlySet<string>,
  rawToolCalls: readonly RawToolCall[],
): ShopifyOrderSummary[] {
  const proposedIds = new Set(rawToolCalls.filter(call => tools.has(call.name)).flatMap(call => {
    const id = (call.input as { order_id?: unknown } | null)?.order_id;
    return typeof id === "string" ? [id] : [];
  }));
  const targets = ctx.recentOrders.filter(order => proposedIds.has(order.id));
  const facts = currentRequestSignals(ctx)?.requestFacts;
  if (facts && (asks.has(facts.ask) || (facts.alternative !== null && asks.has(facts.alternative)))) {
    // An explicit missing order cannot silently become the customer's sole order.
    const requested = facts.order
      ? findOrderByName(ctx.recentOrders, facts.order)
      : ctx.recentOrders.length === 1 ? ctx.recentOrders[0] : null;
    if (requested && !targets.some(order => order.id === requested.id)) targets.push(requested);
  }
  return targets;
}
