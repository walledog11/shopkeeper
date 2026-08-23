import type { AgentPlan, PlanSignal, PlanSignalSeverity, ProducedPlanSignalCode, RawToolCall } from "./types.js"

// The one place a plan signal's English lives. Producers push a code, consumers
// branch on that code and render this text without ever reading it, so
// rewording a line here cannot change what the agent is allowed to do.
// `legacy_warning` has no entry on purpose: it carries prose stored on a plan
// cached before signals existed, not a message this table owns.
export const PLAN_SIGNAL_MESSAGES: Record<ProducedPlanSignalCode, string> = {
  shopify_customer_unresolved:
    "Couldn't find a Shopify customer - verify the correct account is linked before approving.",
  recent_orders_fetch_failed:
    "Shopify recent-orders pre-fetch failed - verify order details before approving.",
  shopify_lookup_failed:
    "Shopify lookup failed during planning - verify order/customer details before approving.",
  order_not_found:
    "No matching order found - confirm the order number with the customer before proceeding.",
  order_tracking_not_found:
    "No tracking information found - the order may not have been fulfilled yet.",
  product_not_found:
    "No matching product found - the name may be wrong, or the store may not carry it.",
  kb_no_match:
    "No relevant KB articles found - the reply is based only on the conversation, not your documentation.",
  mutative_intent_no_action:
    "Customer requested a refund/cancel but no action was planned — review before sending.",
  circular_channel_deflection:
    "Draft reply deflected the customer to a channel the agent already manages — review before sending.",
  invalid_tool_input:
    "The draft contains a step with invalid or incomplete inputs and cannot be approved as written.",
  duplicate_tool_call_id:
    "The draft reused a step identifier and cannot be approved safely.",
  already_refunded_action:
    "The draft attempted to refund an order that is already fully refunded.",
  orphan_internal_note:
    "The draft included an internal note without a corresponding store action.",
  ungrounded_escalation_reason:
    "The escalation reason claims work that this draft does not perform.",
  ungrounded_customer_reply:
    "The customer reply claims work that this draft does not perform.",
}

// Reads that make an unlinked Shopify customer consequential: the plan leaned on
// customer or order data to write its reply.
const CUSTOMER_OR_ORDER_READ_TOOLS = new Set([
  "search_shopify_customers",
  "get_shopify_customer",
  "get_shopify_orders",
  "get_order_by_name",
  "get_order_tracking",
])

function severityFor(code: ProducedPlanSignalCode, rawToolCalls: RawToolCall[]): PlanSignalSeverity {
  switch (code) {
    // Fires whenever the store has no matching article, which is routine for a
    // KB-light store. A grounding note for the merchant, not an action risk —
    // it must not force an otherwise-clean plan to review.
    case "kb_no_match":
      return "advisory"
    // The one plan-dependent severity: a reply written without touching customer
    // or order data is unaffected by the link being absent.
    case "shopify_customer_unresolved":
      return rawToolCalls.some(toolCall => CUSTOMER_OR_ORDER_READ_TOOLS.has(toolCall.name))
        ? "blocking"
        : "advisory"
    default:
      return "blocking"
  }
}

// Resolves the codes a plan produced against its finished tool calls. Callers
// collect codes while planning and call this once, so severity has one owner.
// Duplicates collapse: the same condition twice is one signal.
export function buildPlanSignals(
  codes: ProducedPlanSignalCode[],
  rawToolCalls: RawToolCall[],
): PlanSignal[] {
  const seen = new Set<ProducedPlanSignalCode>()
  const signals: PlanSignal[] = []
  for (const code of codes) {
    if (seen.has(code)) continue
    seen.add(code)
    signals.push({ code, severity: severityFor(code, rawToolCalls), message: PLAN_SIGNAL_MESSAGES[code] })
  }
  return signals
}

// Signals for a plan from any source, including one cached before signals
// existed. Those carry warnings with no code, so each is surfaced as blocking
// rather than guessed at from its text.
export function planSignals(plan: Pick<AgentPlan, "signals" | "warnings"> | null | undefined): PlanSignal[] {
  if (!plan) return []
  if (plan.signals) return plan.signals
  return (plan.warnings ?? []).map(message => ({
    code: "legacy_warning" as const,
    severity: "blocking" as const,
    message,
  }))
}

export function planSignalTiers(
  plan: Pick<AgentPlan, "signals" | "warnings"> | null | undefined,
): { blocking: PlanSignal[]; advisory: PlanSignal[] } {
  const blocking: PlanSignal[] = []
  const advisory: PlanSignal[] = []
  for (const signal of planSignals(plan)) {
    if (signal.severity === "blocking") blocking.push(signal)
    else advisory.push(signal)
  }
  return { blocking, advisory }
}

export function planHasSignal(
  plan: Pick<AgentPlan, "signals" | "warnings"> | null | undefined,
  code: ProducedPlanSignalCode,
): boolean {
  return planSignals(plan).some(signal => signal.code === code)
}
