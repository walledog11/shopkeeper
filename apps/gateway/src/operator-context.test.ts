import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { db } from '@shopkeeper/db';
import { createTestOrg, cleanupTestData } from '@shopkeeper/db/test-helpers';
import {
  getContext,
  resolvePendingPlanContexts,
  updateContext,
  extractOrderNumber,
  type PendingPlan,
  type PendingDigest,
  type PendingQuestion,
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
      pendingPlan: null,
      pendingDigest: null,
      pendingQuestion: null,
    });
  });
});

describe('updateContext + getContext round-trip', () => {
  it('persists pendingPlan', async () => {
    const threadId = '00000000-0000-4000-8000-000000000010';
    const plan: PendingPlan = {
      threadId,
      instruction: 'refund the order',
      rawToolCalls: [{ id: 'tc1', name: 'refundOrder' }],
    };

    await updateContext(org.id, '7000001', { pendingPlan: plan });

    const ctx = await getContext(org.id, '7000001');
    expect(ctx.pendingPlan).toEqual(plan);
    expect(ctx.pendingDigest).toBeNull();
  });

  it('persists the optional display fields the fast path reads', async () => {
    const threadId = '00000000-0000-4000-8000-000000000011';
    const plan: PendingPlan = {
      threadId,
      instruction: 'refund the order',
      rawToolCalls: [{ id: 'tc1', name: 'refundOrder' }],
      customerName: 'Sarah Chen',
      actionLabel: 'reply to Sarah',
    };

    await updateContext(org.id, '7000002', { pendingPlan: plan });

    expect((await getContext(org.id, '7000002')).pendingPlan).toEqual(plan);
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

  it('persists and clears pendingQuestion', async () => {
    const question: PendingQuestion = {
      threadId: '00000000-0000-4000-8000-000000000030',
      question: 'Do we ship to Canada?',
    };
    await updateContext(org.id, '8000001', { pendingQuestion: question });
    expect((await getContext(org.id, '8000001')).pendingQuestion).toEqual(question);

    await updateContext(org.id, '8000001', { pendingQuestion: null });
    expect((await getContext(org.id, '8000001')).pendingQuestion).toBeNull();
  });

  it('drops a malformed pendingQuestion when reading stored context', async () => {
    await db.operatorContext.create({
      data: {
        organizationId: org.id,
        chatId: 'malformed-question',
        pendingQuestion: { threadId: 'thread_1' },
      },
    });
    expect((await getContext(org.id, 'malformed-question')).pendingQuestion).toBeNull();
  });

  it('filters malformed JSON fields when reading stored context', async () => {
    await db.operatorContext.create({
      data: {
        organizationId: org.id,
        chatId: 'malformed',
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

  it('clears pendingPlan when set to null', async () => {
    const plan: PendingPlan = { threadId: '00000000-0000-4000-8000-000000000020', instruction: 'do', rawToolCalls: [] };
    await updateContext(org.id, '7', { pendingPlan: plan });
    expect((await getContext(org.id, '7')).pendingPlan).toEqual(plan);

    await updateContext(org.id, '7', { pendingPlan: null });
    expect((await getContext(org.id, '7')).pendingPlan).toBeNull();
  });

  it('resolves the same stable plan on every device without clearing a newer plan', async () => {
    const shared: PendingPlan = {
      threadId: '00000000-0000-4000-8000-000000000020',
      instruction: 'refund',
      rawToolCalls: [],
      planId: '00000000-0000-4000-8000-000000000021',
      sourceMessageId: '00000000-0000-4000-8000-000000000022',
      planHash: 'a'.repeat(64),
      instructionHash: 'b'.repeat(64),
    };
    await updateContext(org.id, 'device_a', { pendingPlan: shared });
    await updateContext(org.id, 'device_b', { pendingPlan: shared });
    await updateContext(org.id, 'device_new', {
      pendingPlan: { ...shared, planId: '00000000-0000-4000-8000-000000000023' },
    });

    await resolvePendingPlanContexts(org.id, 'device_a', shared);

    expect((await getContext(org.id, 'device_a')).pendingPlan).toBeNull();
    expect((await getContext(org.id, 'device_b')).pendingPlan).toBeNull();
    expect((await getContext(org.id, 'device_new')).pendingPlan?.planId)
      .toBe('00000000-0000-4000-8000-000000000023');
  });

  it('conditionally resolves a legacy plan only on the acting device', async () => {
    const legacy: PendingPlan = {
      threadId: '00000000-0000-4000-8000-000000000024',
      instruction: 'reply',
      rawToolCalls: [],
    };
    await updateContext(org.id, 'legacy_a', { pendingPlan: legacy });
    await updateContext(org.id, 'legacy_b', { pendingPlan: legacy });
    const newer = { ...legacy, instruction: 'new reply' };
    await updateContext(org.id, 'legacy_a', { pendingPlan: newer });

    await resolvePendingPlanContexts(org.id, 'legacy_a', legacy);

    expect((await getContext(org.id, 'legacy_a')).pendingPlan).toEqual(newer);
    expect((await getContext(org.id, 'legacy_b')).pendingPlan).toEqual(legacy);
  });

  // The identity-less path matches on whole-JSON equality, so the reader has to
  // round-trip the display fields or a dismissal silently stops resolving.
  it('resolves an identity-less plan that carries display fields', async () => {
    const parked: PendingPlan = {
      threadId: '00000000-0000-4000-8000-000000000025',
      instruction: 'reply',
      rawToolCalls: [],
      customerName: 'Sarah Chen',
      actionLabel: 'reply to Sarah',
    };
    await updateContext(org.id, 'display_a', { pendingPlan: parked });

    const stored = (await getContext(org.id, 'display_a')).pendingPlan;
    expect(stored).not.toBeNull();
    await resolvePendingPlanContexts(org.id, 'display_a', stored!);

    expect((await getContext(org.id, 'display_a')).pendingPlan).toBeNull();
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
