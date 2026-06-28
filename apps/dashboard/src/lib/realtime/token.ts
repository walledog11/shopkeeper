import { createHmac } from "node:crypto"

// Mints the short-lived token the browser hands to the gateway SSE endpoint.
// Wire format must match apps/gateway/src/realtime/token.ts:
//   base64url(JSON {orgId, exp}) + "." + hex HMAC-SHA256 of that segment.
export const REALTIME_TOKEN_TTL_MS = 5 * 60 * 1000

export function mintRealtimeToken(
  orgId: string,
  secret: string,
  ttlMs: number = REALTIME_TOKEN_TTL_MS,
): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + ttlMs
  const encoded = Buffer.from(JSON.stringify({ orgId, exp: expiresAt })).toString("base64url")
  const signature = createHmac("sha256", secret).update(encoded).digest("hex")
  return { token: `${encoded}.${signature}`, expiresAt }
}
