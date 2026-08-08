import { createHmac, randomBytes, createHash, timingSafeEqual } from "crypto";

// Storefront tokens are minted for anonymous shoppers, so they are signed with a
// dedicated secret rather than INTERNAL_API_SECRET — a leaked storefront token
// must never be usable against any internal gateway hop.
function signingSecret(): string {
  const secret = process.env.STOREFRONT_CHAT_SIGNING_SECRET;
  if (!secret) throw new Error("STOREFRONT_CHAT_SIGNING_SECRET is not configured");
  return secret;
}

export interface StorefrontTokenPayload {
  sessionId: string;
  orgId: string;
  integrationId: string;
  shop: string;
  exp: number;
}

export function mintSessionToken(
  payload: Omit<StorefrontTokenPayload, "exp">,
  ttlMs = 60 * 60 * 1000
): string {
  const body: StorefrontTokenPayload = { ...payload, exp: Date.now() + ttlMs };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = createHmac("sha256", signingSecret()).update(encoded).digest("hex");
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): StorefrontTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;

  const expected = createHmac("sha256", signingSecret()).update(encoded).digest("hex");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as StorefrontTokenPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    if (!payload.sessionId || !payload.orgId) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createResumeSecret(): { secret: string; hash: string } {
  const secret = randomBytes(32).toString("base64url");
  return { secret, hash: hashResumeSecret(secret) };
}

// Stored hashed so a database read cannot resume anyone's session.
export function hashResumeSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}
