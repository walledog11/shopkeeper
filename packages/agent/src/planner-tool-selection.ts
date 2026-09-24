import type Anthropic from "@anthropic-ai/sdk";
import type { ClassifierSignals } from "./classifier-signals.js";
import { TOOL_DEFINITIONS } from "./tools/registry/index.js";
import type { AgentToolDefinition } from "./tools/registry/types.js";

export const NAMESPACE_MISS_TOOL_NAME = "request_wider_tool_set";

// Planning-only control signal. It is deliberately not part of the executable
// registry: a model can ask the planner for one clean, widened retry, but no
// cached plan can ever execute this as an action.
const NAMESPACE_MISS_TOOL: Anthropic.Tool = {
  name: NAMESPACE_MISS_TOOL_NAME,
  description:
    "Call this only when the customer's request requires a capability that is not present in the current tool list. Name the missing capability. Do not use it for missing facts, policy uncertainty, fraud, or out-of-scope work; use ask_operator or escalate_to_human for those.",
  input_schema: {
    type: "object",
    properties: {
      capability: {
        type: "string",
        description: "The concrete missing capability, such as 'change customer email' or 'create a replacement order'.",
      },
    },
    required: ["capability"],
    additionalProperties: false,
  },
};

export const DISCOVERY_TOOL_NAME = "discover_capabilities";

// Planning-only loop control, and the replacement for the namespace-miss retry:
// instead of ending the attempt and re-planning against the whole registry, it
// answers with the authorized schemas that match and the loop continues with
// them. Like the namespace-miss tool it is deliberately not in the executable
// registry — discovery has no commercial effect and is never a plan step.
const DISCOVERY_TOOL: Anthropic.Tool = {
  name: DISCOVERY_TOOL_NAME,
  description:
    "Call this when handling the request needs a capability that is not in your current tool list. Name the concrete capability, such as 'refund an order' or 'change the shipping address'. Matching tools you are authorized for become available on your next step. An empty answer means no such capability is available to you: ask, investigate differently, or escalate rather than calling this again for the same thing.",
  input_schema: {
    type: "object",
    properties: {
      capability: {
        type: "string",
        description: "The concrete capability you need, such as 'refund an order' or 'create a replacement order'.",
      },
    },
    required: ["capability"],
    additionalProperties: false,
  },
};

type PlanningToolBucket =
  | "full"
  | "risk"
  | "no_request"
  | "policy"
  | "order_status"
  | "order_mutation";

type PlanningToolSelectionReason =
  | "operator"
  | "storefront_policy"
  | "merchant_answer_replan"
  | "merchant_instruction"
  | "ambiguous_customer_follow_up"
  | "no_classifier_signals"
  | "classifier_unaligned"
  | "unclassified_request"
  | "intent_bucket";

type NamespaceMissReason = "empty_plan" | "incomplete_plan" | "model_signal";

export interface PlanningToolSelection {
  tools: Anthropic.Tool[];
  bucket: string;
  reason: PlanningToolSelectionReason;
  narrowed: boolean;
}

interface SelectPlanningToolsInput {
  availableTools: readonly Anthropic.Tool[];
  classifierSignals?: ClassifierSignals | null;
  requestSourceMessageId?: string | null;
  latestCustomerMessageId?: string | null;
  operatorMode: boolean;
  storefrontMode: boolean;
  merchantAnswerReplan: boolean;
  // The instruction was authored by the merchant, not derived from the
  // customer's message. Intent narrowing reads intents the classifier took from
  // what the *customer* said, so applying it here would let a status question
  // hide a tool the merchant explicitly asked for.
  merchantInstruction?: boolean;
  // The caller plans on the discovery runtime: an absent, stale or inconclusive
  // classification takes the compact starter set rather than the whole registry,
  // and a narrowed set carries discovery rather than the namespace-miss retry.
  // Absent for every legacy caller, which keeps both full-registry fallbacks.
  capabilityDiscovery?: boolean;
  // The classifier resolved a terse follow-up to no unique conversational
  // referent. This is a clarification turn, so it may answer the customer but
  // may not widen into an action the customer did not unambiguously select.
  ambiguousCustomerFollowUp?: boolean;
}

