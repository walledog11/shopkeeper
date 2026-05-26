// Display-only PII scrubbing for the agent action log. Raw inputs are kept
// in the DB; this only sanitizes what the merchant sees in the UI so a
// screenshot doesn't leak a customer's email or phone number.

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Phone heuristic: 8+ digits with optional +, spaces, dots, dashes, parens.
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g;
// Shopify gids like gid://shopify/Customer/1234567890.
const SHOPIFY_GID_RE = /gid:\/\/shopify\/[A-Za-z]+\/\d+/g;

const CUSTOMER_ID_KEY_RE = /(^|_)customer(_)?id$/i;

function redactString(value: string): string {
  return value
    .replace(SHOPIFY_GID_RE, "<redacted id>")
    .replace(EMAIL_RE, "<redacted email>")
    .replace(PHONE_RE, "<redacted phone>");
}

export function redactPii(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(redactPii);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (CUSTOMER_ID_KEY_RE.test(key)) {
        out[key] = "<redacted id>";
        continue;
      }
      out[key] = redactPii(raw);
    }
    return out;
  }
  return value;
}
