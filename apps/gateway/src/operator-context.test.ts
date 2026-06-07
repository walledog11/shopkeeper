import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { db } from '@shopkeeper/db';
import { createTestOrg, cleanupTestData } from '@shopkeeper/db/test-helpers';
import {
  getContext,
  updateContext,
  extractOrderNumber,
  type PendingPlan,
  type PendingDigest,
} from './operator-context.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
});

afterEach(async () => {
  await db.operatorContext.deleteMany({ where: { organizationId: org.id } }).catch(() => undefined);
  await cleanupTestData(org?.id);
});

describe('getContext', () => {
  it('returns default empty shape when no row exists', async () => {
    const ctx = await getContext(org.id, '12345');
    expect(ctx).toEqual({
      lastOrderNumber: null,
      lastThreadId: null,
      history: [],
      pendingPlan: null,
      pendingDigest: null,
    });
  });
});

describe('updateContext + getContext round-trip', () => {
  it('persists all fields', async () => {
    const threadId = '00000000-0000-4000-8000-000000000010';
    const plan: PendingPlan = {
      threadId,
      instruction: 'refund the order',
      rawToolCalls: [{ id: 'tc1', name: 'refundOrder' }],
    };

    await updateContext(org.id, '7000001', {
      lastOrderNumber: '#1001',
      lastThreadId: threadId,
      history: [{ role: 'user', content: 'hi' }],
      pendingPlan: plan,
    });

    const ctx = await getContext(org.id, '7000001');
    expect(ctx.lastOrderNumber).toBe('#1001');
    expect(ctx.lastThreadId).toBe(threadId);
    expect(ctx.history).toEqual([{ role: 'user', content: 'hi' }]);
    expect(ctx.pendingPlan).toEqual(plan);
    expect(ctx.pendingDigest).toBeNull();
  });

  it('persists pendingDigest', async () => {
    const digest: PendingDigest = {
      threadIds: ['t1', 't2'],
      sentAt: new Date().toISOString(),
    };
    await updateContext(org.id, '999', { pendingDigest: digest });
    const ctx = await getContext(org.id, '999');
    expect(ctx.pendingDigest).toEqual(digest);
  });

  it('filters malformed JSON fields when reading stored context', async () => {
    await db.operatorContext.create({
      data: {
        organizationId: org.id,
        chatId: 'malformed',
        history: [{ role: 'user', content: 'valid' }, { role: 'assistant' }],
        pendingPlan: {
          threadId: 'thread_1',
          instruction: 'check status',
          rawToolCalls: [{ id: 'tc_1', name: 'get_order' }, { id: 'tc_2' }],
        },
        pendingDigest: {
          threadIds: ['thread_1', 123],
          sentAt: '2026-06-03T00:00:00.000Z',
        },
      },
    });

    const ctx = await getContext(org.id, 'malformed');

    expect(ctx.history).toEqual([{ role: 'user', content: 'valid' }]);
    expect(ctx.pendingPlan).toEqual({
      threadId: 'thread_1',
      instruction: 'check status',
      rawToolCalls: [{ id: 'tc_1', name: 'get_order' }],
    });
    expect(ctx.pendingDigest).toEqual({
      threadIds: ['thread_1'],
      sentAt: '2026-06-03T00:00:00.000Z',
    });
  });

  it('truncates history to the last 20 turns', async () => {
    const history = Array.from({ length: 25 }, (_, i) => ({ role: 'user', content: `m${i}` }));
    await updateContext(org.id, '42', { history });

    const ctx = await getContext(org.id, '42');
    expect(ctx.history).toHaveLength(20);
    expect(ctx.history[0].content).toBe('m5');
    expect(ctx.history[19].content).toBe('m24');
  });

  it('clears pendingPlan when set to null', async () => {
    const plan: PendingPlan = { threadId: '00000000-0000-4000-8000-000000000020', instruction: 'do', rawToolCalls: [] };
    await updateContext(org.id, '7', { pendingPlan: plan });
    expect((await getContext(org.id, '7')).pendingPlan).toEqual(plan);

    await updateContext(org.id, '7', { pendingPlan: null });
    expect((await getContext(org.id, '7')).pendingPlan).toBeNull();
  });
});

describe('extractOrderNumber', () => {
  it.each([
    ['#1234', '#1234'],
    ['order 1234', '#1234'],
    ['order #1234', '#1234'],
    ['ORDER-1234', '#1234'],
    ['can you refund #99 please', '#99'],
    ['hello', null],
    ['', null],
  ])('extracts from %p', (input, expected) => {
    expect(extractOrderNumber(input)).toBe(expected);
  });
});
