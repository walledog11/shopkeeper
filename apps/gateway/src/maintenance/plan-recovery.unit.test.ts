import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  testQuickReplyPlanCache,
  testRefundOnlyPlanCache,
} from '../test-fixtures/agent-plan-cache-fixtures.js';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock('@shopkeeper/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shopkeeper/db')>();
  return {
    ...actual,
    db: {
      ...actual.db,
      thread: { ...actual.db.thread, findMany },
    },
  };
});

import { recoverMissingPlans } from './plan-recovery.js';

const NOW = new Date('2026-08-13T16:00:00.000Z');

const CUSTOMER_MESSAGE_ID = '33333333-3333-4333-8333-333333333333';

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    organizationId: '22222222-2222-4222-8222-222222222222',
    channelType: 'shopify_chat',
    cachedPlan: null,
    cachedPlanMessageId: null,
    filterDecidedAt: new Date('2026-08-13T15:00:00.000Z'),
    customer: { name: null },
    organization: { settings: {} },
    messages: [{ id: CUSTOMER_MESSAGE_ID, senderType: 'customer' }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recoverMissingPlans', () => {
  it('re-enters the normal planning pipeline for a stranded customer message', async () => {
    findMany.mockResolvedValue([candidate()]);
    const add = vi.fn().mockResolvedValue({});

    await expect(recoverMissingPlans({ add }, NOW)).resolves.toBe(1);

    expect(add).toHaveBeenCalledWith(
      'summarize-thread',
      expect.objectContaining({
        threadId: '11111111-1111-4111-8111-111111111111',
        sourceMessageId: '33333333-3333-4333-8333-333333333333',
        skipSummary: true,
      }),
      expect.objectContaining({
        deduplication: expect.objectContaining({ id: 'thread:11111111-1111-4111-8111-111111111111' }),
      }),
    );
  });

  it('does not enqueue a thread whose latest conversational message is no longer from the customer', async () => {
    findMany.mockResolvedValue([candidate({
      messages: [{ id: '44444444-4444-4444-8444-444444444444', senderType: 'agent' }],
    })]);
    const add = vi.fn();

    await expect(recoverMissingPlans({ add }, NOW)).resolves.toBe(0);
    expect(add).not.toHaveBeenCalled();
  });

  it('does not enqueue a thread that already has an approval-owned plan', async () => {
    const cache = testRefundOnlyPlanCache(CUSTOMER_MESSAGE_ID);
    findMany.mockResolvedValue([candidate({
      cachedPlan: cache,
      cachedPlanMessageId: CUSTOMER_MESSAGE_ID,
    })]);
    const add = vi.fn();

    await expect(recoverMissingPlans({ add }, NOW)).resolves.toBe(0);
    expect(add).not.toHaveBeenCalled();
  });

  it('re-enqueues a stranded safe reply even when a cached quick-reply plan exists', async () => {
    const cache = testQuickReplyPlanCache(CUSTOMER_MESSAGE_ID);
    findMany.mockResolvedValue([candidate({
      cachedPlan: cache,
      cachedPlanMessageId: CUSTOMER_MESSAGE_ID,
    })]);
    const add = vi.fn().mockResolvedValue({});

    await expect(recoverMissingPlans({ add }, NOW)).resolves.toBe(1);
    expect(add).toHaveBeenCalledOnce();
  });

  it('omits skipSummary when classification has not finished yet', async () => {
    findMany.mockResolvedValue([candidate({ filterDecidedAt: null })]);
    const add = vi.fn().mockResolvedValue({});

    await recoverMissingPlans({ add }, NOW);

    const payload = add.mock.calls[0]?.[1];
    expect(payload).not.toHaveProperty('skipSummary');
  });

  it('ignores candidates with no conversational messages', async () => {
    findMany.mockResolvedValue([candidate({ messages: [] })]);
    const add = vi.fn();

    await expect(recoverMissingPlans({ add }, NOW)).resolves.toBe(0);
    expect(add).not.toHaveBeenCalled();
  });
});

it('continues beyond a full page of approval-owned plans', async () => {
  const cache = testRefundOnlyPlanCache(CUSTOMER_MESSAGE_ID);
  findMany.mockResolvedValueOnce(Array.from({ length: 100 }, (_, index) => candidate({
    id: `thread-${index}`, cachedPlan: cache, cachedPlanMessageId: CUSTOMER_MESSAGE_ID,
  }))).mockResolvedValueOnce([candidate()]);
  const add = vi.fn().mockResolvedValue({});
  await expect(recoverMissingPlans({ add }, NOW)).resolves.toBe(1);
  expect(findMany).toHaveBeenCalledTimes(2);
  expect(findMany.mock.calls[1][0].where.id).toEqual({ gt: 'thread-99' });
});
