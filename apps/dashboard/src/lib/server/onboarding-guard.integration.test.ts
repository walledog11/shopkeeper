import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockClerkSession } from '@/test-fixtures/clerk-session';
import { ChannelType, db, INTEGRATION_REAUTH_SENTINEL } from '@shopkeeper/db';
import { cleanupTestData, createTestIntegration, createTestOrg } from '@shopkeeper/db/test-helpers';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { getIncompleteOnboardingRedirect } from './onboarding-guard';
import { PATCH as patchOrg } from '@/app/api/org/route';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  mockClerkSession({
    userId: 'usr_test',
    orgId: org.clerkOrgId,
    orgRole: 'org:admin',
  });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
});

async function connectShopify() {
  return createTestIntegration(org.id, {
    platform: ChannelType.shopify,
    externalAccountId: 'test-shop.myshopify.com',
    accessToken: 'shpat_test_token',
  });
}

async function reloadOrgSettings() {
  const row = await db.organization.findUniqueOrThrow({ where: { id: org.id } });
  return row.settings;
}

describe('getIncompleteOnboardingRedirect', () => {
  it('sends a fresh workspace to the store step', async () => {
    await expect(getIncompleteOnboardingRedirect(org.id, org.settings)).resolves.toBe('/onboarding?step=shopify');
  });

  it('resumes setup once the store is connected', async () => {
    await connectShopify();

    await expect(getIncompleteOnboardingRedirect(org.id, org.settings)).resolves.toBe('/onboarding');
  });

  it('treats a Shopify grant marked for reconnect as not connected', async () => {
    await db.integration.create({
      data: {
        organizationId: org.id,
        platform: ChannelType.shopify,
        externalAccountId: 'test-shop.myshopify.com',
        accessToken: 'shpat_test_token',
        tokenExpiresAt: INTEGRATION_REAUTH_SENTINEL,
      },
    });

    await expect(getIncompleteOnboardingRedirect(org.id, org.settings)).resolves.toBe('/onboarding?step=shopify');
  });

  it('stops redirecting once setup is finished', async () => {
    await connectShopify();
    const completedAt = new Date().toISOString();
    const patchRes = await patchOrg(new Request('http://localhost/api/org', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { onboardingCompletedAt: completedAt } }),
    }));
    expect(patchRes.status).toBe(200);

    const saved = await reloadOrgSettings();
    expect(saved).toMatchObject({ onboardingCompletedAt: completedAt });
    await expect(getIncompleteOnboardingRedirect(org.id, saved)).resolves.toBeNull();
  });
});
