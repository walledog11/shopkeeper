import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';
import { mintShopifyInstallClaim } from './install-claim';
import { claimShopifyInstallGrant } from './pending-install';

// A claim link connects the store installed from Shopify admin to whichever
// workspace redeems it, so it must name exactly one held grant, once.

let shop: string;
const orgIds: string[] = [];

async function holdGrant(grantId = randomUUID()) {
  await db.shopifyPendingInstall.create({
    data: {
      shop,
      grantId,
      accessToken: 'shpat_held',
      refreshToken: 'shprt_held',
      tokenExpiresAt: new Date(Date.now() + 60 * 60_000),
      scopes: ['read_orders'],
      shopName: 'Held Store',
    },
  });
  return grantId;
}

async function newOrg() {
  const org = await createTestOrg();
  orgIds.push(org.id);
  return org;
}

beforeEach(() => {
  shop = `claim-${randomUUID().slice(0, 8)}.myshopify.com`;
});

afterEach(async () => {
  await db.shopifyPendingInstall.deleteMany({ where: { shop } });
  await Promise.all(orgIds.splice(0).map((orgId) => cleanupTestData(orgId)));
});

describe('claiming a held Shopify install', () => {
  it('moves the grant into the workspace once', async () => {
    const org = await newOrg();
    const grantId = await holdGrant();
    const claim = mintShopifyInstallClaim({ shop, grantId });
    // Held like an Integration's: encrypted at rest.
    const [stored] = await db.$queryRaw<{ access_token: string }[]>`SELECT access_token FROM shopify_pending_installs WHERE shop = ${shop}`;
    expect(stored.access_token).not.toContain('shpat_held');

    const result = await claimShopifyInstallGrant(claim, org.id);
    expect(result).toMatchObject({ ok: true, shop });

    const integration = await db.integration.findFirstOrThrow({ where: { organizationId: org.id, platform: 'shopify' } });
    expect(integration).toMatchObject({ externalAccountId: shop, accessToken: 'shpat_held', refreshToken: 'shprt_held', fromEmail: 'Held Store' });
    expect(await db.shopifyPendingInstall.count({ where: { shop } })).toBe(0);

    // The same link again finds nothing to claim, for any workspace.
    const other = await newOrg();
    await expect(claimShopifyInstallGrant(claim, other.id)).resolves.toEqual({ ok: false, error: 'claim_used' });
  });

  it('refuses a link that was altered or has expired', async () => {
    const org = await newOrg();
    const grantId = await holdGrant();
    const valid = mintShopifyInstallClaim({ shop, grantId });
    const [version, , signature] = valid.split('.');
    const otherStore = Buffer.from(JSON.stringify({ shop: 'victim.myshopify.com', grantId, exp: Date.now() + 60_000 })).toString('base64url');
    const expired = mintShopifyInstallClaim({ shop, grantId }, Date.now() - 2 * 60 * 60_000);

    await expect(claimShopifyInstallGrant(`${version}.${otherStore}.${signature}`, org.id)).resolves.toEqual({ ok: false, error: 'claim_invalid' });
    await expect(claimShopifyInstallGrant(expired, org.id)).resolves.toEqual({ ok: false, error: 'claim_invalid' });
    expect(await db.integration.count({ where: { organizationId: org.id } })).toBe(0);
    expect(await db.shopifyPendingInstall.count({ where: { shop } })).toBe(1);
  });

  it('refuses a link minted for an earlier install of the store', async () => {
    const org = await newOrg();
    await holdGrant();
    const earlier = mintShopifyInstallClaim({ shop, grantId: randomUUID() });

    await expect(claimShopifyInstallGrant(earlier, org.id)).resolves.toEqual({ ok: false, error: 'claim_used' });
    expect(await db.integration.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it('leaves a store another workspace holds where it is', async () => {
    const owner = await newOrg();
    await db.integration.create({
      data: { organizationId: owner.id, platform: 'shopify', externalAccountId: shop, accessToken: 'shpat_owner' },
    });
    const org = await newOrg();
    const claim = mintShopifyInstallClaim({ shop, grantId: await holdGrant() });

    await expect(claimShopifyInstallGrant(claim, org.id)).resolves.toEqual({ ok: false, error: 'shopify_store_in_use' });
    const owned = await db.integration.findFirstOrThrow({ where: { externalAccountId: shop, platform: 'shopify' } });
    expect(owned).toMatchObject({ organizationId: owner.id, accessToken: 'shpat_owner' });
    expect(await db.integration.count({ where: { organizationId: org.id } })).toBe(0);
  });
});