const CONTROL_TOOL_NAMES = [
  "add_internal_note",
  "update_thread_status",
  "update_thread_tag",
  "escalate_to_human",
  "ask_operator",
  "send_reply",
] as const;

const ORDER_READ_TOOL_NAMES = [
  "find_customer",
  "get_shopify_orders",
  "get_order_by_name",
  "get_order_fulfillment_status",
  "get_order_tracking",
] as const;

const MUTATION_COMMON_TOOL_NAMES = [
  "search_kb",
  "search_shopify_products",
  // An exchange or a replacement is only offerable if the thing is in stock.
  "get_inventory_status",
  ...ORDER_READ_TOOL_NAMES,
] as const;

// The compact authorized starter set: the question/reply controls plus the KB,
// product and order reads a turn opens with. Every mutation is reached through
// discovery instead of being loaded by default, which is what replaces the full
// registry as the answer to an absent or stale classification.
const STARTER_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  ...CONTROL_TOOL_NAMES,
  ...MUTATION_COMMON_TOOL_NAMES,
]);

// The legacy runtime's answer to any mutative request: every order write at
// once, because the classifier says a write is wanted without saying which.
// Reached only with capability discovery off; under discovery these are what
// `discover_capabilities` returns, one named capability at a time.
export const BROAD_ORDER_MUTATION_TOOL_NAMES = [
  "update_shopify_order_address",
  "create_refund",
  "create_partial_refund",
  "cancel_order",
  "edit_shopify_order",
  "create_return",
  "create_exchange",
  "create_gift_card",
  "attach_return_label",
] as const;

// Tools no customer intent may unlock. They stay reachable through the
// merchant-authored fail-opens above, and through the designed escape when a
// request genuinely needs one of them: the namespace-miss retry on the legacy
// runtime, a named discovery call on the discovery one.
//
// The list is explicit so the coverage test can tell a deliberate exclusion from
// an accidental one. A tool added to the registry with neither a bucket nor an
// entry here is unreachable by omission and fails that test — which is how
// fulfill_order's absence should have surfaced instead of showing up as a
// merchant instruction silently answered with "hasn't shipped yet".
export const NARROWING_EXEMPT_TOOL_NAMES = [
  // Merchant-initiated order operations. A customer asking for a refund or a
  // cancellation must never widen into creating or fulfilling an order.
  "fulfill_order",
  "create_shopify_order",
  // Customer-record writes. Reachable after a namespace-miss retry; see
  // planner.test.ts, which pins them out of the first call and into the second.
  "update_shopify_customer_info",
  "add_shopify_customer_note",
  // Operator/insights reporting; operator turns take the operatorMode fail-open.
  "get_support_stats",
  // Proactive outbound to an arbitrary address. A customer-request turn answers
  // in the thread with send_reply; reaching out is an operator action.
  "send_email",
] as const;

const RISK_INTENTS = [
  "fraud_signals",
  "contradiction",
  "out_of_scope_commercial",
  "forwarded_injection",
] as const;

function classifierIsAligned(input: SelectPlanningToolsInput): boolean {
  const source = input.requestSourceMessageId;
  const latest = input.latestCustomerMessageId;
  // Package tests and host modules that predate alignment metadata omit both.
  // Production supplies both, and narrowing is allowed only for an exact match.
  if (source === undefined && latest === undefined) return true;
  return Boolean(source && latest && source === latest);
}

function fullSelection(
  availableTools: readonly Anthropic.Tool[],
  reason: Exclude<PlanningToolSelectionReason, "intent_bucket">,
): PlanningToolSelection {
  return {
    tools: [...availableTools],
    bucket: "full",
    reason,
    narrowed: false,
  };
}

