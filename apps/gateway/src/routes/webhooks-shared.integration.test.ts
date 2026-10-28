import { afterEach, describe, expect, it } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { createTestIntegration, createTestOrg } from '@shopkeeper/db/test-helpers';
import { resolveOrganizationId } from './webhooks-shared.js';

describe('resolveOrganizationId', () => {
  // Exercised on tiktok, not shopify: integrations_shopify_account_unique (and
  // its ig_dm twin) now make a cross-org duplicate impossible for those
  // platforms, so the newest-wins ordering is only reachable for tiktok and
  // email — the platforms that can still legitimately share an external account.
  const sharedAccountId = 'duplicate-seller-account';
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
    await expect(resolveOrganizationId(ChannelType.tiktok, 'missing-seller-account')).resolves.toBeNull();
  });

  it('prefers the newest integration when multiple orgs share one external account', async () => {
    const olderOrg = await createTestOrg();
    const newerOrg = await createTestOrg();
    orgIds.push(olderOrg.id, newerOrg.id);

    const olderIntegration = await createTestIntegration(olderOrg.id, {
      platform: ChannelType.tiktok,
      externalAccountId: sharedAccountId,
    });
    const newerIntegration = await createTestIntegration(newerOrg.id, {
      platform: ChannelType.tiktok,
      externalAccountId: sharedAccountId,
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

    await expect(resolveOrganizationId(ChannelType.tiktok, sharedAccountId)).resolves.toBe(newerOrg.id);
  });
});
