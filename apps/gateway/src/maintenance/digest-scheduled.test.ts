import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';

const { sendImessageToSpaceSpy, sendMessageSpy } = vi.hoisted(() => ({
  sendImessageToSpaceSpy: vi.fn().mockResolvedValue(undefined),
  sendMessageSpy: vi.fn().mockResolvedValue(true),
}));

vi.mock('../clients/telegram-client.js', () => ({
  isTelegramConfigured: vi.fn(() => true),
  sendMessage: sendMessageSpy,
}));

vi.mock('../clients/spectrum.js', () => ({
  isImessageConfigured: vi.fn(() => true),
  sendImessageToSpace: sendImessageToSpaceSpy,
}));

import { sendScheduledDigests } from './digest.js';

// shouldSendDigest fires when the local hour equals digestHour; pin the tz to
// UTC and target the current UTC hour so the sweep runs regardless of clock.
function armedSettings(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    digestEnabled: true,
    firstBriefingPending: true,
    digestHour: new Date().getUTCHours(),
    digestTimezone: 'UTC',
    ...extra,
  };
}

async function bindTelegram(orgId: string, chatId: string): Promise<void> {
  const member = await db.orgMember.create({
    data: { organizationId: orgId, clerkUserId: `u-${chatId}` },
  });
  await db.orgMemberTelegramChat.create({ data: { orgMemberId: member.id, chatId } });
}

async function readSettings(orgId: string): Promise<Record<string, unknown>> {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
  return (org?.settings as Record<string, unknown> | null) ?? {};
}

describe('sendScheduledDigests — first-night briefing', () => {
  let org!: Awaited<ReturnType<typeof createTestOrg>>;
  let chatId!: string;

  beforeEach(async () => {
    sendMessageSpy.mockClear();
    org = await createTestOrg();
    chatId = `chat-${org.id}`;
  });

  afterEach(async () => {
    await cleanupTestData(org?.id);
  });

  function myMessages(): string[] {
    return sendMessageSpy.mock.calls.filter((c) => c[0] === chatId).map((c) => c[1] as string);
  }

  it('sends a welcome briefing on an empty inbox and clears the pending flag', async () => {
    await bindTelegram(org.id, chatId);
    const base = await db.knowledgeBase.create({
      data: { organizationId: org.id, name: 'Shopify', source: 'shopify' },
    });
    await db.kbArticle.createMany({
      data: [
        { organizationId: org.id, knowledgeBaseId: base.id, title: 'Returns', body: '30 days' },
        { organizationId: org.id, knowledgeBaseId: base.id, title: 'Shipping', body: 'worldwide' },
      ],
    });
    await db.organization.update({
      where: { id: org.id },
      data: { settings: armedSettings() },
    });

    await sendScheduledDigests();

    const messages = myMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('Good morning');
    expect(messages[0]).toContain('2 pages');

    expect((await readSettings(org.id)).firstBriefingPending).toBe(false);
  });

  it('does not resend once the first briefing flag is cleared', async () => {
    await bindTelegram(org.id, chatId);
    await db.organization.update({
      where: { id: org.id },
      data: { settings: armedSettings({ firstBriefingPending: false }) },
    });

    await sendScheduledDigests();

    // Empty inbox and no pending flag → nothing to send.
    expect(myMessages()).toHaveLength(0);
  });

  it('prepends the first-rundown preamble when the inbox has tickets', async () => {
    await bindTelegram(org.id, chatId);
    const customer = await createTestCustomer(org.id, `cust-${org.id}@example.com`, { name: 'Jane' });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    // A message, not a bare thread: a thread with no conversation is an
    // `empty_thread` and is deliberately never named, so a bare one would prove
    // only that the preamble renders.
    await createTestMessage(thread.id, 'Is the mug set back in stock?');
    await db.organization.update({
      where: { id: org.id },
      data: { settings: armedSettings() },
    });

    await sendScheduledDigests();

    const messages = myMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('first rundown');
    expect(messages[0]).toContain('One thing needs you.');
    expect(messages[0]).toContain('Jane');

    expect((await readSettings(org.id)).firstBriefingPending).toBe(false);
  });
});

// The duplicate briefing this guards against was two processes on the same
// database inside one hour — a BullMQ retry, a second replica, or a dev worker
// pointed at production. Each carries its own `now`, so the window is claimed in
// Postgres and the second caller finds it taken.
describe('sendScheduledDigests — one send per window', () => {
  let org!: Awaited<ReturnType<typeof createTestOrg>>;
  let chatId!: string;

  beforeEach(async () => {
    sendMessageSpy.mockClear();
    org = await createTestOrg();
    chatId = `chat-${org.id}`;
    await bindTelegram(org.id, chatId);
  });

  afterEach(async () => {
    await cleanupTestData(org?.id);
  });

  function myMessages(): string[] {
    return sendMessageSpy.mock.calls.filter((c) => c[0] === chatId).map((c) => c[1] as string);
  }

  it('sends once when the same window is swept twice', async () => {
    const customer = await createTestCustomer(org.id, `cust-${org.id}@example.com`, { name: 'Jane' });
    await createTestThread(org.id, customer.id, ChannelType.email);
    await db.organization.update({
      where: { id: org.id },
      data: { settings: armedSettings() },
    });

    await sendScheduledDigests();
    await sendScheduledDigests();

    expect(myMessages()).toHaveLength(1);
    expect((await readSettings(org.id)).lastDigestWindow).toEqual(expect.any(String));
  });

  it('sends again in the next window', async () => {
    const customer = await createTestCustomer(org.id, `cust-${org.id}@example.com`, { name: 'Jane' });
    await createTestThread(org.id, customer.id, ChannelType.email);
    await db.organization.update({
      where: { id: org.id },
      data: { settings: armedSettings() },
    });

    await sendScheduledDigests();

    // Same local hour, next day: a new window, so yesterday's claim does not
    // hold it. (Also a new dedupe key, which is the point of keying on the
    // window rather than the day.)
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(new Date(Date.now() + 24 * 60 * 60 * 1000));
      await sendScheduledDigests();
    } finally {
      vi.useRealTimers();
    }

    expect(myMessages()).toHaveLength(2);
  });

  it('leaves the window unclaimed when nothing was delivered', async () => {
    sendMessageSpy.mockResolvedValueOnce(false);
    const customer = await createTestCustomer(org.id, `cust-${org.id}@example.com`, { name: 'Jane' });
    await createTestThread(org.id, customer.id, ChannelType.email);
    await db.organization.update({
      where: { id: org.id },
      data: { settings: armedSettings() },
    });

    // The send was attempted and refused by the transport, so the window is
    // still unspent.
    await sendScheduledDigests();
    expect(myMessages()).toHaveLength(1);
    expect((await readSettings(org.id)).lastDigestWindow).toBeUndefined();

    // A missing briefing is worse than a duplicate one, so the retry still sends.
    await sendScheduledDigests();
    expect(myMessages()).toHaveLength(2);
    expect((await readSettings(org.id)).lastDigestWindow).toEqual(expect.any(String));
  });
});
