import { createHmac, timingSafeEqual } from 'node:crypto';
import { isRecord } from '@shopkeeper/shared/guards';
import { normalizeShopifyShopDomain } from './oauth';

/**
 * The link from the app home inside Shopify admin to the tab where the merchant
 * signs up or signs in. It names the store and the install grant waiting for
 * it, signed so it cannot name any other: only someone Shopify let open the
 * app for that store is shown one. It lasts an hour, and a claimed grant is
 * gone, so one link connects the store at most once.
 */
export interface ShopifyInstallClaim {
  shop: string;
  grantId: string;
}

const VERSION = 'v1';
const CLAIM_TTL_MS = 60 * 60_000;
const MAX_CLAIM_LENGTH = 1024;
const GRANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signature(payload: string): Buffer {
  const secret = process.env.OAUTH_ATTEMPT_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error('OAUTH_ATTEMPT_SECRET must be configured with at least 32 characters');
  }
  return createHmac('sha256', secret)
    .update(`shopkeeper-shopify-install-claim.${VERSION}.${payload}`)
    .digest();
}

export function mintShopifyInstallClaim(claim: ShopifyInstallClaim, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...claim, exp: now + CLAIM_TTL_MS })).toString('base64url');
  return `${VERSION}.${payload}.${signature(payload).toString('base64url')}`;
}

/** The store and grant a claim link names; null for anything forged, altered or expired. */
export function readShopifyInstallClaim(token: string | null | undefined, now = Date.now()): ShopifyInstallClaim | null {
  if (typeof token !== 'string' || token.length > MAX_CLAIM_LENGTH) return null;
  const [version, payload, signed, ...rest] = token.split('.');
  if (version !== VERSION || !payload || !signed || rest.length > 0) return null;

  const expected = signature(payload);
  const provided = Buffer.from(signed, 'base64url');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!isRecord(claims) || typeof claims.exp !== 'number' || claims.exp <= now) return null;
  const shop = normalizeShopifyShopDomain(typeof claims.shop === 'string' ? claims.shop : null);
  if (!shop || shop !== claims.shop) return null;
  if (typeof claims.grantId !== 'string' || !GRANT_ID_PATTERN.test(claims.grantId)) return null;
  return { shop, grantId: claims.grantId };
}
