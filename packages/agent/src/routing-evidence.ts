// What a merchant can do about a compensation over their limit, which holds even
// with their approval.
export const OVER_CAP_NEXT_STEP = "Issue it yourself in Shopify, or raise the limit in Settings → Approvals & limits.";

/**
 * Every plan routing evidence code, with the fixed merchant-facing reason for
 * each one that escalates, worded to follow the card's "This one needs you:". A code with a reason makes `decideAutonomy` escalate;
 * one with `null` routes some other way (a question, a review). The union, the
 * escalating set, the reasons and the cache decoder's code list all derive from
 * this table, so a new code is one line here and cannot half-exist.
 */
const PLAN_ROUTING_EVIDENCE = {
  classifier_unavailable: null,
  classifier_unaligned: null,
  fraud_risk: "It has signs of possible fraud, like chargeback or dispute language or an urgent claim it never arrived.",
  forwarded_prompt_injection: "The message claims someone already approved a refund. Check that yourself before doing anything.",
  contradictory_request: "They asked for two things that contradict each other, so it needs you to ask what they mean.",
  out_of_scope_commercial_request: "It's a wholesale or bulk inquiry, which I don't handle.",
  fulfilled_cancellation_request: "They want to cancel an order that has already been fulfilled.",
  fulfilled_address_change_request: "They want to change the address on an order that has already been fulfilled.",
  already_refunded_request: "They asked for a refund on an order that's already fully refunded.",
  non_paid_refund_request: "They asked for a refund on an order that isn't marked paid.",
  compensation_exception: "They asked for compensation, and I don't have a safe way to give it on this order.",
  ambiguous_customer: "More than one customer matches, so it needs you to confirm who this is.",
  critical_planning_read_failure: "I couldn't look up the order or customer, so I can't act on it safely.",
  compensation_over_cap: `The amount is over your limit for a single refund or gift card. ${OVER_CAP_NEXT_STEP}`,
  damage_photo_missing: "They say the item is damaged or doesn't work, and haven't sent a photo.",
  order_unconfirmed: "They couldn't confirm the order is theirs.",
  policy_gap: null,
  kb_gap: null,
  circular_channel_deflection: null,
} as const satisfies Record<string, string | null>;

export type PlanRoutingEvidenceCode = keyof typeof PLAN_ROUTING_EVIDENCE;

export const PLAN_ROUTING_EVIDENCE_CODES = Object.keys(PLAN_ROUTING_EVIDENCE) as PlanRoutingEvidenceCode[];

/** The fixed reason an escalating code gives the merchant; null when it does not escalate. */
export function escalationReasonFor(code: PlanRoutingEvidenceCode): string | null {
  return PLAN_ROUTING_EVIDENCE[code];
}

export function isEscalationEvidence(code: PlanRoutingEvidenceCode): boolean {
  return PLAN_ROUTING_EVIDENCE[code] !== null;
}
