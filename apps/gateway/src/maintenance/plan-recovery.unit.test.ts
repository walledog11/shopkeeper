import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    messages: [{ id: '33333333-3333-4333-8333-333333333333', senderType: 'customer' }],
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
});
