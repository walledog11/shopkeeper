import type { RawToolCall } from "./types.js";

const MUTATION_SUBJECT =
  "refunds?|returns?|exchanges?|cancellations?|gift cards?|store credit|replacements?|discounts?|orders?|address(?:es)?|labels?|shipments?";
const MUTATION_VERB =
  "initiated|issued|processed|created|started|placed|sent|applied|approved|arranged|completed|refunded|returned|cancell?ed|exchanged|fulfilled|shipped|updated|changed|edited";
const MUTATION_CLAIM_PATTERNS = [
  new RegExp(
    `\\b(?:${MUTATION_SUBJECT})\\b[^.!?]{0,40}?\\b(?:has|have|had|was|were)\\s+(?:already\\s+)?been\\s+(?:${MUTATION_VERB})\\b`,
    "i",
  ),
  new RegExp(
    `\\b(?:i|we)(?:'ve|'d)?\\s+(?:have\\s+|had\\s+)?(?:already\\s+)?(?:${MUTATION_VERB})\\b[^.!?]{0,40}?\\b(?:${MUTATION_SUBJECT})\\b`,
    "i",
  ),
];
const CUSTOMER_ATTRIBUTION =
  /\b(?:customer|shopper|buyer|they|she|he)\s+(?:\w+\s+){0,2}(?:says?|said|claims?|claimed|reports?|reported|states?|stated|mentions?|mentioned|believes?|thinks?)\b|\baccording to\b/i;

export interface UngroundedPlanClaim {
  toolCallId: string;
  tool: string;
  text: string;
}

const SPECIFIC_CLAIM_ACTIONS: readonly [RegExp, ReadonlySet<string>][] = [
  // Cancelling a paid Shopify order also handles its payment reversal, so a
  // cancellation may ground the refund side effect without a second refund
  // call (which the planner is explicitly forbidden to make).
  [/\b(?:refunds?|refunded|refunding)\b/i, new Set(["create_refund", "cancel_order"])],
  [/\b(?:gift cards?|store credit)\b/i, new Set(["create_gift_card", "issue_store_credit"])],
  // Bare "returned" / "returning" frequently describes money going back to
  // a card. Require an RMA noun or a merchandise object before treating it as
  // a product-return operation.
  [
    /\breturns?\b|\b(?:returned|returning)\b[^.!?]{0,24}\b(?:item|product|order|package|purchase|merchandise)\b|\b(?:item|product|order|package|purchase|merchandise)\b[^.!?]{0,24}\breturned\b|\blabels?\b/i,
    new Set(["create_return", "attach_return_label", "create_exchange"]),
  ],
  [/\b(?:exchanges?|exchanged|exchanging|replacements?)\b/i, new Set(["create_exchange", "create_shopify_order"])],
  [/\bcancell?(?:ations?|ed|ing)?\b/i, new Set(["cancel_order"])],
  [/\baddress(?:es)?\b/i, new Set(["update_shopify_order_address", "update_shopify_customer_info"])],
  [/\b(?:shipments?|shipped|shipping|fulfilled|fulfilling)\b/i, new Set(["fulfill_order"])],
  [/\bdiscounts?\b/i, new Set(["issue_discount"])],
];
const GENERIC_ORDER_ACTIONS = new Set(["fulfill_order", "create_shopify_order", "edit_shopify_order"]);

function withoutNegatedOperationMentions(text: string): string {
  return text
    .replace(
      /\bno\s+(?:cash\s+)?refunds?\b(?:\s+(?:was|were|is|are|has been|have been))?(?:\s+(?:needed|required|issued|processed))?/gi,
      "",
    )
    .replace(/\bwithout\s+(?:a\s+)?refund\b/gi, "")
    .replace(
      /\brefunds?\s+(?:was|were|is|are)\s+not\s+(?:needed|required|issued|processed)\b/gi,
      "",
    );
}

function hasGroundingAction(text: string, rawToolCalls: readonly RawToolCall[]): boolean {
  // Specific operation cues win over the generic noun “order”. Thus an order
  // edit cannot ground “I refunded the order”, while cancel_order grounds “I
  // canceled the order” even though both sentences also contain “order”.
  const claimText = withoutNegatedOperationMentions(text);
  const specific = SPECIFIC_CLAIM_ACTIONS.filter(([cue]) => cue.test(claimText));
  if (specific.length > 0) {
    return specific.every(([, allowed]) => rawToolCalls.some((call) => allowed.has(call.name)));
  }
  return /\borders?\b/i.test(text)
    && rawToolCalls.some((call) => GENERIC_ORDER_ACTIONS.has(call.name));
}