/**
 * What the discovery runtime returns where the legacy runtime returns the whole
 * registry. The set is the same for every one of those reasons because the
 * reason is exactly the thing that is unknown: nothing here is evidence about
 * which mutation the request needs, so discovery answers that when it arises.
 */
function starterSelection(
  availableTools: readonly Anthropic.Tool[],
  reason: Exclude<PlanningToolSelectionReason, "intent_bucket">,
): PlanningToolSelection {
  const selected = availableTools.filter((tool) => STARTER_TOOL_NAMES.has(tool.name));
  return {
    tools: [...selected, DISCOVERY_TOOL],
    bucket: "starter",
    reason,
    narrowed: true,
  };
}

function addBucket(
  buckets: Set<PlanningToolBucket>,
  names: Set<string>,
  bucket: PlanningToolBucket,
  toolNames: readonly string[],
): void {
  buckets.add(bucket);
  for (const name of toolNames) names.add(name);
}

/**
 * Narrow aligned customer plans by the classifier's typed intent output.
 * Unknown or internally inconsistent request shapes retain the full registry on
 * the legacy runtime, where a false negative costs tokens while a false positive
 * can hide a capability, and take the starter set plus discovery on the
 * discovery runtime, where the same false positive is recoverable in-loop.
 *
 * RequestFacts deliberately do not participate. The eval suite grades the
 * boolean intent vocabulary on planner behavior; the facts fields are a
 * renderer contract. Using them here would create a second, ungraded routing
 * contract and would hide adjacent mutation tools from the fixtures added to
 * protect those exact boundaries.
 */
export function selectPlanningTools(input: SelectPlanningToolsInput): PlanningToolSelection {
  // An actor's own authorized set, not an error fallback: an operator, a
  // storefront shopper and a merchant-authored instruction each plan against
  // everything they hold, so discovery has nothing to add to them.
  if (input.operatorMode) return fullSelection(input.availableTools, "operator");
  if (input.storefrontMode) return fullSelection(input.availableTools, "storefront_policy");
  if (input.merchantAnswerReplan) {
    return fullSelection(input.availableTools, "merchant_answer_replan");
  }
  if (input.merchantInstruction) {
    return fullSelection(input.availableTools, "merchant_instruction");
  }
  if (input.ambiguousCustomerFollowUp) {
    return {
      tools: input.availableTools.filter((tool) => tool.name === "send_reply"),
      bucket: "clarification",
      reason: "ambiguous_customer_follow_up",
      narrowed: true,
    };
  }

  // Everything below is a classification failure. The legacy runtime answers
  // each with the full registry; the discovery runtime answers each with the
  // starter set, because loading every schema is the widening it replaces.
  const unclassified = (
    reason: Exclude<PlanningToolSelectionReason, "intent_bucket">,
  ): PlanningToolSelection => (
    input.capabilityDiscovery
      ? starterSelection(input.availableTools, reason)
      : fullSelection(input.availableTools, reason)
  );

  if (!input.classifierSignals) return unclassified("no_classifier_signals");
  if (!classifierIsAligned(input)) return unclassified("classifier_unaligned");

  const { intents } = input.classifierSignals;
  const availableNames = new Set(input.availableTools.map((tool) => tool.name));
  const selectedNames = new Set<string>(CONTROL_TOOL_NAMES);
  const buckets = new Set<PlanningToolBucket>();

  if (RISK_INTENTS.some((intent) => intents[intent])) {
    addBucket(buckets, selectedNames, "risk", []);
  } else {
    if (intents.mutative_request) {
      // Which mutation the request needs is the one thing "mutative" does not
      // say, so on the discovery runtime the bucket loads what any mutation is
      // proposed from — the KB, product and order reads — and leaves the write
      // itself to be discovered. An address change stops arriving holding every
      // compensation schema, which is what the broad bucket did to it.
      addBucket(buckets, selectedNames, "order_mutation", [
        ...MUTATION_COMMON_TOOL_NAMES,
        ...(input.capabilityDiscovery ? [] : BROAD_ORDER_MUTATION_TOOL_NAMES),
      ]);
    }
    if (intents.policy_question) {
      addBucket(buckets, selectedNames, "policy", ["search_kb"]);
    }
    if (intents.order_status) {
      addBucket(buckets, selectedNames, "order_status", ORDER_READ_TOOL_NAMES);
    }
    if (buckets.size === 0 && intents.no_request) {
      addBucket(buckets, selectedNames, "no_request", []);
    }
  }

  // A classifier miss, pre-v5 placeholder, complaint, or generic "other" is not
  // enough evidence to hide tools. The widened registry is the fallback before
  // a model call, not only after a failed narrow attempt.
  if (buckets.size === 0) {
    return unclassified("unclassified_request");
  }

  const selected = input.availableTools.filter((tool) => selectedNames.has(tool.name));
  // Keep this guard structural: if registry changes ever make a bucket empty or
  // remove a required control tool, fail open to the full planning registry.
  const requiredControlNames = CONTROL_TOOL_NAMES.filter((name) => availableNames.has(name));
  if (selected.length === 0 || requiredControlNames.some((name) => !selectedNames.has(name))) {
    return unclassified("unclassified_request");
  }

  const bucket = [...buckets].sort().join("+");
  return {
    tools: [...selected, input.capabilityDiscovery ? DISCOVERY_TOOL : NAMESPACE_MISS_TOOL],
    bucket,
    reason: "intent_bucket",
    narrowed: true,
  };
}

