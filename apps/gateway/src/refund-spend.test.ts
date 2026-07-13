import { afterEach, describe, expect, it } from 'vitest';
import {
  commitDailyRefundSpendReservation,
  getDailyRefundSpendCents,
  incrementDailyRefundSpendCents,
  markDailyRefundSpendReservationUnknown,
  releaseDailyRefundSpendReservation,
  reserveDailyRefundSpend,
  utcDayString,
} from '@shopkeeper/db';
import { createTestOrg, cleanupTestData } from '@shopkeeper/db/test-helpers';
import { defineTool, numberArg } from '@shopkeeper/agent/tools';
import { executeToolWithStatus } from '@shopkeeper/agent/executor';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';

let orgId: string | null = null;

describe('refund spend', () => {
  afterEach(async () => {
    await cleanupTestData(orgId);
    orgId = null;
  });

  it('returns 0 when no spend is recorded today', async () => {
    const org = await createTestOrg();
    orgId = org.id;

    await expect(getDailyRefundSpendCents(org.id)).resolves.toBe(0);
  });

  it('returns the current total after increments', async () => {
    const org = await createTestOrg();
    orgId = org.id;

    await incrementDailyRefundSpendCents(org.id, 1500);
    await incrementDailyRefundSpendCents(org.id, 750);

    await expect(getDailyRefundSpendCents(org.id)).resolves.toBe(2250);
  });

  it('ignores non-positive or non-finite deltas', async () => {
    const org = await createTestOrg();
    orgId = org.id;

    await incrementDailyRefundSpendCents(org.id, 0);
    await incrementDailyRefundSpendCents(org.id, -50);
    await incrementDailyRefundSpendCents(org.id, NaN);

    await expect(getDailyRefundSpendCents(org.id)).resolves.toBe(0);
  });

  it('scopes spend by day', async () => {
    const org = await createTestOrg();
    orgId = org.id;

    await incrementDailyRefundSpendCents(org.id, 400, '2020-01-01');

    await expect(getDailyRefundSpendCents(org.id, '2020-01-01')).resolves.toBe(400);
    await expect(getDailyRefundSpendCents(org.id, utcDayString())).resolves.toBe(0);
  });

  it('starts a fresh reservation budget on the next UTC day', async () => {
    const org = await createTestOrg();
    orgId = org.id;
    const firstDay = await reserveDailyRefundSpend({
      orgId: org.id,
      operationKey: 'execution:daily-goodwill',
      tool: 'create_refund',
      input: { amount: '10.00' },
      requestedCents: 1000,
      capCents: 1000,
      day: '2026-07-13',
    });
    if (firstDay.kind !== 'reserved') throw new Error('Expected first-day reservation');
    await commitDailyRefundSpendReservation(firstDay.reservation.id, 1000);

    const secondDay = await reserveDailyRefundSpend({
      orgId: org.id,
      operationKey: 'execution:daily-goodwill',
      tool: 'create_refund',
      input: { amount: '10.00' },
      requestedCents: 1000,
      capCents: 1000,
      day: '2026-07-14',
    });

    expect(secondDay).toMatchObject({
      kind: 'reserved',
      reservation: { day: '2026-07-14', reservedCents: 1000 },
    });
    expect(await getDailyRefundSpendCents(org.id, '2026-07-13')).toBe(1000);
    expect(await getDailyRefundSpendCents(org.id, '2026-07-14')).toBe(0);
  });

  it('isolates spend by org', async () => {
    const orgA = await createTestOrg();
    const orgB = await createTestOrg();
    orgId = orgA.id;

    try {
      await incrementDailyRefundSpendCents(orgA.id, 100);
      await incrementDailyRefundSpendCents(orgB.id, 500);

      await expect(getDailyRefundSpendCents(orgA.id)).resolves.toBe(100);
      await expect(getDailyRefundSpendCents(orgB.id)).resolves.toBe(500);
    } finally {
      await cleanupTestData(orgB.id);
    }
  });

  it('keeps unknown provider outcomes reserved until reconciliation releases them', async () => {
    const org = await createTestOrg();
    orgId = org.id;
    const first = await reserveDailyRefundSpend({
      orgId: org.id,
      operationKey: 'execution:first',
      tool: 'create_refund',
      input: { amount: '6.00' },
      requestedCents: 600,
      capCents: 1000,
      day: '2026-07-13',
    });
    expect(first.kind).toBe('reserved');
    if (first.kind !== 'reserved') throw new Error('Expected reservation');

    await markDailyRefundSpendReservationUnknown(first.reservation.id, 'provider timeout');
    await expect(reserveDailyRefundSpend({
      orgId: org.id,
      operationKey: 'execution:second',
      tool: 'create_refund',
      input: { amount: '5.00' },
      requestedCents: 500,
      capCents: 1000,
      day: '2026-07-13',
    })).resolves.toMatchObject({ kind: 'blocked', heldCents: 600, remainingCents: 400 });

    await releaseDailyRefundSpendReservation(first.reservation.id, 'provider confirmed no refund');
    await expect(reserveDailyRefundSpend({
      orgId: org.id,
      operationKey: 'execution:second',
      tool: 'create_refund',
      input: { amount: '5.00' },
      requestedCents: 500,
      capCents: 1000,
      day: '2026-07-13',
    })).resolves.toMatchObject({ kind: 'reserved' });
  });

  it('commits a reservation idempotently without double-counting spend', async () => {
    const org = await createTestOrg();
    orgId = org.id;
    const reserved = await reserveDailyRefundSpend({
      orgId: org.id,
      operationKey: 'execution:refund',
      tool: 'create_refund',
      input: { amount: '6.00' },
      requestedCents: 600,
      capCents: 1000,
      day: '2026-07-13',
    });
    if (reserved.kind !== 'reserved') throw new Error('Expected reservation');

    await commitDailyRefundSpendReservation(reserved.reservation.id, 600);
    await commitDailyRefundSpendReservation(reserved.reservation.id, 600);

    await expect(getDailyRefundSpendCents(org.id, '2026-07-13')).resolves.toBe(600);
    await expect(reserveDailyRefundSpend({
      orgId: org.id,
      operationKey: 'execution:refund',
      tool: 'create_refund',
      input: { amount: '6.00' },
      requestedCents: 600,
      capCents: 1000,
      day: '2026-07-13',
    })).resolves.toMatchObject({ kind: 'duplicate', reservation: { status: 'committed' } });
    await expect(reserveDailyRefundSpend({
      orgId: org.id,
      operationKey: 'execution:refund',
      tool: 'create_refund',
      input: { amount: '6.00', order_id: 'different-order' },
      requestedCents: 600,
      capCents: 1000,
      day: '2026-07-13',
    })).rejects.toThrow('operation identity was reused with different tool input');
  });

  it('atomically reserves the daily cap before concurrent provider calls', async () => {
    const org = await createTestOrg();
    orgId = org.id;
    let providerCalls = 0;
    const spendTool = defineTool({
      name: 'test_goodwill_spend',
      description: 'Failure-harness tool for daily-cap reservations.',
      fields: { amount: numberArg('Amount in dollars.', { required: true }) },
      category: 'action',
      group: 'order',
      capabilities: [],
      label: 'Test goodwill spend',
      planStepLabel: 'Test goodwill spend',
      policy: { dailyRefundSpendLimit: true },
      execute: async (input: { amount: number }) => {
        providerCalls += 1;
        return {
          status: 'ok' as const,
          message: 'spent',
          spentCents: input.amount * 100,
        };
      },
    });
    const ctx = {
      orgId: org.id,
      orgName: 'Test',
      recentMessages: [],
      shopify: null,
      escalate: async () => {},
    };
    const settings = resolveAgentSettings({ dailyRefundCap: 10 });

    const first = executeToolWithStatus(
      spendTool.name,
      { amount: 6 },
      {
        ...ctx,
        shopify: {
          shop: 'test.myshopify.com',
          accessToken: 'token',
          operationId: 'execution:first',
        },
      },
      settings,
      { [spendTool.name]: spendTool },
    );
    const second = executeToolWithStatus(
      spendTool.name,
      { amount: 6 },
      {
        ...ctx,
        shopify: {
          shop: 'test.myshopify.com',
          accessToken: 'token',
          operationId: 'execution:second',
        },
      },
      settings,
      { [spendTool.name]: spendTool },
    );

    const results = await Promise.all([first, second]);
    expect(results.map(result => result.status).sort()).toEqual(['policy_block', 'success']);
    expect(providerCalls).toBe(1);
    expect(await getDailyRefundSpendCents(org.id)).toBe(600);
  });
});
