import { createHmac, timingSafeEqual } from "crypto";

// Shopify signs app-proxy requests differently from webhooks: the signature is a
// hex HMAC over the sorted query parameters, not a base64 HMAC over the raw body.
// Reusing the webhook verifier here would reject every request.
//
// Canonicalization per Shopify: drop `signature`, sort keys, join each key with
// its value as `key=value` (comma-joining repeated values), concatenate with no
// separator between pairs.
export function appProxyCanonicalString(url: URL): string {
  const grouped = new Map<string, string[]>();
  for (const [key, value] of url.searchParams.entries()) {
    if (key === "signature") continue;
    const existing = grouped.get(key);
    if (existing) existing.push(value);
    else grouped.set(key, [value]);
  }

  // Shopify always signs `logged_in_customer_id`, sending it empty for a guest.
  // Something between Shopify and this handler drops empty-valued query params,
  // so by the time we read request.url the key is simply gone — while Shopify's
  // HMAC still counts it. Verified against a real request: omitting it yields
  // 7bf7e920…, restoring it yields 1edef597…, which is what Shopify sent.
  // Without this every guest request fails signature verification, and the
  // failure looks exactly like a wrong app secret.
  if (!grouped.has("logged_in_customer_id")) {
    grouped.set("logged_in_customer_id", [""]);
  }

  // Shopify builds each "key=value" first and sorts the resulting strings, not
  // the keys. Sorting keys instead differs whenever one key is a prefix of
  // another, so match their order exactly.
  return [...grouped.entries()]
    .map(([key, values]) => `${key}=${values.join(",")}`)
    .sort()
    .join("");
}

export function verifyAppProxySignature(
  url: URL,
  appSecret: string
): boolean {
  const signature = url.searchParams.get("signature");
  if (!signature) return false;

  const expected = createHmac("sha256", appSecret)
    .update(appProxyCanonicalString(url))
    .digest("hex");

  const provided = Buffer.from(signature, "utf8");
  const computed = Buffer.from(expected, "utf8");
  if (provided.length !== computed.length) return false;
  return timingSafeEqual(provided, computed);
}

// Shopify does not expire proxy signatures itself, so a captured storefront URL
// would replay forever. Bound it.
export function isProxyTimestampFresh(url: URL, maxAgeSeconds = 900): boolean {
  const raw = url.searchParams.get("timestamp");
  if (!raw) return false;
  const timestamp = Number(raw);
  if (!Number.isFinite(timestamp)) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - timestamp);
  return ageSeconds <= maxAgeSeconds;
}