export function detectUngroundedEscalationReasons(
  rawToolCalls: readonly RawToolCall[],
): UngroundedPlanClaim[] {
  return rawToolCalls.flatMap((toolCall) => {
    if (toolCall.name !== "escalate_to_human") return [];
    const input = toolCall.input;
    if (!input || typeof input !== "object" || Array.isArray(input)) return [];
    const reason = (input as { reason?: unknown }).reason;
    if (typeof reason !== "string" || !reason.trim()) return [];
    const normalized = reason.replace(/[‘’]/g, "'");
    if (CUSTOMER_ATTRIBUTION.test(normalized)) return [];
    if (!MUTATION_CLAIM_PATTERNS.some((pattern) => pattern.test(normalized))) return [];
    if (hasGroundingAction(normalized, rawToolCalls)) return [];
    return [{ toolCallId: toolCall.id, tool: toolCall.name, text: reason.trim() }];
  });
}

const MUTATION_VERB_PROGRESSIVE =
  "initiating|issuing|processing|creating|starting|placing|sending|applying|approving|arranging|completing|refunding|returning|cancell?ing|exchanging|fulfill?ing|shipping|updating|changing|editing|opening|setting up";
const MUTATION_VERB_BASE =
  "initiate|issue|process|create|start|place|send|apply|approve|arrange|complete|refund|return|cancel|exchange|fulfill?|ship|update|change|edit|open|set up";
const REPLY_MUTATION_CLAIM_PATTERNS = [
  new RegExp(
    `\\bi\\b\\s*(?:'ve|'d)?\\s*(?:have|had)?\\s*(?:just|already)?\\s*(?:${MUTATION_VERB})\\b(?!\\s+you\\b)[^.!?]{0,40}?\\b(?:${MUTATION_SUBJECT})\\b`,
    "i",
  ),
  new RegExp(
    `\\bi\\b\\s*(?:'m|am)\\s+(?:currently|now|already)?\\s*(?:${MUTATION_VERB_PROGRESSIVE})\\b(?!\\s+you\\b)[^.!?]{0,40}?\\b(?:${MUTATION_SUBJECT})\\b`,
    "i",
  ),
  new RegExp(
    `\\bi\\b\\s*(?:'ll|will)\\s+(?:go ahead and|now)?\\s*(?:${MUTATION_VERB_BASE})\\b(?!\\s+you\\b)[^.!?]{0,40}?\\b(?:${MUTATION_SUBJECT})\\b`,
    "i",
  ),
];
const REPLY_TEXT_FIELDS: Record<string, string> = { send_reply: "text", send_email: "body" };

function ungroundedSentences(text: string): string[] {
  const found: string[] = [];
  for (const line of text.split("\n")) {
    for (const sentence of line.match(/[^.!?]+[.!?]*\s*/g) ?? []) {
      const normalized = sentence.replace(/[‘’]/g, "'");
      if (CUSTOMER_ATTRIBUTION.test(normalized)) continue;
      if (REPLY_MUTATION_CLAIM_PATTERNS.some((pattern) => pattern.test(normalized))) {
        found.push(sentence.trim());
      }
    }
  }
  return found;
}

export function detectUngroundedReplyText(
  rawToolCalls: readonly RawToolCall[],
): UngroundedPlanClaim[] {
  return rawToolCalls.flatMap((toolCall) => {
    const field = REPLY_TEXT_FIELDS[toolCall.name];
    if (!field) return [];
    const input = toolCall.input;
    if (!input || typeof input !== "object" || Array.isArray(input)) return [];
    const value = (input as Record<string, unknown>)[field];
    if (typeof value !== "string" || !value.trim()) return [];
    const found = ungroundedSentences(value)
      .filter((sentence) => !hasGroundingAction(sentence, rawToolCalls));
    return found.length === 0
      ? []
      : [{ toolCallId: toolCall.id, tool: toolCall.name, text: found.join(" ") }];
  });
}