const CUSTOMER_TERMINAL_TOOL_NAMES = new Set([
  "send_reply",
  "send_email",
  "escalate_to_human",
  "ask_operator",
]);

export function namespaceMissReason(
  rawToolCalls: readonly { name: string }[],
): NamespaceMissReason | null {
  if (rawToolCalls.some((toolCall) => toolCall.name === NAMESPACE_MISS_TOOL_NAME)) {
    return "model_signal";
  }
  if (rawToolCalls.some((toolCall) => CUSTOMER_TERMINAL_TOOL_NAMES.has(toolCall.name))) {
    return null;
  }
  return rawToolCalls.length === 0 ? "empty_plan" : "incomplete_plan";
}

/**
 * How many schemas one discovery call may return. Bounded because the point of
 * discovery is to replace loading the whole registry: an unbounded "closest
 * matches" is the full-registry fallback with a search step in front of it.
 */
export const DISCOVERY_RESULT_LIMIT = 5;

export interface CapabilityDiscoveryInput {
  /**
   * The tools this actor is authorized to use — the planner's already-computed
   * available set, which is where storefront allowlists, the settings category
   * filter, the OAuth grant and module tool sets have already been applied.
   * Discovery reads eligibility from the registry but takes candidacy from this
   * set, so there is one authority mechanism rather than a second one here.
   */
  authorizedTools: readonly Anthropic.Tool[];
  capability: string;
  limit?: number;
}

export interface CapabilityDiscoveryResult {
  tools: Anthropic.Tool[];
  /** Eligible tools that matched before the limit was applied. */
  matched: number;
  /** Whether the limit dropped matches from `tools`. */
  bounded: boolean;
}

// Function words only. Domain words like "order", "customer" and "refund" carry
// the whole signal here, so nothing that could name a capability is stripped.
const DISCOVERY_STOP_WORDS: ReadonlySet<string> = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "for", "from",
  "how", "i", "in", "is", "it", "of", "on", "or", "s", "that", "the", "their",
  "them", "then", "this", "to", "want", "was", "we", "what", "with", "you",
]);

function discoveryTokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((token) => token.length > 1 && !DISCOVERY_STOP_WORDS.has(token));
}

function overlapScore(queryTokens: ReadonlySet<string>, text: string, weight: number): number {
  const matched = new Set(discoveryTokens(text).filter((token) => queryTokens.has(token)));
  return matched.size * weight;
}

