import { expect, test } from '@playwright/test';
import type { APIResponse } from '@playwright/test';
import dbHelpers from './db-helpers.cjs';

const { ChannelType, db, disconnectDb, ensureE2EEmailIntegration, getE2EOrg } = dbHelpers;

// Mirrors the onboarding-complete settings seeded by scripts/test-infra.mjs.
const COMPLETE_SETTINGS = {
  autoPlanOnOpen: false,
  spamFilterEnabled: false,
  onboardingCompletedAt: '2020-01-01T00:00:00.000Z',
};

async function setOrgIncomplete(orgId: string) {
  await db.integration.deleteMany({ where: { organizationId: orgId } });
  await db.organization.update({
    where: { id: orgId },
    data: { settings: { autoPlanOnOpen: false, spamFilterEnabled: false } },
  });
}

async function restoreSeededOrg(orgId: string) {
  await db.integration.deleteMany({ where: { organizationId: orgId } });
  await ensureE2EEmailIntegration(orgId);
  await db.organization.update({ where: { id: orgId }, data: { settings: COMPLETE_SETTINGS } });
}

function locationOf(res: APIResponse) {
  return res.headers()['location'] ?? '';
}

test.afterAll(async () => {
  const org = await getE2EOrg().catch(() => null);
  if (org) {
    await restoreSeededOrg(org.id).catch(() => undefined);
  }
  await disconnectDb();
});

test('onboarding guard walks a new org from Shopify to a completed dashboard', async ({ request }) => {
  test.skip(process.env.E2E_AUTH_BYPASS !== 'true', 'E2E auth bypass is disabled');

  const org = await getE2EOrg();
  await setOrgIncomplete(org.id);

  // 1. A fresh org is pinned to the Shopify step.
  let res = await request.get('/dashboard', { maxRedirects: 0 });
  expect(res.status(), await res.text()).toBeGreaterThanOrEqual(300);
  expect(res.status()).toBeLessThan(400);
  expect(locationOf(res)).toContain('/onboarding');
  expect(locationOf(res)).toContain('step=shopify');

  // 2. Connect Shopify (seeded as a mock OAuth result).
  await db.integration.create({
    data: {
      organizationId: org.id,
      platform: ChannelType.shopify,
      externalAccountId: 'onboarding-e2e.myshopify.com',
      accessToken: 'shpat_e2e_token',
    },
  });

  res = await request.get('/dashboard', { maxRedirects: 0 });
  expect(res.status()).toBeGreaterThanOrEqual(300);
  expect(res.status()).toBeLessThan(400);
  expect(locationOf(res)).toContain('step=email');

  // 3. Save the forwarding support address through the real integrations route.
  const saveRes = await request.post('/api/integrations', {
    data: { platform: 'email', externalAccountId: 'Support@Onboarding-E2E.com' },
  });
  expect(saveRes.status(), await saveRes.text()).toBe(201);

  res = await request.get('/dashboard', { maxRedirects: 0 });
  expect(res.status()).toBeGreaterThanOrEqual(300);
  expect(res.status()).toBeLessThan(400);
  expect(locationOf(res)).toContain('step=plan');

  // 4. Finish onboarding — stamp completion via the real org route.
  const patchRes = await request.patch('/api/org', {
    data: { settings: { onboardingCompletedAt: new Date().toISOString() } },
  });
  expect(patchRes.status(), await patchRes.text()).toBe(200);

  // 5. The dashboard now loads without bouncing back to onboarding.
  res = await request.get('/dashboard', { maxRedirects: 0 });
  expect(res.status(), locationOf(res)).toBeLessThan(400);
  expect(locationOf(res)).not.toContain('/onboarding');

  // 6. The two setup milestones the home WorkflowSetupBanner counts as done
  //    (Shopify connected + email forwarding saved) are persisted.
  const integrations = await db.integration.findMany({ where: { organizationId: org.id } });
  expect(integrations.map(i => i.platform).sort()).toEqual([ChannelType.email, ChannelType.shopify].sort());
  const email = integrations.find(i => i.platform === ChannelType.email);
  expect(email?.externalAccountId).toBe('support@onboarding-e2e.com');
});
