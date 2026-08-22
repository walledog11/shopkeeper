// Canonical classifier-signal contract. The gateway thread classifier (Phase 1,
// `email-classification.ts`) writes this shape to `Thread.classifierSignals` as
// JSON; core reads it back here so routing (Phase 2+) can consume structured
// intents instead of English-only regex over customer prose. Single home for the
// intent vocabulary — the gateway imports the type from here rather than
// redeclaring it.

// A type alias rather than an interface on purpose: every field is a boolean, so
// this is genuinely JSON, but an interface has no implicit index signature and so
// is not assignable to Prisma's InputJsonObject. Declaring it as a type keeps it
// storable in a Json column without a cast at every write site.
export type ClassifierIntents = {
  mutative_request: boolean; // asks to cancel/refund/return/exchange/edit
  policy_question: boolean; // shipping coverage, returns policy, discounts
  order_status: boolean;
  fraud_signals: boolean; // chargeback, alternate-card refund, urgency + non-receipt
  contradiction: boolean; // mutually exclusive asks in one message
  out_of_scope_commercial: boolean; // wholesale/bulk/B2B
  forwarded_injection: boolean; // forwarded "owner authorized refund" pattern
  // Greeting or fragment with nothing asked yet ("hello", "yo", "Test"). Not the
  // same as the others: they say what the customer wants, this says the customer
  // has not said. Routing ignores it — it exists so the briefing can tell a
  // stalled conversation from work the merchant owes an answer on, and no
  // length rule can, since "sweater ripped" is as short as "yo" and is a real
  // complaint.
  no_request: boolean;
};

// What the customer wants done, as a closed vocabulary rather than prose. The
// briefing composes its line from these fields instead of rewriting the
// classifier's English sentence, so the load-bearing fact can lead — a deadline
// is useless buried 180 characters into a summary on a phone.
export const REQUEST_ASKS = [
  "refund",
  "cancel",
  "return",
  "exchange",
  "address_change",
  "order_status",
  "product_question",
  "policy_question",
  "complaint",
  "other",
  "none",
] as const;

export type RequestAsk = typeof REQUEST_ASKS[number];

// A type, not an interface, for the same reason as ClassifierIntents: it is
// stored in a Prisma Json column and needs an implicit index signature.
export type RequestFacts = {
  ask: RequestAsk;
  /** What the request is about — a product, not an order. */
  subject: string | null;
  /** Order the request concerns, normalized with a leading `#`. */
  order: string | null;
  /** ISO date (YYYY-MM-DD) the customer needs this by. Orders the briefing. */
  deadline: string | null;
  /** The customer's own words that fixed the deadline, for rendering. */
  deadlineText: string | null;
  /** A second option the customer offered ("refund or exchange"). */
  alternative: RequestAsk | null;
};

export const REQUEST_FACT_TEXT_LIMITS = {
  subject: 60,
  order: 24,
  deadlineText: 40,
} as const;

const REQUEST_ASK_SET = new Set<string>(REQUEST_ASKS);

export function isRequestAsk(value: unknown): value is RequestAsk {
  return typeof value === "string" && REQUEST_ASK_SET.has(value);
}

export function emptyRequestFacts(): RequestFacts {
  return {
    ask: "none",
    subject: null,
    order: null,
    deadline: null,
    deadlineText: null,
    alternative: null,
  };
}

function boundedFactText(
  value: unknown,
  field: keyof typeof REQUEST_FACT_TEXT_LIMITS,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, REQUEST_FACT_TEXT_LIMITS[field]);
}

// Shopify order names carry the `#`; the model is as likely to write "1024" or
// "order 1024". Normalizing here keeps every consumer off its own regex.
function normalizeOrderRef(value: unknown): string | null {
  const raw = boundedFactText(value, "order");
  if (!raw) return null;
  const digits = raw.match(/\d{3,}/);
  return digits ? `#${digits[0]}` : null;
}

function normalizeIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return Number.isNaN(Date.parse(`${trimmed}T00:00:00Z`)) ? null : trimmed;
}

// Lenient in the same direction as parseClassifierSignals: an unreadable field
// becomes null and the caller falls back to the prose path, rather than throwing
// away a classification that was otherwise fine.
export function parseRequestFacts(raw: unknown): RequestFacts {
  if (!raw || typeof raw !== "object") return emptyRequestFacts();
  const source = raw as Record<string, unknown>;
  return {
    ask: isRequestAsk(source.ask) ? source.ask : "none",
    subject: boundedFactText(source.subject, "subject"),
    order: normalizeOrderRef(source.order),
    deadline: normalizeIsoDate(source.deadline),
    deadlineText: boundedFactText(source.deadlineText, "deadlineText"),
    alternative: isRequestAsk(source.alternative) && source.alternative !== "none"
      ? source.alternative
      : null,
  };
}

export const CLASSIFIER_TAGS = [
  "Shipping",
  "Returns",
  "Order Status",
  "Product Inquiry",
  "General",
] as const;

export type ClassifierTag = typeof CLASSIFIER_TAGS[number];

export const CLASSIFIER_TEXT_LIMITS = {
  title: 120,
  summary: 1_000,
  reason: 240,
} as const;

const CLASSIFIER_TAG_SET = new Set<string>(CLASSIFIER_TAGS);

export function isClassifierTag(value: unknown): value is ClassifierTag {
  return typeof value === "string" && CLASSIFIER_TAG_SET.has(value);
}

export function normalizeClassifierLanguage(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  return /^[a-z]{2}$/.test(normalized) ? normalized : "";
}

export const INTENT_KEYS: readonly (keyof ClassifierIntents)[] = [
  "mutative_request",
  "policy_question",
  "order_status",
  "fraud_signals",
  "contradiction",
  "out_of_scope_commercial",
  "forwarded_injection",
  "no_request",
];

// Every intent defaults false, which for `no_request` means "assume the customer
// did ask for something". Threads classified before this key existed therefore
// keep being reported rather than silently disappearing from the briefing.
export function emptyIntents(): ClassifierIntents {
  return {
    mutative_request: false,
    policy_question: false,
    order_status: false,
    fraud_signals: false,
    contradiction: false,
    out_of_scope_commercial: false,
    forwarded_injection: false,
    no_request: false,
  };
}

// Parsed form of `Thread.classifierSignals`. `null` when the thread has no
// signals persisted (pre-Phase-1 threads, non-classified channels, classifier
// outages) — routing treats that as "no classifier available" and falls back to
// the regex path.
export interface ClassifierSignals {
  version: number | null;
  language: string;
  intents: ClassifierIntents;
  /** Structured form of the current ask. `ask: "none"` on threads classified
   *  before the field existed, which reads as "no facts" to every consumer. */
  requestFacts: RequestFacts;
}

// Lenient parse: any persisted object is read as "the classifier ran"; missing
// or malformed intent booleans default to false rather than throwing, mirroring
// the write-side tolerance in email-classification.ts.
export function parseClassifierSignals(raw: unknown): ClassifierSignals | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const intents = emptyIntents();
  const rawIntents = source.intents;
  if (rawIntents && typeof rawIntents === "object") {
    const intentSource = rawIntents as Record<string, unknown>;
    for (const key of INTENT_KEYS) {
      intents[key] = intentSource[key] === true;
    }
  }
  return {
    version: typeof source.version === "number" ? source.version : null,
    language: normalizeClassifierLanguage(source.language),
    intents,
    requestFacts: parseRequestFacts(source.requestFacts),
  };
}
