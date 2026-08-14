import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, ChannelType, SenderType } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import { closeInactiveOpenThreads } from './inactive-thread-sweep.js';
import { appendPendingPlan } from '../operator-context.js';

const NOW = new Date('2026-04-29T12:00:00Z');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const QUIET_AGED = new Date(NOW.getTime() - 8 * ONE_DAY_MS);
const QUIET_RECENT = new Date(NOW.getTime() - 6 * ONE_DAY_MS);

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

describe('closeInactiveOpenThreads', () => {
  async function openThread(channel: ChannelType = ChannelType.email) {
    const customer = await createTestCustomer(org.id, `c_${Math.random().toString(16).slice(2)}@test.com`);
    return createTestThread(org.id, customer.id, channel);
  }

  // Stagger the transcript rather than stamping one timestamp on every message.
  // The sweep orders by sentAt then id, message ids are random uuids, and
  // Message has no createdAt — so equal timestamps make "who spoke last" a coin
  // flip and every close decision here nondeterministic.
  async function ageConversation(messageIds: string[], oldest: Date) {
    for (const [index, messageId] of messageIds.entries()) {
      await db.message.update({
        where: { id: messageId },
        data: { sentAt: new Date(oldest.getTime() + index * 60_000) },
      });
    }
  }

  // The sweep is deliberately global, so its return count also counts threads
  // other suites left open in the shared test database. Assert the status of the
  // thread this test created instead of the count.
  async function statusOf(threadId: string) {
    const thread = await db.thread.findUnique({ where: { id: threadId } });
    return thread?.status;
  }

  it('closes a seven-day-silent answered thread', async () => {
    const thread = await openThread();
    const inbound = await createTestMessage(thread.id, 'Where is my order?', SenderType.customer);
    const outbound = await createTestMessage(thread.id, 'On its way.', SenderType.agent);
    await ageConversation([inbound.id, outbound.id], QUIET_AGED);

    await closeInactiveOpenThreads(NOW);

    expect(await statusOf(thread.id)).toBe('closed');
  });

  it('keeps a six-day answered thread open', async () => {
    const thread = await openThread();
    const inbound = await createTestMessage(thread.id, 'Hello?', SenderType.customer);
    const outbound = await createTestMessage(thread.id, 'Hi there.', SenderType.ai);
    await ageConversation([inbound.id, outbound.id], QUIET_RECENT);

    await closeInactiveOpenThreads(NOW);

    expect(await statusOf(thread.id)).toBe('open');
  });

  it('keeps a thread open when the customer wrote after the agent', async () => {
    const thread = await openThread();
    const first = await createTestMessage(thread.id, 'First question', SenderType.customer);
    const reply = await createTestMessage(thread.id, 'First answer', SenderType.agent);
    const followUp = await createTestMessage(thread.id, 'Follow-up', SenderType.customer);
    await ageConversation([first.id, reply.id, followUp.id], QUIET_AGED);

    await closeInactiveOpenThreads(NOW);

    expect(await statusOf(thread.id)).toBe('open');
  });

  it('closes a note-only Shopify order-event thread', async () => {
    const thread = await openThread(ChannelType.shopify);
    const note = await createTestMessage(thread.id, 'New order #1001 was placed.', SenderType.note);
    await ageConversation([note.id], QUIET_AGED);
    await db.thread.update({ where: { id: thread.id }, data: { updatedAt: QUIET_AGED } });

    await closeInactiveOpenThreads(NOW);

    expect(await statusOf(thread.id)).toBe('closed');
  });

  it('keeps an escalated thread open', async () => {
    const thread = await openThread();
    await db.thread.update({
      where: { id: thread.id },
      data: { escalatedAt: NOW },
    });
    const inbound = await createTestMessage(thread.id, 'Help', SenderType.customer);
    const outbound = await createTestMessage(thread.id, 'Looking into it.', SenderType.agent);
    await ageConversation([inbound.id, outbound.id], QUIET_AGED);

    await closeInactiveOpenThreads(NOW);

    expect(await statusOf(thread.id)).toBe('open');
  });

  it('keeps a thread with a parked approval open', async () => {
    const thread = await openThread();
    const inbound = await createTestMessage(thread.id, 'Refund please', SenderType.customer);
    const outbound = await createTestMessage(thread.id, 'Checking policy.', SenderType.agent);
    await ageConversation([inbound.id, outbound.id], QUIET_AGED);

    const member = await db.orgMember.create({
      data: {
        organizationId: org.id,
        clerkUserId: `user_${Math.random().toString(16).slice(2)}`,
      },
    });
    await appendPendingPlan(org.id, `member:${member.id}`, {
      threadId: thread.id,
      instruction: 'Refund',
      rawToolCalls: [{ id: 'tc1', name: 'create_refund', input: { amount: 10 } }],
    }, 5);

    await closeInactiveOpenThreads(NOW);

    expect(await statusOf(thread.id)).toBe('open');
  });
});
