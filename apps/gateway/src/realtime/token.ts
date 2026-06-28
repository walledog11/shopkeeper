import { createHmac, timingSafeEqual } from 'node:crypto';
import { getInternalApiSecret } from '../config/env.js';

// Realtime tokens are minted by the dashboard (/api/realtime/token) and verified
// here. They grant only a subscription scoped to one org — no data flows over the
// channel — so they carry a short TTL and are passed as an EventSource query param
// (EventSource cannot set headers). Signing key is the shared INTERNAL_API_SECRET.
//
// Format: base64url(JSON {orgId, exp}) + "." + hex HMAC-SHA256 of that segment.

function sign(encoded: string, secret: string): string {
  return createHmac('sha256', secret).update(encoded).digest('hex');
}

export function verifyRealtimeToken(token: string | undefined | null): string | null {
  if (!token) return null;

  const dot = token.indexOf('.');
  if (dot <= 0) return null;

  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = sign(encoded, getInternalApiSecret());
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
