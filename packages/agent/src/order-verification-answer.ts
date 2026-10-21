import { normalizeOrderName } from "./order-reference.js";
import { emailsMatch } from "./storefront-verification.js";

// The one reader of a verification answer. It looks in the customer's own
// message for an email or a zip/postal code and compares them with the order's,
// and decides nothing else: whether the turn is planned, what is said and what
// may be read all follow from the outcome it records. The model never sees what
// it found, so it cannot relay which detail was wrong.

// A real answer names one email or one postal code, perhaps both. A message
// carrying more is a guess at several, so it is a miss without being compared.
const MAX_VALUES_PER_MESSAGE = 2;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Prices, decimals, times, dates and ordinals carry digits and are never a code.
const NOT_POSTAL_RE = /[$€£¥₹/:]|\d[.,]\d|^\d+(?:st|nd|rd|th|am|pm)$/i;

/** Uppercase with spacing and punctuation removed; a ZIP+4 compares on its ZIP. */
export function normalizePostalCode(value: string | null | undefined): string {
  const compact = compactCode(value ?? "");
  return /^\d{9}$/.test(compact) ? compact.slice(0, 5) : compact;
}

function compactCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function words(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map(word => word.replace(/^[("'[<]+|[)"'\].,!?>]+$/g, ""))
    .filter(Boolean);
}

interface MessageValues {
  emails: string[];
  postal: string[];
  /** Orders the message names, normalized. */
  orders: string[];
}

/**
 * What a message offers as an answer. A postal code is a run of 3–10 digits,
 * a letter-and-digit code of 5–7 characters, or one written in two parts
 * ("94107 1234", "SW1A 1AA", "H2Y 1Z5"), which is one value. An order number
 * ("#2001", "order 2001") is never one, nor is the asked order's own number.
 */
function messageValues(text: string, orderName: string): MessageValues {
  const asked = normalizeOrderName(orderName);
  const askedDigits = compactCode(asked);
  const tokens = words(text);
  const emails = new Set<string>();
  const orders: string[] = [];
  const parts: Array<string | null> = tokens.map((token, index) => {
    if (EMAIL_RE.test(token)) {
      emails.add(token.toLowerCase());
      return null;
    }
    const previous = (tokens[index - 1] ?? "").toLowerCase().replace(/[^a-z#]/g, "");
    if (token.startsWith("#") || previous === "order" || previous === "#") {
      const named = normalizeOrderName(token);
      if (named !== "#") orders.push(named);
      return null;
    }
    if (token.includes("@") || NOT_POSTAL_RE.test(token)) return null;
    const compact = compactCode(token);
    if (!/\d/.test(compact) || compact.length < 2 || compact.length > 10) return null;
    if (compact === askedDigits) return null;
    return compact;
  });

  const postal = new Set<string>();
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!part) continue;
    const next = parts[index + 1];
    if (next && joinsAsOneCode(part, next)) {
      postal.add(normalizePostalCode(`${part}${next}`));
      index += 1;
      continue;
    }
    const lettered = /[A-Z]/.test(part);
    if (lettered ? part.length >= 5 && part.length <= 7 : part.length >= 3) postal.add(normalizePostalCode(part));
  }
  return { emails: [...emails], postal: [...postal], orders };
}

function joinsAsOneCode(first: string, second: string): boolean {
  if (/[A-Z]/.test(first) || /[A-Z]/.test(second)) {
    const length = first.length + second.length;
    return first.length >= 2 && first.length <= 4 && second.length >= 2 && second.length <= 4
      && length >= 5 && length <= 7;
  }
  return first.length >= 3 && first.length <= 5 && second.length >= 3 && second.length <= 4;
}

/** Whether a message answers the ask for this order at all, whatever the order holds. */
export function carriesOrderVerificationAnswer(text: string, orderName: string): boolean {
  const values = messageValues(text, orderName);
  if (values.orders.some(order => order !== normalizeOrderName(orderName))) return false;
  return values.emails.length + values.postal.length > 0;
}

export type OrderVerificationAnswer =
  /** `charged` values were compared, one of which confirmed the order. */
  | { outcome: "matched"; method: "email" | "zip"; charged: number }
  /** Carried an email or postal code that did not confirm the order. */
  | { outcome: "mismatch"; charged: number }
  /** Carried neither, or is about another order, so it costs nothing. */
  | { outcome: "no_candidate" };

/**
 * Compares one customer message with the order asked about. `order` is Shopify's
 * answer to a lookup by that name: null, or an order under another name, reads
 * exactly like a wrong answer. `budget` is how many values the sender may still
 * have compared; each value compared costs one, so a message never tests more
 * values than the sender has left.
 */
export function matchOrderVerificationAnswer(input: {
  text: string;
  orderName: string;
  order: { name: string | null; email: string | null; zip: string | null } | null;
  budget: number;
}): OrderVerificationAnswer {
  if (!carriesOrderVerificationAnswer(input.text, input.orderName)) return { outcome: "no_candidate" };
  const { emails, postal } = messageValues(input.text, input.orderName);
  const offered = emails.length + postal.length;
  const budget = Math.max(0, input.budget);
  if (offered > Math.min(MAX_VALUES_PER_MESSAGE, budget)) {
    return { outcome: "mismatch", charged: Math.min(offered, budget) };
  }
  const orderName = normalizeOrderName(input.orderName);
  const order = input.order && normalizeOrderName(input.order.name ?? "") === orderName ? input.order : null;
  if (!order) return { outcome: "mismatch", charged: offered };
  if (emails.some(email => emailsMatch(email, order.email))) {
    return { outcome: "matched", method: "email", charged: offered };
  }
  const zip = normalizePostalCode(order.zip);
  if (zip && postal.includes(zip)) return { outcome: "matched", method: "zip", charged: offered };
  return { outcome: "mismatch", charged: offered };
}
