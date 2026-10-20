import { normalizeOrderName } from "./order-reference.js";
import { emailsMatch } from "./storefront-verification.js";

// The one reader of a verification answer. It looks in the customer's own
// message for an email or a zip/postal code and compares them with the order's,
// and decides nothing else: whether the turn is planned, what is said and what
// may be read all follow from the outcome it records. The model never sees what
// it found, so it cannot relay which detail was wrong.

// A real answer names one email or one postal code. A message carrying more is
// a guess at several, so it is compared as a miss rather than at every value.
const MAX_EMAILS = 1;
const MAX_POSTAL_CANDIDATES = 2;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Uppercase with spacing and punctuation removed; a ZIP+4 compares on its ZIP. */
export function normalizePostalCode(value: string | null | undefined): string {
  const compact = (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^\d{9}$/.test(compact) ? compact.slice(0, 5) : compact;
}

function words(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map(word => word.replace(/^[("'[<]+|[)"'\].,!?:>]+$/g, ""))
    .filter(Boolean);
}

/**
 * Postal codes in the message, each as the values it could be read as. A code
 * written in two parts ("SW1A 1AA", "H2Y 1Z5") is one candidate, not three.
 * The order's own number and anything in a link are never candidates.
 */
function postalCandidates(tokens: readonly string[], orderDigits: string): string[][] {
  const postal = tokens.map((token) => {
    if (token.includes("@") || token.includes("/")) return null;
    const compact = normalizePostalCode(token);
    if (!/\d/.test(compact) || compact.length < 2 || compact.length > 10) return null;
    if (compact === orderDigits) return null;
    return compact;
  });
  const candidates: string[][] = [];
  for (let index = 0; index < postal.length; index += 1) {
    const part = postal[index];
    if (!part) continue;
    const next = postal[index + 1];
    const joined = next ? `${part}${next}` : null;
    if (joined && /[A-Z]/.test(joined) && joined.length <= 10) {
      candidates.push([joined, part, next!]);
      index += 1;
      continue;
    }
    if (part.length >= 3) candidates.push([part]);
  }
  return candidates;
}

/** Whether a message carries an email or postal code at all, whatever the order holds. */
export function carriesOrderVerificationAnswer(text: string, orderName: string): boolean {
  return matchOrderVerificationAnswer({ text, orderName, order: null }).outcome !== "no_candidate";
}

export type OrderVerificationAnswer =
  | { outcome: "matched"; method: "email" | "zip" }
  /** Carried an email or postal code that did not confirm the order. */
  | { outcome: "mismatch" }
  /** Carried neither, so it is not an answer and costs no attempt. */
  | { outcome: "no_candidate" };

/**
 * Compares one customer message with the order asked about. `order` is Shopify's
 * answer to a lookup by that name: null, or an order under another name, reads
 * exactly like a wrong answer.
 */
export function matchOrderVerificationAnswer(input: {
  text: string;
  orderName: string;
  order: { name: string | null; email: string | null; zip: string | null } | null;
}): OrderVerificationAnswer {
  const tokens = words(input.text);
  const orderName = normalizeOrderName(input.orderName);
  const orderDigits = orderName.replace(/[^A-Z0-9]/g, "");
  const emails = tokens.filter(token => EMAIL_RE.test(token));
  const postal = postalCandidates(tokens.filter(token => !EMAIL_RE.test(token)), orderDigits);
  if (emails.length === 0 && postal.length === 0) return { outcome: "no_candidate" };
  const order = input.order && normalizeOrderName(input.order.name ?? "") === orderName ? input.order : null;
  if (emails.length > MAX_EMAILS || postal.length > MAX_POSTAL_CANDIDATES || !order) {
    return { outcome: "mismatch" };
  }

  if (emails.some(email => emailsMatch(email, order.email))) {
    return { outcome: "matched", method: "email" };
  }
  const zip = normalizePostalCode(order.zip);
  if (zip && postal.some(values => values.includes(zip))) {
    return { outcome: "matched", method: "zip" };
  }
  return { outcome: "mismatch" };
}
