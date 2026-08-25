import type Anthropic from "@anthropic-ai/sdk";
import type { ClassifierSignals } from "./classifier-signals.js";

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
  ...ORDER_READ_TOOL_NAMES,
] as const;

const BROAD_ORDER_MUTATION_TOOL_NAMES = [
  "update_shopify_order_address",
  "create_refund",
  "cancel_order",
  "edit_shopify_order",
  "create_return",
  "create_exchange",
  "create_gift_card",
  "attach_return_label",
] as const;

// Tools no customer intent may unlock. They stay reachable through the
// merchant-authored fail-opens above and through the namespace-miss retry, which
// is the designed escape when a request genuinely needs one of them.
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
 * Unknown or internally inconsistent request shapes retain the full registry;
 * a false negative costs tokens, while a false positive can hide a capability.
 *
 * RequestFacts deliberately do not participate. The eval suite grades the
 * boolean intent vocabulary on planner behavior; the facts fields are a
 * renderer contract. Using them here would create a second, ungraded routing
 * contract and would hide adjacent mutation tools from the fixtures added to
 * protect those exact boundaries.
 */
export function selectPlanningTools(input: SelectPlanningToolsInput): PlanningToolSelection {
  if (input.operatorMode) return fullSelection(input.availableTools, "operator");
  if (input.storefrontMode) return fullSelection(input.availableTools, "storefront_policy");
  if (input.merchantAnswerReplan) {
    return fullSelection(input.availableTools, "merchant_answer_replan");
  }
  if (input.merchantInstruction) {
    return fullSelection(input.availableTools, "merchant_instruction");
  }
  if (!input.classifierSignals) {
    return fullSelection(input.availableTools, "no_classifier_signals");
  }
  if (!classifierIsAligned(input)) {
    return fullSelection(input.availableTools, "classifier_unaligned");
  }

  const { intents } = input.classifierSignals;
  const availableNames = new Set(input.availableTools.map((tool) => tool.name));
  const selectedNames = new Set<string>(CONTROL_TOOL_NAMES);
  const buckets = new Set<PlanningToolBucket>();

  if (RISK_INTENTS.some((intent) => intents[intent])) {
    addBucket(buckets, selectedNames, "risk", []);
  } else {
    if (intents.mutative_request) {
      addBucket(buckets, selectedNames, "order_mutation", [
        ...MUTATION_COMMON_TOOL_NAMES,
        ...BROAD_ORDER_MUTATION_TOOL_NAMES,
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
    return fullSelection(input.availableTools, "unclassified_request");
  }

  const selected = input.availableTools.filter((tool) => selectedNames.has(tool.name));
  // Keep this guard structural: if registry changes ever make a bucket empty or
  // remove a required control tool, fail open to the full planning registry.
  const requiredControlNames = CONTROL_TOOL_NAMES.filter((name) => availableNames.has(name));
  if (selected.length === 0 || requiredControlNames.some((name) => !selectedNames.has(name))) {
    return fullSelection(input.availableTools, "unclassified_request");
  }

  const bucket = [...buckets].sort().join("+");
  return {
    tools: [...selected, NAMESPACE_MISS_TOOL],
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
