import { createHmac, timingSafeEqual } from 'node:crypto';

// Short-lived org-scoped SSE credential: base64url(JSON {orgId, exp}) + "." +
// hex HMAC-SHA256 of that segment. Minted by the dashboard, verified by the gateway.

export const REALTIME_TOKEN_TTL_MS = 5 * 60 * 1000;

function signRealtimeSegment(encoded: string, secret: string): string {
  return createHmac('sha256', secret).update(encoded).digest('hex');
}

export function mintRealtimeToken(
  orgId: string,
  secret: string,
  ttlMs: number = REALTIME_TOKEN_TTL_MS,
): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + ttlMs;
  const encoded = Buffer.from(JSON.stringify({ orgId, exp: expiresAt })).toString('base64url');
  const signature = signRealtimeSegment(encoded, secret);
  return { token: `${encoded}.${signature}`, expiresAt };
}

export function verifyRealtimeToken(
  token: string | undefined | null,
  secret: string,
): string | null {
  if (!token) return null;

  const dot = token.indexOf('.');
  if (dot <= 0) return null;

  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = signRealtimeSegment(encoded, secret);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  let payload: { orgId?: unknown; exp?: unknown };
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof payload.orgId !== 'string' || typeof payload.exp !== 'number') return null;
  if (payload.exp < Date.now()) return null;

  return payload.orgId;
}
