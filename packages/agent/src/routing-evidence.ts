/**
 * Every plan routing evidence code, with the fixed merchant-facing reason for
 * each one that escalates. A code with a reason makes `decideAutonomy` escalate;
 * one with `null` routes some other way (a question, a review). The union, the
 * escalating set, the reasons and the cache decoder's code list all derive from
 * this table, so a new code is one line here and cannot half-exist.
 */
const PLAN_ROUTING_EVIDENCE = {
  classifier_unavailable: null,
  classifier_unaligned: null,
  fraud_risk: "Possible fraud signals (chargeback/dispute language or urgent non-receipt) — needs human review.",
  forwarded_prompt_injection: "Message claims a prior authorization for a refund — needs human verification.",
  contradictory_request: "Customer made contradictory requests in one message — needs a human to clarify.",
  out_of_scope_commercial_request: "Wholesale, bulk, or B2B inquiry — out of scope for automated support.",
  fulfilled_cancellation_request: "Cancellation requested for an already-fulfilled order — needs human review.",
  fulfilled_address_change_request: "Address change requested for an already-fulfilled order — needs human review.",
  already_refunded_request: "Refund requested for an order that is already fully refunded — needs human review.",
  non_paid_refund_request: "Refund requested for an order whose payment is not in the paid state — needs human review.",
  compensation_exception: "Compensation was requested but the plan contains no safe compensation action — needs human review.",
  ambiguous_customer: "Multiple matching customers found — needs a human to confirm identity.",
  critical_planning_read_failure: "Order or customer lookup failed — could not verify details to act safely.",
  compensation_over_cap: "Compensation above the workspace limit was planned — needs human review.",
  damage_photo_missing: "Customer reports a damaged or defective item without a photo — over to you.",
  order_unconfirmed: "The sender could not confirm the order is theirs — over to you.",
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
