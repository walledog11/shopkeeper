// Which model tier plans a support ticket.
//
// Planning is the single most expensive thing the product does: the loop runs on
// the judgment tier, and every iteration re-sends the tool schemas and the
// growing tool-result history. Most tickets do not need that. A customer asking
// "where is my order" or "what's your return window" ends in one send_reply, and
// the cheap tier can write it.
//
// The decision has to be made BEFORE the loop runs, so it cannot use
// `classifyHomePlan` — that reads the planner's output. It uses the classifier
// signals the inbound Haiku pass already wrote to `Thread.classifierSignals`,
// which cost nothing extra because that call happens on every ticket regardless.
//
// Two properties make this safe rather than a quality gamble:
//
//   1. Eligibility is positive, not merely the absence of danger. A ticket
//      qualifies only when the classifier affirmatively called it a policy
//      question or an order-status question AND none of the risk intents fired.
//      No signals at all means not eligible.
//   2. The tier is checked again on the way out. `isLowRiskPlanOutcome` rejects
//      any plan whose non-read tool calls go beyond replying, asking, or
//      escalating — so a mutative action can never be *decided* by the cheap
//      tier, only proposed and thrown away. The caller re-plans on the judgment
//      tier when that happens, costing one wasted cheap call.

import type { AgentContext } from "./agent-context.js";
import type { ClassifierIntents } from "./classifier-signals.js";
import { TOOL_CATEGORIES } from "./tools/registry/index.js";
import type { RawToolCall } from "./types.js";

export type PlannerTierMode = "off" | "low_risk_haiku";

/**
 * Off unless explicitly enabled. This changes which model writes customer-facing
 * replies, so it is gated rather than defaulted on: the standing rule is that no
 * support-planner change ships without an eval-gate run, and the flag is what
 * lets the code merge before that run happens.
 */
export function resolvePlannerTierMode(
  value: string | undefined = process.env.AGENT_PLANNER_TIER_MODE,
): PlannerTierMode {
  if (value === undefined || value.trim() === "") return "off";
  if (value === "off" || value === "low_risk_haiku") return value;
  throw new Error("AGENT_PLANNER_TIER_MODE must be off or low_risk_haiku");
}

// Any one of these means the ticket is not a simple informational reply, no
// matter what else the classifier found.
const DISQUALIFYING_INTENTS: readonly (keyof ClassifierIntents)[] = [
  "mutative_request",
  "fraud_signals",
  "contradiction",
  "out_of_scope_commercial",
  "forwarded_injection",
];

// The ticket shapes the cheap tier is trusted to answer.
const QUALIFYING_INTENTS: readonly (keyof ClassifierIntents)[] = [
  "policy_question",
  "order_status",
];

export interface PlannerTierDecision {
  useLowTier: boolean;
  /** Why, for the log line — this is the field to group by when reviewing rollout. */
  reason:
    | "mode_off"
    | "operator_mode"
    | "no_classifier_signals"
    | "risk_intent"
    | "no_qualifying_intent"
    | "eligible";
}

export function decidePlannerTier(
  ctx: Pick<AgentContext, "classifierSignals">,
  options: { operatorMode: boolean; mode?: PlannerTierMode },
): PlannerTierDecision {
  const mode = options.mode ?? resolvePlannerTierMode();
  if (mode === "off") return { useLowTier: false, reason: "mode_off" };

  // Operator turns are the merchant talking to their own agent, not a customer
  // ticket. They carry the pending-state ledger and the control tools, and they
  // have no classifier signals to reason from.
  if (options.operatorMode) return { useLowTier: false, reason: "operator_mode" };

  const intents = ctx.classifierSignals?.intents;
  if (!intents) return { useLowTier: false, reason: "no_classifier_signals" };

  if (DISQUALIFYING_INTENTS.some((intent) => intents[intent])) {
    return { useLowTier: false, reason: "risk_intent" };
  }
  if (!QUALIFYING_INTENTS.some((intent) => intents[intent])) {
    return { useLowTier: false, reason: "no_qualifying_intent" };
  }
  return { useLowTier: true, reason: "eligible" };
}

/**
 * The one category the cheap tier may never land on.
 *
 * Expressed as a category rather than a tool allowlist on purpose: `action` is
 * exactly the set that touches money or the merchant's Shopify data, and a rule
 * keyed to it stays correct when tools are added. A new refund-shaped tool is
 * rejected the day it lands, with no edit here — whereas a name list would
 * silently admit it.
 *
 * Everything else is safe to decide down-tier: `read` has no effects, `internal`
 * is thread bookkeeping (notes, tags, status) plus `escalate_to_human` and
 * `ask_operator` — the agent declining to act, which is the direction we want a
 * weaker model to fail in — and `communication` is the reply itself, which is
 * the entire point of the downgrade.
 */
const LOW_TIER_SAFE_CATEGORIES: ReadonlySet<string> = new Set([
  "read",
  "internal",
  "communication",
]);

/**
 * True when no tool call in the plan mutates the store. False means the cheap
 * tier proposed real work and the plan must be discarded and re-planned on the
 * judgment tier.
 *
 * Written as "every call is in a known-safe category" rather than "no call is an
 * action" so an unrecognized tool name — which has no category at all — fails
 * closed and forces the judgment tier instead of slipping through.
 */
export function isLowRiskPlanOutcome(rawToolCalls: readonly RawToolCall[]): boolean {
  return rawToolCalls.every(
    (toolCall) => LOW_TIER_SAFE_CATEGORIES.has(TOOL_CATEGORIES[toolCall.name] ?? ""),
  );
}
