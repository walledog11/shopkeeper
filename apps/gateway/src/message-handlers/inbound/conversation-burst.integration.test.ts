import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChannelType, db, SenderType } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import { getConversationBurst } from './conversation-burst.js';

let org: Awaited<ReturnType<typeof createTestOrg>>;
let customer: Awaited<ReturnType<typeof createTestCustomer>>;
let thread: Awaited<ReturnType<typeof createTestThread>>;

// sentAt is set explicitly on every message: the burst is ordered by it, and
// rows created in one tick can otherwise share a timestamp.
let clock = 0;
function nextSentAt(): Date {
  clock += 1_000;
  return new Date(Date.UTC(2026, 7, 14) + clock);
}

async function say(senderType: SenderType, contentText: string) {
  return db.message.create({
    data: {
      threadId: thread.id,
      organizationId: org.id,
      senderType,
      contentText,
      sentAt: nextSentAt(),
    },
  });
}

beforeEach(async () => {
  clock = 0;
  org = await createTestOrg();
  customer = await createTestCustomer(org.id, `burst-${org.id.slice(0, 8)}@example.com`);
  thread = await createTestThread(org.id, customer.id, ChannelType.shopify_chat);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

describe('getConversationBurst', () => {
  it('returns only the trailing unanswered customer run', async () => {
    await say(SenderType.customer, 'I want a refund for #1024');
    await say(SenderType.agent, 'Refunded, sorry about that.');
    const followUp = await say(SenderType.customer, 'Actually one more thing');
    const last = await say(SenderType.customer, 'the box was crushed too');

    const burst = await getConversationBurst(thread.id);

    expect(burst.messages.map((m) => m.id)).toEqual([followUp.id, last.id]);
    expect(burst.messages.map((m) => m.contentText)).toEqual([
      'Actually one more thing',
      'the box was crushed too',
    ]);
    // The answered refund is background, not part of what is being asked now.
    expect(burst.messages.map((m) => m.contentText)).not.toContain('I want a refund for #1024');
    expect(burst.isFollowUp).toBe(true);
  });

  it('is empty when the shop had the last word', async () => {
    await say(SenderType.customer, 'Where is my order?');
    await say(SenderType.agent, 'It ships tomorrow.');

    const burst = await getConversationBurst(thread.id);

    expect(burst.messages).toEqual([]);
    expect(burst.isFollowUp).toBe(true);
  });

  it('reports a first message as the whole burst and not a follow-up', async () => {
    const first = await say(SenderType.customer, 'Hi');

    const burst = await getConversationBurst(thread.id);

    expect(burst.messages.map((m) => m.id)).toEqual([first.id]);
    expect(burst.isFollowUp).toBe(false);
  });

  it('ignores notes, so an order webhook cannot break a burst apart', async () => {
    const first = await say(SenderType.customer, 'Any update?');
    await say(SenderType.note, '__shopkeeper_agent__ order webhook landed');
    const second = await say(SenderType.customer, 'still waiting');

    const burst = await getConversationBurst(thread.id);

    expect(burst.messages.map((m) => m.id)).toEqual([first.id, second.id]);
  });

  it('does not reach across an episode boundary into the closed conversation', async () => {
    await say(SenderType.customer, 'I want a refund for #1024');
    await say(SenderType.agent, 'Refunded.');
    await db.thread.update({
      where: { id: thread.id },
      data: { status: 'closed', closedReason: 'episode_rollover' },
    });

    const episodeTwo = await createTestThread(org.id, customer.id, ChannelType.shopify_chat);
    const greeting = await db.message.create({
      data: {
        threadId: episodeTwo.id,
        organizationId: org.id,
        senderType: SenderType.customer,
        contentText: 'Hi',
        sentAt: nextSentAt(),
      },
    });

    const burst = await getConversationBurst(episodeTwo.id);

    expect(burst.messages.map((m) => m.id)).toEqual([greeting.id]);
    expect(burst.isFollowUp).toBe(false);
  });
});
