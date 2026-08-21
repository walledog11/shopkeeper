import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countConversationsThisMonth,
  db,
  getConversationAllowance,
  PLAN_LIMITS,
  planLimitsFor,
  resolvePlanTier,
  utcMonthStart,
} from '@shopkeeper/db';
import { createTestCustomer, createTestOrg, createTestThread, cleanupTestData } from '@shopkeeper/db/test-helpers';

const PRICE_IDS = { starter: 'price_starter', pro: 'price_pro' };

let orgId: string | null = null;

// One customer per thread, because a partial unique index allows only one open
// thread per (org, customer, channel) — seeding many open threads onto a single
// customer trips it. createMany rather than a loop keeps the over-limit case,
// which needs 501 rows, a real-database test without making it a slow one.
async function seedThreads(organizationId: string, count: number, channel: 'email' | 'sms_agent' = 'email') {
  const prefix = `c-${channel}-${Date.now()}-${Math.random()}`;
  await db.customer.createMany({
    data: Array.from({ length: count }, (_unused, index) => ({
      organizationId,
      platformId: `${prefix}-${index}`,
    })),
  });
  const customers = await db.customer.findMany({
    where: { organizationId, platformId: { startsWith: prefix } },
    select: { id: true },
  });
  await db.thread.createMany({
    data: customers.map((customer) => ({
      organizationId,
      customerId: customer.id,
      channelType: channel,
      status: 'open' as const,
      tag: 'Support',
    })),
  });
}

describe('plan tier resolution', () => {
  it('maps a known price id to its tier', () => {
    expect(resolvePlanTier('price_starter', PRICE_IDS)).toBe('starter');
    expect(resolvePlanTier('price_pro', PRICE_IDS)).toBe('pro');
  });

  it('treats an org with no subscription as unknown, not as the cheapest plan', () => {
    expect(resolvePlanTier(null, PRICE_IDS)).toBe('unknown');
    expect(resolvePlanTier('price_something_else', PRICE_IDS)).toBe('unknown');
  });

  it('resolves to unknown when the price ids are unconfigured, so the cap stays inert', () => {
    // This is production today: PRICE_ID_STARTER / PRICE_ID_PRO are unset, so a
    // real Starter subscriber must still come back unbounded rather than be
    // capped on the strength of a missing env var.
    expect(resolvePlanTier('price_starter', {})).toBe('unknown');
    expect(planLimitsFor('price_starter', {}).conversationsPerMonth).toBeNull();
    expect(planLimitsFor('price_starter', {}).seats).toBeNull();
  });

  it('carries the numbers the pricing page used to claim', () => {
    expect(PLAN_LIMITS.starter).toEqual({ conversationsPerMonth: 500, seats: 1 });
    expect(PLAN_LIMITS.pro).toEqual({ conversationsPerMonth: null, seats: 2 });
  });
});

describe('conversation counting', () => {
  afterEach(async () => {
    await cleanupTestData(orgId);
    orgId = null;
  });

  it('counts customer threads opened this month', async () => {
    const org = await createTestOrg();
    orgId = org.id;

    await seedThreads(org.id, 3);

    await expect(countConversationsThisMonth(org.id)).resolves.toBe(3);
  });

  it('does not count operator threads, which are the merchant talking to their own agent', async () => {
    const org = await createTestOrg();
    orgId = org.id;

    await seedThreads(org.id, 2);
    await seedThreads(org.id, 4, 'sms_agent');

    await expect(countConversationsThisMonth(org.id)).resolves.toBe(2);
  });

  it('does not count threads opened before this month', async () => {
    const org = await createTestOrg();
    orgId = org.id;

    const customer = await createTestCustomer(org.id, 'c-old');
    const thread = await createTestThread(org.id, customer.id, 'email');
    const lastMonth = new Date(utcMonthStart().getTime() - 24 * 60 * 60 * 1000);
    await db.thread.update({ where: { id: thread.id }, data: { createdAt: lastMonth } });

    await expect(countConversationsThisMonth(org.id)).resolves.toBe(0);
  });

  it('does not count soft-deleted threads', async () => {
    const org = await createTestOrg();
    orgId = org.id;

    const customer = await createTestCustomer(org.id, 'c-deleted');
    const thread = await createTestThread(org.id, customer.id, 'email');
    await db.thread.update({ where: { id: thread.id }, data: { deletedAt: new Date() } });

    await expect(countConversationsThisMonth(org.id)).resolves.toBe(0);
  });

  it('scopes the count to one org', async () => {
    const org = await createTestOrg();
    orgId = org.id;
    const other = await createTestOrg();

    await seedThreads(org.id, 1);
    await seedThreads(other.id, 5);

    await expect(countConversationsThisMonth(org.id)).resolves.toBe(1);
    await cleanupTestData(other.id);
  });
});

