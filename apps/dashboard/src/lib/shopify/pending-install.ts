import { db } from '@shopkeeper/db';
import { withShopifyTokenLock } from '@shopkeeper/agent/shopify/access';
import logger from '@/lib/server/logger';
import {
  exchangeShopifyAccessToken,
  fetchShopifyShopIdentity,
  saveShopifyGrant,
} from '@/app/api/integrations/shopify/callback/complete-shopify-oauth';
import { readShopifyInstallClaim } from './install-claim';

// A held grant is taken again weekly, well inside its refresh token's 90 days.
const RETAKE_AFTER_MS = 7 * 24 * 60 * 60_000;

/**
 * Takes the install's grant for a store no workspace holds, with the ID token
 * Shopify admin handed the app home, so the app authenticates at install rather
 * than when the merchant finishes signing up. Returns the grant id a claim link
 * names, or null when Shopify refused and nothing is held.
 */
export async function holdShopifyInstallGrant(
  shop: string,
  idToken: string,
  config: { clientId: string; clientSecret: string },
): Promise<{ grantId: string } | null> {
  try {
    return await withShopifyTokenLock(shop, async (tx) => {
      const held = await tx.shopifyPendingInstall.findUnique({
        where: { shop },
        select: { grantId: true, updatedAt: true },
      });
      if (held && Date.now() - held.updatedAt.getTime() < RETAKE_AFTER_MS) return { grantId: held.grantId };

      const result = await exchangeShopifyAccessToken({ ...config, shopDomain: shop, idToken });
      if (!result.ok) return held ? { grantId: held.grantId } : null;
      const identity = await fetchShopifyShopIdentity(shop, result.token.accessToken).catch(() => null);
      const grant = {
        accessToken: result.token.accessToken,
        refreshToken: result.token.refreshToken,
        tokenExpiresAt: result.token.expiresAt,
        scopes: result.token.scopes ?? [],
        shopName: identity?.name ?? null,
      };
      const saved = await tx.shopifyPendingInstall.upsert({
        where: { shop },
        create: { shop, ...grant },
        update: grant,
        select: { grantId: true },
      });
      logger.info({ shop }, '[Shopify install] Holding the install grant until a workspace claims the store');
      return { grantId: saved.grantId };
    });
  } catch (error) {
    logger.error({ err: error, shop }, '[Shopify install] Could not take the install grant');
    return null;
  }
}

export type ShopifyInstallClaimResult =
  | { ok: true; integrationId: string; shop: string }
  /**
   * `claim_invalid`: forged, altered or expired. `claim_used`: its grant was
   * claimed already, or the store reinstalled since. `shopify_store_in_use`:
   * another workspace holds the store.
   */
  | { ok: false; error: 'claim_invalid' | 'claim_used' | 'shopify_store_in_use' };

/** Moves a held install grant into the workspace's Shopify connection, once. */
export async function claimShopifyInstallGrant(
  claimToken: string,
  organizationId: string,
): Promise<ShopifyInstallClaimResult> {
  const claim = readShopifyInstallClaim(claimToken);
  if (!claim) return { ok: false, error: 'claim_invalid' };

  return withShopifyTokenLock(claim.shop, async (tx) => {
    const held = await tx.shopifyPendingInstall.findUnique({ where: { shop: claim.shop } });
    if (!held || held.grantId !== claim.grantId) return { ok: false, error: 'claim_used' };

    const saved = await saveShopifyGrant({
      token: {
        accessToken: held.accessToken,
        refreshToken: held.refreshToken,
        expiresAt: held.tokenExpiresAt,
        // No recorded scopes reads as unknown, so the next app-home load
        // re-issues the grant and records them, rather than as none granted.
        scopes: held.scopes.length > 0 ? held.scopes : undefined,
      },
      canonicalShopDomain: held.shop,
      organizationId,
      shopName: held.shopName ?? held.shop,
    });
    if (!saved.ok) return { ok: false, error: saved.error };

    await tx.shopifyPendingInstall.delete({ where: { shop: held.shop } });
    logger.info({ shop: held.shop, orgId: organizationId }, '[Shopify install] Workspace claimed the store');
    return { ok: true, integrationId: saved.integrationId, shop: held.shop };
  });
}
