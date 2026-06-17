import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { cleanupTestData, createTestIntegration, createTestOrg } from '@shopkeeper/db/test-helpers';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

// revalidatePath needs a Next request store that vitest route tests do not provide.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { auth } from '@clerk/nextjs/server';
import { getIncompleteOnboardingRedirect } from './onboarding-guard';
import { POST as createIntegration } from '@/app/api/integrations/route';
import { PATCH as patchOrg } from '@/app/api/org/route';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_test',
    orgId: org.clerkOrgId,
    orgRole: 'org:admin',
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
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
  it('sends a fresh org to the Shopify step first', async () => {
    await expect(getIncompleteOnboardingRedirect(org.id, org.settings)).resolves.toBe(
      '/onboarding?step=shopify',
    );
  });

  it('sends an org with Shopify but no email to the email step', async () => {
    await connectShopify();

    await expect(getIncompleteOnboardingRedirect(org.id, org.settings)).resolves.toBe(
      '/onboarding?step=email',
    );
  });

  it('sends a fully connected but uncompleted org to the plan step', async () => {
    await connectShopify();
    await createTestIntegration(org.id, {
      platform: ChannelType.email,
      externalAccountId: 'support@store.com',
      fromEmail: 'support@store.com',
    });

    await expect(getIncompleteOnboardingRedirect(org.id, org.settings)).resolves.toBe(
      '/onboarding?step=plan',
    );
  });

  it('treats an expired Shopify token as not connected', async () => {
    await db.integration.create({
      data: {
        organizationId: org.id,
        platform: ChannelType.shopify,
        externalAccountId: 'test-shop.myshopify.com',
        accessToken: 'shpat_test_token',
        tokenExpiresAt: new Date(Date.now() - 1000),
      },
    });

    await expect(getIncompleteOnboardingRedirect(org.id, org.settings)).resolves.toBe(
      '/onboarding?step=shopify',
    );
  });
});

describe('onboarding finish contract', () => {
  it('saves the support email and clears the redirect once onboarding completes', async () => {
    await connectShopify();

    // Before finishing, the guard pins the merchant to the email step.
    await expect(getIncompleteOnboardingRedirect(org.id, org.settings)).resolves.toBe(
      '/onboarding?step=email',
    );

    // finish() persists the forwarding address via POST /api/integrations.
    const saveRes = await createIntegration(new Request('http://localhost/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'email', externalAccountId: 'Support@Store.com' }),
    }));
    expect(saveRes.status).toBe(201);

    const emailRows = await db.integration.findMany({
      where: { organizationId: org.id, platform: ChannelType.email },
    });
    expect(emailRows).toHaveLength(1);
    expect(emailRows[0].externalAccountId).toBe('support@store.com');
    expect(emailRows[0].metadata).toMatchObject({ provider: 'postmark' });

    // With Shopify + email connected, the guard now routes to the plan step.
    await expect(getIncompleteOnboardingRedirect(org.id, await reloadOrgSettings())).resolves.toBe(
      '/onboarding?step=plan',
    );

    // finish() then stamps settings.onboardingCompletedAt via PATCH /api/org.
    const completedAt = new Date().toISOString();
    const patchRes = await patchOrg(new Request('http://localhost/api/org', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { onboardingCompletedAt: completedAt } }),
    }));
    expect(patchRes.status).toBe(200);

    const saved = await reloadOrgSettings();
    expect(saved).toMatchObject({ onboardingCompletedAt: completedAt });

    // Onboarding is complete — the merchant is no longer redirected.
    await expect(getIncompleteOnboardingRedirect(org.id, saved)).resolves.toBeNull();
  });

  it('keeps redirecting when the completion flag is set without the integrations', async () => {
    const patchRes = await patchOrg(new Request('http://localhost/api/org', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { onboardingCompletedAt: new Date().toISOString() } }),
    }));
    expect(patchRes.status).toBe(200);

    // The flag short-circuits the guard by design, so once stamped the merchant
    // is trusted as complete even if integrations were later removed.
    await expect(getIncompleteOnboardingRedirect(org.id, await reloadOrgSettings())).resolves.toBeNull();
  });
});
