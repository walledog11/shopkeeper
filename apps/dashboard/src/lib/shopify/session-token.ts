import { createHmac, timingSafeEqual } from 'node:crypto';
import { isRecord } from '@shopkeeper/shared/guards';
import { normalizeShopifyShopDomain } from './oauth';

// Shopify's own libraries allow this much drift between its clock and ours.
const CLOCK_TOLERANCE_SECONDS = 10;

export interface VerifiedShopifySessionToken {
  /** The shop's myshopify domain, from the `dest` claim. */
  shop: string;
}

function decodeJsonSegment(segment: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function hostnameOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

/**
 * Verifies the ID token (session token) Shopify admin hands an embedded app:
 * an HS256 JWT signed with the app's client secret, addressed to its client id,
 * and issued by the shop it names. Returns null for anything else.
 */
export function verifyShopifySessionToken(
  token: string | null | undefined,
  { clientId, clientSecret, now = Date.now() }: { clientId: string; clientSecret: string; now?: number },
): VerifiedShopifySessionToken | null {
  const segments = token?.split('.');
  if (!segments || segments.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = segments;

  const header = decodeJsonSegment(encodedHeader);
  if (header?.alg !== 'HS256') return null;

  const expected = createHmac('sha256', clientSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const provided = Buffer.from(signature, 'base64url');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  const claims = decodeJsonSegment(encodedPayload);
  if (!claims) return null;

  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(clientId)) return null;

  const nowSeconds = now / 1000;
  if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds - CLOCK_TOLERANCE_SECONDS) return null;
  if (typeof claims.nbf !== 'number' || claims.nbf > nowSeconds + CLOCK_TOLERANCE_SECONDS) return null;

  const destination = hostnameOf(claims.dest);
  if (!destination || destination !== hostnameOf(claims.iss)) return null;

  const shop = normalizeShopifyShopDomain(destination);
  return shop ? { shop } : null;
}
