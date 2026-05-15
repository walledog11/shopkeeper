import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { db } from '@clerk/db';
import { createTestOrg, cleanupTestData } from '@clerk/db/test-helpers';
import {
  getContext,
  updateContext,
  clearContext,
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
    const ctx = await getContext(org.id, 'telegram', '12345');
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
  it('persists fields for whatsapp channel', async () => {
    const threadId = '00000000-0000-4000-8000-000000000010';
    const plan: PendingPlan = {
      threadId,
      instruction: 'refund the order',
      rawToolCalls: [{ id: 'tc1', name: 'refundOrder' }],
    };

    await updateContext(org.id, 'whatsapp', '+15551234567', {
      lastOrderNumber: '#1001',
      lastThreadId: threadId,
      history: [{ role: 'user', content: 'hi' }],
      pendingPlan: plan,
    });

    const ctx = await getContext(org.id, 'whatsapp', '+15551234567');
    expect(ctx.lastOrderNumber).toBe('#1001');
    expect(ctx.lastThreadId).toBe(threadId);
    expect(ctx.history).toEqual([{ role: 'user', content: 'hi' }]);
    expect(ctx.pendingPlan).toEqual(plan);
    expect(ctx.pendingDigest).toBeNull();
  });

  it('keeps whatsapp and telegram rows distinct under the same chatId', async () => {
    const chatId = '+15550000000';
    await updateContext(org.id, 'whatsapp', chatId, { lastOrderNumber: '#WA' });
    await updateContext(org.id, 'telegram', chatId, { lastOrderNumber: '#TG' });

    const wa = await getContext(org.id, 'whatsapp', chatId);
    const tg = await getContext(org.id, 'telegram', chatId);
    expect(wa.lastOrderNumber).toBe('#WA');
    expect(tg.lastOrderNumber).toBe('#TG');
  });

  it('persists pendingDigest for telegram', async () => {
    const digest: PendingDigest = {
      threadIds: ['t1', 't2'],
      sentAt: new Date().toISOString(),
    };
    await updateContext(org.id, 'telegram', '999', { pendingDigest: digest });
    const ctx = await getContext(org.id, 'telegram', '999');
    expect(ctx.pendingDigest).toEqual(digest);
  });

  it('truncates history to the last 20 turns', async () => {
    const history = Array.from({ length: 25 }, (_, i) => ({ role: 'user', content: `m${i}` }));
    await updateContext(org.id, 'telegram', '42', { history });

    const ctx = await getContext(org.id, 'telegram', '42');
    expect(ctx.history).toHaveLength(20);
    expect(ctx.history[0].content).toBe('m5');
    expect(ctx.history[19].content).toBe('m24');
  });

  it('clears pendingPlan when set to null', async () => {
    const plan: PendingPlan = { threadId: '00000000-0000-4000-8000-000000000020', instruction: 'do', rawToolCalls: [] };
    await updateContext(org.id, 'telegram', '7', { pendingPlan: plan });
    expect((await getContext(org.id, 'telegram', '7')).pendingPlan).toEqual(plan);

    await updateContext(org.id, 'telegram', '7', { pendingPlan: null });
    expect((await getContext(org.id, 'telegram', '7')).pendingPlan).toBeNull();
  });
});

describe('clearContext', () => {
  it('removes the row', async () => {
    await updateContext(org.id, 'telegram', '11', { lastOrderNumber: '#1' });
    await clearContext(org.id, 'telegram', '11');
    const ctx = await getContext(org.id, 'telegram', '11');
    expect(ctx.lastOrderNumber).toBeNull();
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
