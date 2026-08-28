import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';

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

function quickReplyPlanCache() {
  return buildAgentPlanCacheRecord({
    instruction: 'Answer the question',
    lastCustomerMessageId: CUSTOMER_MESSAGE_ID,
    settings: resolveAgentSettings(null),
    plan: {
      instruction: 'Answer the question',
      steps: [{
        id: 'reply',
        tool: 'send_reply',
        label: 'Reply',
        description: 'Reply',
        category: 'communication',
        enabled: true,
      }],
      rawToolCalls: [{ id: 'reply', name: 'send_reply', input: { text: 'Here you go.' } }],
    },
  });
}

function reviewPlanCache() {
  return buildAgentPlanCacheRecord({
    instruction: 'Issue refund',
    lastCustomerMessageId: CUSTOMER_MESSAGE_ID,
    settings: resolveAgentSettings(null),
    plan: {
      instruction: 'Issue refund',
      steps: [{
        id: 'refund',
        tool: 'create_refund',
        label: 'Refund',
        description: 'Refund',
        category: 'action',
        enabled: true,
      }],
      rawToolCalls: [{ id: 'refund', name: 'create_refund', input: { order_id: '1', amount: '10.00' } }],
    },
  });
}

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
    const cache = reviewPlanCache();
    findMany.mockResolvedValue([candidate({
      cachedPlan: cache,
      cachedPlanMessageId: CUSTOMER_MESSAGE_ID,
    })]);
    const add = vi.fn();

    await expect(recoverMissingPlans({ add }, NOW)).resolves.toBe(0);
    expect(add).not.toHaveBeenCalled();
  });

  it('re-enqueues a stranded safe reply even when a cached quick-reply plan exists', async () => {
    const cache = quickReplyPlanCache();
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
