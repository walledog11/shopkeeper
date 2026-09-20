import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { cleanupTestData, createTestIntegration, createTestOrg } from '@shopkeeper/db/test-helpers';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { auth } from '@clerk/nextjs/server';
import { getIncompleteOnboardingRedirect } from './onboarding-guard';
import { POST as createIntegration } from '@/app/api/integrations/route';
import { PATCH as patchOrg } from '@/app/api/org/route';

const USER_ID = 'usr_test';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({
    userId: USER_ID,
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

async function connectEmail() {
  return createTestIntegration(org.id, {
    platform: ChannelType.email,
    externalAccountId: 'support@store.com',
    fromEmail: 'support@store.com',
  });
}

async function bindPhone() {
  const member = await db.orgMember.upsert({
    where: { organizationId_clerkUserId: { organizationId: org.id, clerkUserId: USER_ID } },
    create: { organizationId: org.id, clerkUserId: USER_ID },
    update: {},
    select: { id: true },
  });
  return db.orgMemberImessageBinding.create({
    data: {
      orgMemberId: member.id,
      senderId: `+1555${Date.now()}`,
      spaceId: 'space_test',
    },
  });
}

async function reloadOrgSettings() {
  const row = await db.organization.findUniqueOrThrow({ where: { id: org.id } });
  return row.settings;
}

describe('getIncompleteOnboardingRedirect', () => {
  it('sends a fresh org to the Shopify step first', async () => {
    await expect(getIncompleteOnboardingRedirect(org.id, org.settings, USER_ID)).resolves.toBe(
      '/onboarding?step=shopify',
    );
  });

  it('sends an org with Shopify but no email to the email step', async () => {
    await connectShopify();

    await expect(getIncompleteOnboardingRedirect(org.id, org.settings, USER_ID)).resolves.toBe(
      '/onboarding?step=email',
    );
  });

  it('sends a store-and-inbox org with no phone to the connect step', async () => {
    await connectShopify();
    await connectEmail();

    await expect(getIncompleteOnboardingRedirect(org.id, org.settings, USER_ID)).resolves.toBe(
      '/onboarding?step=connect',
    );
  });

  it('sends a fully connected but uncompleted org to the plan step', async () => {
    await connectShopify();
    await connectEmail();
    await bindPhone();

    await expect(getIncompleteOnboardingRedirect(org.id, org.settings, USER_ID)).resolves.toBe(
      '/onboarding?step=plan',
    );
  });

  it('skips the connect step when there is no signed-in member', async () => {
    await connectShopify();
    await connectEmail();

    await expect(getIncompleteOnboardingRedirect(org.id, org.settings, null)).resolves.toBe(
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

    await expect(getIncompleteOnboardingRedirect(org.id, org.settings, USER_ID)).resolves.toBe(
      '/onboarding?step=shopify',
    );
  });
});

describe('onboarding finish contract', () => {
  it('saves the support email and clears the redirect once onboarding completes', async () => {
    await connectShopify();

    await expect(getIncompleteOnboardingRedirect(org.id, org.settings, USER_ID)).resolves.toBe(
      '/onboarding?step=email',
    );

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

    await expect(getIncompleteOnboardingRedirect(org.id, await reloadOrgSettings(), USER_ID)).resolves.toBe(
      '/onboarding?step=connect',
    );

    const completedAt = new Date().toISOString();
    const patchRes = await patchOrg(new Request('http://localhost/api/org', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { onboardingCompletedAt: completedAt } }),
    }));
    expect(patchRes.status).toBe(200);

    const saved = await reloadOrgSettings();
    expect(saved).toMatchObject({ onboardingCompletedAt: completedAt });

    await expect(getIncompleteOnboardingRedirect(org.id, saved, USER_ID)).resolves.toBeNull();
  });

  it('keeps redirecting when the completion flag is set without the integrations', async () => {
    const patchRes = await patchOrg(new Request('http://localhost/api/org', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { onboardingCompletedAt: new Date().toISOString() } }),
    }));
    expect(patchRes.status).toBe(200);

    await expect(getIncompleteOnboardingRedirect(org.id, await reloadOrgSettings(), USER_ID)).resolves.toBeNull();
  });
});
