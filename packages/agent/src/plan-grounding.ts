import type { BaseAgentContext, SupportContext } from "./agent-context.js";
import { canonicalAmount, formatMoney } from "./money.js";
import {
  expectedCustomerRecipient,
  factTargetsCurrentCustomer,
  historicalCompletionFacts,
  proposedCompletionFacts,
  type CompletionAction,
  type CompletionFact,
  type CompletionFactOutcome,
} from "./completion-facts.js";
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
const CLAIM_TARGET_SUFFIX = "(?:\\s+(?:(?:id|number)\\s*)?#?\\d{2,})?";
const CLAIM_GAP = "(?:[^.!?]|(?<=\\d)\\.(?=\\d)){0,60}?";
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
    `\\b(?:${MUTATION_SUBJECT})\\b${CLAIM_TARGET_SUFFIX}${CLAIM_GAP}\\b(?:has|have|had|was|were)\\s+(?:already\\s+)?been\\s+(?:${MUTATION_VERB})\\b`,
    "i",
  ),
  new RegExp(
    `\\b(?:i|we)(?:'ve|'d)?\\s+(?:have\\s+|had\\s+)?(?:already\\s+)?(?:${MUTATION_VERB})\\b${CLAIM_GAP}\\b(?:${MUTATION_SUBJECT})\\b${CLAIM_TARGET_SUFFIX}`,
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

const SPECIFIC_CLAIM_ACTIONS: readonly [RegExp, ReadonlySet<CompletionAction>][] = [
  // Cancelling a paid Shopify order also handles its payment reversal, so a
  // cancellation may ground the refund side effect without a second refund
  // call (which the planner is explicitly forbidden to make).
  [/\b(?:refunds?|refunded|refunding)\b/i, new Set(["refund"])],
  [/\b(?:gift cards?|store credit)\b/i, new Set(["store_credit"])],
  // Bare "returned" / "returning" frequently describes money going back to
  // a card. Require an RMA noun or a merchandise object before treating it as
  // a product-return operation.
  [
    /\breturns?\b|\b(?:returned|returning)\b[^.!?]{0,24}\b(?:item|product|order|package|purchase|merchandise)\b|\b(?:item|product|order|package|purchase|merchandise)\b[^.!?]{0,24}\breturned\b|\blabels?\b/i,
    new Set(["return"]),
  ],
  [/\b(?:exchanges?|exchanged|exchanging|replacements?)\b/i, new Set(["exchange", "order_creation"])],
  [/\bcancell?(?:ations?|ed|ing)?\b/i, new Set(["cancellation"])],
  [/\baddress(?:es)?\b/i, new Set(["address_update"])],
  [/\b(?:shipments?|shipped|shipping|fulfilled|fulfilling)\b/i, new Set(["fulfillment"])],
  [/\bdiscounts?\b/i, new Set(["discount"])],
];
const GENERIC_ORDER_ACTIONS = new Set<CompletionAction>(["fulfillment", "order_creation", "order_update"]);

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



function moneyClaims(span: string): { amount: string; currency?: string }[] {
  const claims: { amount: string; currency?: string }[] = [];
  const pattern = /\b([A-Z]{3})\s+(\d+(?:\.\d{1,2})?)\b|([$€£])\s*(\d+(?:\.\d{1,2})?)(?:\s*([A-Z]{3})\b)?|\b(\d+(?:\.\d{1,2})?)\s+([A-Z]{3})\b/g;
  for (const match of span.matchAll(pattern)) {
    const amount = canonicalAmount(match[2] ?? match[4] ?? match[6]);
    if (!amount) continue;
    const symbolCurrency = match[3] === "€" ? "EUR" : match[3] === "£" ? "GBP" : undefined;
    claims.push({
      amount,
      ...((match[1] ?? match[5] ?? match[7] ?? symbolCurrency)
        ? { currency: (match[1] ?? match[5] ?? match[7] ?? symbolCurrency)!.toUpperCase() }
        : {}),
    });
  }
  return claims;
}

function claimedOrderTargets(span: string): string[] {
  return [...span.matchAll(/\border(?:\s+(?:id|number))?\s*#?\s*(\d{2,})\b/gi)]
    .map((match) => match[1]);
}

function normalizedTarget(value: string): string {
  return value.trim().replace(/^#/, "").toLowerCase();
}

function factMatchesDetails(span: string, fact: CompletionFact): boolean {
  const amounts = moneyClaims(span);
  const isFinancialFact = fact.action === "refund"
    || fact.action === "store_credit"
    || fact.action === "discount";
  if (isFinancialFact && amounts.length > 0) {
    const factAmount = fact.amount ? canonicalAmount(fact.amount) : null;
    if (!factAmount || amounts.some((claim) => claim.amount !== factAmount)) return false;
    const factCurrency = fact.currency?.toUpperCase();
    // A bare `$` is not "currency unspecified" when the money moved in another
    // currency — it is a claim that the customer will read as their own symbol.
    // The renderer composes `59.90 CAD` for exactly this case, so text that
    // reaches here still wearing a dollar sign is unsupported rather than
    // ambiguous.
    if (factCurrency && factCurrency !== "USD" && amounts.some((claim) => claim.currency !== factCurrency)) {
      return false;
    }
    if (amounts.some((claim) => claim.currency && claim.currency !== factCurrency)) return false;
  }

  const orderTargets = claimedOrderTargets(span);
  if (orderTargets.length > 0 && fact.target?.kind === "order") {
    const aliases = [fact.target.id, ...(fact.target.aliases ?? [])].map(normalizedTarget);
    if (orderTargets.some((target) => !aliases.includes(normalizedTarget(target)))) return false;
  }
  return true;
}

function spanIsGrounded(
  span: string,
  detailText: string,
  facts: readonly CompletionFact[],
  allowedOutcomes: ReadonlySet<CompletionFactOutcome>,
  ctx?: FactContext,
): boolean {
  const usableFacts = facts.filter((fact) => (
    allowedOutcomes.has(fact.outcome)
    && factTargetsCurrentCustomer(fact, ctx)
    && factMatchesDetails(detailText, fact)
  ));
  // Specific operation cues win over the generic noun “order”. Thus an order
  // edit cannot ground “I refunded the order”, while cancel_order grounds “I
  // canceled the order” even though both spans also contain “order”.
  const specific = SPECIFIC_CLAIM_ACTIONS.filter(([cue]) => cue.test(span));
  if (specific.length > 0) {
    return specific.every(([, allowed]) => usableFacts.some((entry) => allowed.has(entry.action)));
  }
  return /\borders?\b/i.test(span)
    && usableFacts.some((entry) => GENERIC_ORDER_ACTIONS.has(entry.action));
}

function claimsAreGrounded(
  text: string,
  patterns: readonly RegExp[],
  facts: readonly CompletionFact[],
  allowedOutcomes: ReadonlySet<CompletionFactOutcome>,
  ctx?: FactContext,
): boolean {
  return claimSpans(text, patterns).every((span) => spanIsGrounded(
    span,
    text,
    facts,
    allowedOutcomes,
    ctx,
  ));
}

type FactContext = Pick<BaseAgentContext, "shopify"> & Partial<Pick<SupportContext, "customer" | "recentOrders" | "thread">>;

interface GroundingEvidence {
  ctx?: FactContext;
  readResults?: Readonly<Record<string, string>>;
}

export function detectUngroundedEscalationReasons(
  rawToolCalls: readonly RawToolCall[],
  evidence: GroundingEvidence = {},
): UngroundedPlanClaim[] {
  return rawToolCalls.flatMap((toolCall, index) => {
    if (toolCall.name !== "escalate_to_human") return [];
    const input = toolCall.input;
    if (!input || typeof input !== "object" || Array.isArray(input)) return [];
    const reason = (input as { reason?: unknown }).reason;
    if (typeof reason !== "string" || !reason.trim()) return [];
    const normalized = reason.replace(/[‘’]/g, "'");
    if (CUSTOMER_ATTRIBUTION.test(normalized)) return [];
    const preceding = rawToolCalls.slice(0, index);
    const facts = [
      ...proposedCompletionFacts(preceding, evidence.ctx, evidence.readResults),
      ...historicalCompletionFacts(preceding, evidence.readResults),
    ];
    if (claimsAreGrounded(normalized, MUTATION_CLAIM_PATTERNS, facts, new Set(["proposed", "success"]), evidence.ctx)) return [];
    return [{ toolCallId: toolCall.id, tool: toolCall.name, text: reason.trim() }];
  });
}

const REPLY_MUTATION_CLAIM_PATTERNS = [
  new RegExp(
    `\\b(?:i|we)\\b\\s*(?:'ve|'d)?\\s*(?:have|had)?\\s*(?:just|already)?\\s*(?:${MUTATION_VERB})\\b(?!\\s+you\\b)${CLAIM_GAP}\\b(?:${MUTATION_SUBJECT})\\b${CLAIM_TARGET_SUFFIX}`,
    "i",
  ),
  new RegExp(
    `\\b(?:i(?:'m| am)|we(?:'re| are))\\s+(?:currently|now|already)?\\s*(?:${MUTATION_VERB_PROGRESSIVE})\\b(?!\\s+you\\b)${CLAIM_GAP}\\b(?:${MUTATION_SUBJECT})\\b${CLAIM_TARGET_SUFFIX}`,
    "i",
  ),
  new RegExp(
    `\\b(?:i|we)\\b\\s*(?:'ll|will)\\s+(?:go ahead and|now)?\\s*(?:${MUTATION_VERB_BASE})\\b(?!\\s+you\\b)${CLAIM_GAP}\\b(?:${MUTATION_SUBJECT})\\b${CLAIM_TARGET_SUFFIX}`,
    "i",
  ),
  MUTATION_CLAIM_PATTERNS[0],
];
const REPLY_TEXT_FIELDS: Record<string, string> = { send_reply: "text", send_email: "body" };

function claimingSentences(text: string): string[] {
  const found: string[] = [];
  for (const line of text.split("\n")) {
    const protectedLine = line.replace(/(?<=\d)\.(?=\d)/g, "\u0000");
    for (const sentence of protectedLine.match(/[^.!?]+[.!?]*\s*/g) ?? []) {
      const normalized = sentence.replace(/\u0000/g, ".").replace(/[‘’]/g, "'");
      if (CUSTOMER_ATTRIBUTION.test(normalized)) continue;
      if (REPLY_MUTATION_CLAIM_PATTERNS.some((pattern) => pattern.test(normalized))) {
        found.push(normalized.trim());
      }
    }
  }
  return found;
}

function matchingCompletionFacts(
  sentence: string,
  facts: readonly CompletionFact[],
  allowedOutcomes: ReadonlySet<CompletionFactOutcome>,
  ctx?: FactContext,
): CompletionFact[] {
  const usableFacts = facts.filter((fact) => (
    allowedOutcomes.has(fact.outcome)
    && factTargetsCurrentCustomer(fact, ctx)
    && factMatchesDetails(sentence, fact)
  ));
  const matching = claimSpans(sentence, REPLY_MUTATION_CLAIM_PATTERNS).flatMap((span) => {
    const specific = SPECIFIC_CLAIM_ACTIONS.filter(([cue]) => cue.test(span));
    return specific.length > 0
      ? usableFacts.filter((fact) => specific.some(([, allowed]) => allowed.has(fact.action)))
      : /\borders?\b/i.test(span)
        ? usableFacts.filter((fact) => GENERIC_ORDER_ACTIONS.has(fact.action))
        : [];
  });

  const seen = new Set<string>();
  return matching.filter((fact) => {
    const key = JSON.stringify([
      fact.action,
      fact.target?.kind,
      fact.target?.id,
      fact.amount,
      fact.currency,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function publicOrderLabel(fact: CompletionFact): string | null {
  if (fact.target?.kind !== "order") return null;
  const candidate = fact.target.aliases?.[0] ?? fact.target.id;
  if (!candidate || (!fact.target.aliases?.[0] && !/^#?\d+$/.test(candidate))) return null;
  return candidate.startsWith("#") ? candidate : `#${candidate}`;
}

// The customer reads this sentence, so money follows the same convention as the
// merchant-facing copy in shopify/sales-pulse.ts — a symbol for USD, a trailing
// ISO code otherwise. "USD 20.00" reads like a bank statement. Cents are kept
// even when whole, because a refund total is exact.
function publicMoney(fact: CompletionFact): string | null {
  const amount = fact.amount ? canonicalAmount(fact.amount) : null;
  const currency = fact.currency?.trim().toUpperCase();
  if (!amount || !currency) return null;
  return formatMoney({ amount, currency });
}

function renderCompletionFact(fact: CompletionFact): string {
  const order = publicOrderLabel(fact);
  const orderSuffix = order ? ` for order ${order}` : "";
  const money = publicMoney(fact);
  const moneySuffix = money ? ` of ${money}` : "";

  switch (fact.action) {
    case "refund":
      return `A refund${moneySuffix} has been issued${orderSuffix}.`;
    case "return":
      return `A return has been created${orderSuffix}.`;
    case "exchange":
      return `An exchange has been created${orderSuffix}.`;
    case "cancellation":
      return order ? `Order ${order} has been canceled.` : "The order has been canceled.";
    case "store_credit":
      return `Store credit${moneySuffix} has been issued.`;
    case "address_update":
      return order ? `The address for order ${order} has been updated.` : "The address has been updated.";
    case "fulfillment":
      return order ? `Order ${order} has been fulfilled.` : "The order has been fulfilled.";
    case "order_creation":
      return "The order has been created.";
    case "order_update":
      return order ? `Order ${order} has been updated.` : "The order has been updated.";
    case "discount":
      return "The discount has been applied.";
  }
}

function renderClaimingText(
  text: string,
  facts: readonly CompletionFact[],
  allowedOutcomes: ReadonlySet<CompletionFactOutcome>,
  ctx?: FactContext,
): string {
  return text.split(/(\n)/).map((line) => {
    if (line === "\n") return line;
    const protectedLine = line.replace(/(?<=\d)\.(?=\d)/g, "\u0000");
    return (protectedLine.match(/[^.!?]+[.!?]*\s*/g) ?? [protectedLine]).map((rawSentence) => {
      const sentence = rawSentence.replace(/\u0000/g, ".");
      const normalized = sentence.replace(/[‘’]/g, "'");
      if (
        CUSTOMER_ATTRIBUTION.test(normalized)
        || !REPLY_MUTATION_CLAIM_PATTERNS.some((pattern) => pattern.test(normalized))
      ) {
        return sentence;
      }
      const matching = matchingCompletionFacts(normalized, facts, allowedOutcomes, ctx);
      if (matching.length === 0) return sentence;
      const leading = sentence.match(/^\s*/)?.[0] ?? "";
      const trailing = sentence.match(/\s*$/)?.[0] ?? "";
      return `${leading}${matching.map(renderCompletionFact).join(" ")}${trailing}`;
    }).join("");
  }).join("");
}

/**
 * Replace model-authored mutation claims with customer-safe copy derived only
 * from successful completion facts. Non-sensitive surrounding copy remains as
 * approved/generated; unsupported claims remain unchanged so the execution
 * guard can reject them.
 */
export function renderReplyCompletionClaims(
  toolCall: Pick<RawToolCall, "id" | "name" | "input">,
  facts: readonly CompletionFact[],
  ctx?: FactContext,
): RawToolCall {
  const field = REPLY_TEXT_FIELDS[toolCall.name];
  const input = recordInput(toolCall.input);
  const value = field ? input?.[field] : undefined;
  if (!field || !input || typeof value !== "string" || !value.trim()) return toolCall;
  return {
    ...toolCall,
    input: {
      ...input,
      [field]: renderClaimingText(value, facts, new Set(["success"]), ctx),
    },
  };
}

export function detectUngroundedReplyText(
  rawToolCalls: readonly RawToolCall[],
  evidence: GroundingEvidence = {},
): UngroundedPlanClaim[] {
  return rawToolCalls.flatMap((toolCall, index) => {
    const field = REPLY_TEXT_FIELDS[toolCall.name];
    if (!field) return [];
    const input = toolCall.input;
    if (!input || typeof input !== "object" || Array.isArray(input)) return [];
    const value = (input as Record<string, unknown>)[field];
    if (typeof value !== "string" || !value.trim()) return [];
    const preceding = rawToolCalls.slice(0, index);
    const facts = [
      ...proposedCompletionFacts(preceding, evidence.ctx, evidence.readResults),
      ...historicalCompletionFacts(preceding, evidence.readResults),
    ];
    const found = unsupportedReplyCompletionClaims(
      toolCall,
      facts,
      evidence.ctx,
      new Set(["proposed", "success"]),
    );
    return found.length === 0
      ? []
      : [{ toolCallId: toolCall.id, tool: toolCall.name, text: found.join(" ") }];
  });
}

export function unsupportedReplyCompletionClaims(
  toolCall: Pick<RawToolCall, "name" | "input">,
  facts: readonly CompletionFact[],
  ctx?: FactContext,
  allowedOutcomes: ReadonlySet<CompletionFactOutcome> = new Set(["success"]),
): string[] {
  const field = REPLY_TEXT_FIELDS[toolCall.name];
  if (!field) return [];
  const input = recordInput(toolCall.input);
  const value = input?.[field];
  if (typeof value !== "string" || !value.trim()) return [];
  const claims = claimingSentences(value);
  if (claims.length === 0) return [];

  if (toolCall.name === "send_email") {
    const to = typeof input?.to === "string" ? input.to.trim().toLowerCase() : "";
    const factRecipients = facts
      .filter((fact) => allowedOutcomes.has(fact.outcome) && fact.target?.kind === "email")
      .map((fact) => fact.target!.id.trim().toLowerCase());
    const expected = expectedCustomerRecipient(ctx);
    const allowedRecipients = factRecipients.length > 0
      ? factRecipients
      : expected ? [expected] : [];
    if (allowedRecipients.length > 0 && !allowedRecipients.includes(to)) return claims;
  }

  return claims.filter((sentence) => !claimsAreGrounded(
    sentence,
    REPLY_MUTATION_CLAIM_PATTERNS,
    facts,
    allowedOutcomes,
    ctx,
  ));
}

function recordInput(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