describe('conversation allowance', () => {
  afterEach(async () => {
    await cleanupTestData(orgId);
    orgId = null;
  });

  it('reports unbounded plans without counting anything', async () => {
    const org = await createTestOrg();
    orgId = org.id;

    await seedThreads(org.id, 2);

    const allowance = await getConversationAllowance(org.id, 'price_pro', PRICE_IDS);
    expect(allowance).toEqual({ tier: 'pro', limit: null, used: 0, overLimit: false });
  });

  it('is not over the limit while usage only meets it', async () => {
    const org = await createTestOrg();
    orgId = org.id;

    await seedThreads(org.id, 2);

    const allowance = await getConversationAllowance(org.id, 'price_starter', {
      ...PRICE_IDS,
    });
    expect(allowance.tier).toBe('starter');
    expect(allowance.overLimit).toBe(false);
  });
});

describe('degradeForConversationLimit', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.PRICE_ID_STARTER = PRICE_IDS.starter;
    process.env.PRICE_ID_PRO = PRICE_IDS.pro;
  });

  afterEach(async () => {
    delete process.env.PRICE_ID_STARTER;
    delete process.env.PRICE_ID_PRO;
    await cleanupTestData(orgId);
    orgId = null;
    vi.restoreAllMocks();
  });

  async function loadDegrade() {
    const notify = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./planning-notifications.js', () => ({
      sendConversationLimitNotification: notify,
    }));
    const { degradeForConversationLimit } = await import('./plan-limit.js');
    return { degradeForConversationLimit, notify };
  }

  it('lets planning through for an org under its cap', async () => {
    const org = await createTestOrg();
    orgId = org.id;
    await db.organization.update({
      where: { id: org.id },
      data: { stripePriceId: PRICE_IDS.starter },
    });
    await seedThreads(org.id, 1);

    const { degradeForConversationLimit, notify } = await loadDegrade();
    await expect(degradeForConversationLimit(org.id, 'thread_1')).resolves.toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it('lets planning through when the org has no recognised subscription', async () => {
    const org = await createTestOrg();
    orgId = org.id;
    await seedThreads(org.id, 3);

    const { degradeForConversationLimit } = await loadDegrade();
    await expect(degradeForConversationLimit(org.id, 'thread_1')).resolves.toBe(false);
  });

  it('pauses planning and notifies once when the org is over its cap', async () => {
    const org = await createTestOrg();
    orgId = org.id;
    await db.organization.update({
      where: { id: org.id },
      data: { stripePriceId: PRICE_IDS.starter },
    });
    await seedThreads(org.id, PLAN_LIMITS.starter.conversationsPerMonth! + 1);

    const { degradeForConversationLimit, notify } = await loadDegrade();

    await expect(degradeForConversationLimit(org.id, 'thread_1')).resolves.toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);

    // The merchant is told once per billing period, not once per customer
    // message — an over-cap workspace keeps receiving mail all month.
    await expect(degradeForConversationLimit(org.id, 'thread_2')).resolves.toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('fails open when the org cannot be read, rather than silently stopping the agent', async () => {
    const { degradeForConversationLimit } = await loadDegrade();
    // A row id that does not exist stands in for the read failing: a commercial
    // cap must never be the reason a merchant's agent goes quiet.
    await expect(
      degradeForConversationLimit('00000000-0000-0000-0000-000000000000', 'thread_1'),
    ).resolves.toBe(false);
  });
});
