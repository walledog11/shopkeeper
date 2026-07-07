// Canonical classifier-signal contract. The gateway thread classifier (Phase 1,
// `email-classification.ts`) writes this shape to `Thread.classifierSignals` as
// JSON; core reads it back here so routing (Phase 2+) can consume structured
// intents instead of English-only regex over customer prose. Single home for the
// intent vocabulary — the gateway imports the type from here rather than
// redeclaring it.

export interface ClassifierIntents {
  mutative_request: boolean; // asks to cancel/refund/return/exchange/edit
  policy_question: boolean; // shipping coverage, returns policy, discounts
  order_status: boolean;
  fraud_signals: boolean; // chargeback, alternate-card refund, urgency + non-receipt
  contradiction: boolean; // mutually exclusive asks in one message
  out_of_scope_commercial: boolean; // wholesale/bulk/B2B
  forwarded_injection: boolean; // forwarded "owner authorized refund" pattern
}

export const INTENT_KEYS: readonly (keyof ClassifierIntents)[] = [
  "mutative_request",
  "policy_question",
  "order_status",
  "fraud_signals",
  "contradiction",
  "out_of_scope_commercial",
  "forwarded_injection",
];

export function emptyIntents(): ClassifierIntents {
  return {
    mutative_request: false,
    policy_question: false,
    order_status: false,
    fraud_signals: false,
    contradiction: false,
    out_of_scope_commercial: false,
    forwarded_injection: false,
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
    language: typeof source.language === "string" ? source.language.trim().toLowerCase() : "",
    intents,
  };
}