/**
 * Rank an authorized tool against the requested capability using the metadata
 * the registry already carries. The name and the merchant-facing labels are the
 * deliberate descriptions of what a tool does, so they outweigh the description
 * prose the model reads.
 *
 * This is relevance, never permission: a score decides ordering within the
 * authorized set and nothing else, so a capability string cannot reach a tool
 * that set does not contain.
 */
function relevanceScore(
  definition: AgentToolDefinition,
  queryTokens: ReadonlySet<string>,
): number {
  return overlapScore(queryTokens, definition.name, 3)
    + overlapScore(queryTokens, definition.labels.planStep, 2)
    + overlapScore(queryTokens, definition.labels.executed, 2)
    + overlapScore(queryTokens, definition.group, 2)
    + overlapScore(queryTokens, definition.description, 1);
}

/**
 * The bounded, registry-derived answer to "what can I use for this?".
 *
 * Returns nothing when nothing eligible matches. That is the point: an empty
 * result is the honest signal that the capability is out of reach for this
 * actor, and falling back to the full registry would put back the widening this
 * replaces.
 */
export function discoverCapabilityTools(
  input: CapabilityDiscoveryInput,
): CapabilityDiscoveryResult {
  const limit = input.limit ?? DISCOVERY_RESULT_LIMIT;
  const queryTokens = new Set(discoveryTokens(input.capability));
  if (queryTokens.size === 0 || limit <= 0) return { tools: [], matched: 0, bounded: false };

  const authorized = new Map(input.authorizedTools.map((tool) => [tool.name, tool]));
  const scored: { tool: Anthropic.Tool; score: number; order: number }[] = [];

  TOOL_DEFINITIONS.forEach((definition, order) => {
    if (definition.availability !== "active") return;
    const tool = authorized.get(definition.name);
    if (!tool) return;
    const score = relevanceScore(definition, queryTokens);
    if (score > 0) scored.push({ tool, score, order });
  });

  scored.sort((left, right) => right.score - left.score || left.order - right.order);
  return {
    tools: scored.slice(0, limit).map((entry) => entry.tool),
    matched: scored.length,
    bounded: scored.length > limit,
  };
}

export interface CapabilityDiscoveryOutcome {
  /** Schemas to add for the next model call: the matches not already offered. */
  tools: Anthropic.Tool[];
  status: "matched" | "no_match" | "invalid_input";
  /** What the model is told, as the discovery call's tool result. */
  content: string;
}

/**
 * Resolve one `discover_capabilities` call. The model names a capability; the
 * answer is the authorized schemas that match it and nothing else.
 *
 * An empty answer stays empty. Returning the registry here, or inviting a
 * broader retry, would rebuild the widening this replaces one call later, so a
 * no-match says so and names what to do instead.
 */
export function runCapabilityDiscovery(input: {
  authorizedTools: readonly Anthropic.Tool[];
  /** Tools the model already holds; a match among them needs no second copy. */
  activeToolNames: ReadonlySet<string>;
  rawInput: unknown;
}): CapabilityDiscoveryOutcome {
  const capability = typeof (input.rawInput as { capability?: unknown } | null)?.capability === "string"
    ? ((input.rawInput as { capability: string }).capability).trim()
    : "";
  if (capability === "") {
    return {
      tools: [],
      status: "invalid_input",
      content: "No capability was named. Call this again with the concrete capability you need, or continue without it.",
    };
  }

  const discovered = discoverCapabilityTools({
    authorizedTools: input.authorizedTools,
    capability,
  });
  if (discovered.tools.length === 0) {
    return {
      tools: [],
      status: "no_match",
      content: `No capability you are authorized to use matches "${capability}". Do not ask for it again — answer, ask, or escalate instead.`,
    };
  }

  const names = discovered.tools.map((tool) => tool.name);
  return {
    tools: discovered.tools.filter((tool) => !input.activeToolNames.has(tool.name)),
    status: "matched",
    content: `Available to you from your next step: ${names.join(", ")}.`,
  };
}
