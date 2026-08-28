import type { RawToolCall } from "./types.js";

const MUTATION_SUBJECT =
  "refunds?|returns?|exchanges?|cancellations?|gift cards?|store credit|replacements?|discounts?|orders?|address(?:es)?|labels?|shipments?";
const MUTATION_VERB =
  "initiated|issued|processed|created|started|placed|sent|applied|approved|arranged|completed|refunded|returned|cancell?ed|exchanged|fulfilled|shipped|updated|changed|edited|opened|set up";
const MUTATION_VERB_PROGRESSIVE =
  "initiating|issuing|processing|creating|starting|placing|sending|applying|approving|arranging|completing|refunding|returning|cancell?ing|exchanging|fulfill?ing|shipping|updating|changing|editing|opening|setting up";
const MUTATION_VERB_BASE =
  "initiate|issue|process|create|start|place|send|apply|approve|arrange|complete|refund|return|cancel|exchange|fulfill?|ship|update|change|edit|open|set up";
const ANY_MUTATION_VERB = `${MUTATION_VERB}|${MUTATION_VERB_PROGRESSIVE}|${MUTATION_VERB_BASE}`;
// A second claim in the same sentence is a coordinated verb phrase sharing the
// subject — "…and opened a return". A prepositional or contrastive phrase is not
// — "…instead of a refund" names an operation precisely to say it did not
// happen. Continuations extend the claim; everything else stays outside it.
const CLAIM_CONTINUATION = new RegExp(
  `\\b(?:and|then|also|plus)\\s+(?:${ANY_MUTATION_VERB})\\b[^.!?]{0,40}?\\b(?:${MUTATION_SUBJECT})\\b`,
  "gi",
);
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

// The claim patterns are declared without `g` because claimingSentences tests
// them, and a global regex there would carry lastIndex between sentences. Clone
// per scan instead, so collecting spans cannot disturb those callers.
function allMatches(pattern: RegExp, text: string): string[] {
  return [...text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))].map((m) => m[0]);
}

/**
 * The spans of `text` that actually claim an operation: each primary
 * verb-anchored claim, plus any coordinated verb phrase continuing it.
 *
 * Claim detection was always verb-anchored and precise, but grounding used to
 * scan the whole sentence for bare operation nouns, so any mention anywhere in
 * the sentence became a claim to ground. That is why three negation phrasings
 * had to be deleted from the text first — and why the fourth one nobody had
 * written down, "instead of a refund", invalidated a correct store-credit plan
 * on a phrasing coin-flip. Bounding the scan to the claim spans removes the
 * mismatch instead of extending the list: a noun the claim verb does not govern
 * is not a claim, whatever preposition introduces it.
 *
 * Every verb-anchored match is its own span, not just the first. A sentence can
 * make a second claim without a coordinator — "I've refunded your order, I've
 * cancelled the shipment" — and taking one match per pattern would leave that
 * second claim ungrounded-but-unchecked, which is the failure this validator
 * exists to catch.
 */
function claimSpans(text: string, patterns: readonly RegExp[]): string[] {
  const spans = patterns.flatMap((pattern) => allMatches(pattern, text));
  if (spans.length === 0) return [];
  return [...spans, ...[...text.matchAll(CLAIM_CONTINUATION)].map((match) => match[0])];
}

function spanIsGrounded(span: string, rawToolCalls: readonly RawToolCall[]): boolean {
  // Specific operation cues win over the generic noun “order”. Thus an order
  // edit cannot ground “I refunded the order”, while cancel_order grounds “I
  // canceled the order” even though both spans also contain “order”.
  const specific = SPECIFIC_CLAIM_ACTIONS.filter(([cue]) => cue.test(span));
  if (specific.length > 0) {
    return specific.every(([, allowed]) => rawToolCalls.some((call) => allowed.has(call.name)));
  }
  return /\borders?\b/i.test(span)
    && rawToolCalls.some((call) => GENERIC_ORDER_ACTIONS.has(call.name));
}

function claimsAreGrounded(
  text: string,
  patterns: readonly RegExp[],
  rawToolCalls: readonly RawToolCall[],
): boolean {
  return claimSpans(text, patterns).every((span) => spanIsGrounded(span, rawToolCalls));
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
    if (claimsAreGrounded(normalized, MUTATION_CLAIM_PATTERNS, rawToolCalls)) return [];
    return [{ toolCallId: toolCall.id, tool: toolCall.name, text: reason.trim() }];
  });
}

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

function claimingSentences(text: string): string[] {
  const found: string[] = [];
  for (const line of text.split("\n")) {
    for (const sentence of line.match(/[^.!?]+[.!?]*\s*/g) ?? []) {
      const normalized = sentence.replace(/[‘’]/g, "'");
      if (CUSTOMER_ATTRIBUTION.test(normalized)) continue;
      if (REPLY_MUTATION_CLAIM_PATTERNS.some((pattern) => pattern.test(normalized))) {
        found.push(normalized.trim());
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
    const found = claimingSentences(value)
      .filter((sentence) => !claimsAreGrounded(sentence, REPLY_MUTATION_CLAIM_PATTERNS, rawToolCalls));
    return found.length === 0
      ? []
      : [{ toolCallId: toolCall.id, tool: toolCall.name, text: found.join(" ") }];
  });
}
