import { afterEach, describe, expect, it } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { createTestIntegration, createTestOrg } from '@shopkeeper/db/test-helpers';
import { resolveOrganizationId } from './webhooks-shared.js';

describe('resolveOrganizationId', () => {
  const shopDomain = 'duplicate-shop.myshopify.com';
  let orgIds: string[] = [];
  let integrationIds: string[] = [];

  afterEach(async () => {
    if (integrationIds.length > 0) {
      await db.integration.deleteMany({ where: { id: { in: integrationIds } } });
      integrationIds = [];
    }
    if (orgIds.length > 0) {
      await db.organization.deleteMany({ where: { id: { in: orgIds } } });
      orgIds = [];
    }
  });

  it('returns null when no integration matches', async () => {
    await expect(resolveOrganizationId(ChannelType.shopify, 'missing.myshopify.com')).resolves.toBeNull();
  });

  it('prefers the newest integration when multiple orgs share one external account', async () => {
    const olderOrg = await createTestOrg();
    const newerOrg = await createTestOrg();
    orgIds.push(olderOrg.id, newerOrg.id);

    const olderIntegration = await createTestIntegration(olderOrg.id, {
      platform: ChannelType.shopify,
      externalAccountId: shopDomain,
    });
    const newerIntegration = await createTestIntegration(newerOrg.id, {
      platform: ChannelType.shopify,
      externalAccountId: shopDomain,
    });
    integrationIds.push(olderIntegration.id, newerIntegration.id);

    await db.integration.update({
      where: { id: olderIntegration.id },
      data: { createdAt: new Date('2026-01-01T00:00:00.000Z') },
    });
    await db.integration.update({
      where: { id: newerIntegration.id },
      data: { createdAt: new Date('2026-06-01T00:00:00.000Z') },
    });

    await expect(resolveOrganizationId(ChannelType.shopify, shopDomain)).resolves.toBe(newerOrg.id);
  });
});
