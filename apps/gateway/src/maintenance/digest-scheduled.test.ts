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

import { buildOrgDigest, sendScheduledDigests } from './digest.js';

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

    await sendScheduledDigests({ organizationIds: [org.id] });

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

    await sendScheduledDigests({ organizationIds: [org.id] });

    // Empty inbox and no pending flag → nothing to send.
    expect(myMessages()).toHaveLength(0);
  });

  it('does not touch another organization during a scoped sweep', async () => {
    const otherOrg = await createTestOrg();
    const otherChatId = `chat-${otherOrg.id}`;

    try {
      await bindTelegram(org.id, chatId);
      await bindTelegram(otherOrg.id, otherChatId);
      await db.organization.update({
        where: { id: org.id },
        data: { settings: armedSettings({ firstBriefingPending: false }) },
      });
      await db.organization.update({
        where: { id: otherOrg.id },
        data: { settings: armedSettings() },
      });

      await sendScheduledDigests({ organizationIds: [org.id] });

      expect(sendMessageSpy.mock.calls.some((call) => call[0] === otherChatId)).toBe(false);
      expect((await readSettings(otherOrg.id)).firstBriefingPending).toBe(true);
    } finally {
      await cleanupTestData(otherOrg.id);
    }
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

    await sendScheduledDigests({ organizationIds: [org.id] });

    const messages = myMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('first rundown');
    expect(messages[0]).toContain('Nothing needs you right now.');
    expect(messages[0]).not.toContain('Jane');

    expect((await readSettings(org.id)).firstBriefingPending).toBe(false);
  });

  it('delivers one scheduled briefing containing current and legacy persisted shapes', async () => {
    await bindTelegram(org.id, chatId);
    const [currentCustomer, legacyCustomer] = await Promise.all([
      createTestCustomer(org.id, `current-${org.id}@example.com`, { name: 'Ari' }),
      createTestCustomer(org.id, `legacy-${org.id}@example.com`, { name: 'Bea' }),
    ]);
    const currentThread = await createTestThread(org.id, currentCustomer.id, ChannelType.email);
    const legacyThread = await createTestThread(org.id, legacyCustomer.id, ChannelType.email);
    const currentSource = await createTestMessage(currentThread.id, 'Please refund order #4100.');
    const legacyText = 'Can you move order #4101 to 14 Alder Road before Friday?';
    const legacySource = await createTestMessage(legacyThread.id, legacyText);

    await db.thread.update({
      where: { id: currentThread.id },
      data: {
        escalatedAt: new Date(),
        requestSourceMessageId: currentSource.id,
        classifierSignals: {
          version: 5,
          language: 'en',
          intents: { mutative_request: true },
          requestFacts: { ask: 'refund', order: '#4100' },
        },
      },
    });
    await db.thread.update({
      where: { id: legacyThread.id },
      data: {
        escalatedAt: new Date(),
        requestSourceMessageId: legacySource.id,
        classifierSignals: {
          version: 4,
          language: 'en',
          intents: { mutative_request: true },
        },
      },
    });
    await db.organization.update({
      where: { id: org.id },
      data: { settings: armedSettings({ firstBriefingPending: false }) },
    });

    await sendScheduledDigests({ organizationIds: [org.id] });

    const messages = myMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('Ari · #4100: refund');
    expect(messages[0]).toContain(legacyText);
    expect(messages[0]).not.toContain('Request details unavailable');
    const context = await db.operatorContext.findFirst({
      where: { organizationId: org.id },
      select: { pendingDigest: true },
    });
    expect(context?.pendingDigest).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ threadId: currentThread.id, kind: 'decision' }),
        expect.objectContaining({ threadId: legacyThread.id, kind: 'decision' }),
      ]),
    });
  });

  it('rollback disables delivery without discarding pending state or the legacy fallback', async () => {
    await bindTelegram(org.id, chatId);
    const customer = await createTestCustomer(org.id, `rollback-${org.id}@example.com`, { name: 'Cy' });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    const legacyText = 'Could you refund the chipped cup from order #4200?';
    const source = await createTestMessage(thread.id, legacyText);
    const pendingPlans = [{
      threadId: thread.id,
      instruction: 'Refund the chipped cup',
      planId: 'dededede-dede-4ede-8ede-dededededede',
      sourceMessageId: source.id,
      rawToolCalls: [{ id: 'reply-1', name: 'send_reply', input: { text: 'I can help.' } }],
    }];
    const pendingDigest = {
      items: [{ threadId: thread.id, kind: 'approval', planId: pendingPlans[0]!.planId }],
      threadIds: [],
      sentAt: '2026-08-23T12:00:00.000Z',
    };
    await db.thread.update({
      where: { id: thread.id },
      data: {
        requestSourceMessageId: source.id,
        classifierSignals: { version: 4, language: 'en', intents: { mutative_request: true } },
      },
    });
    await db.operatorContext.create({
      data: {
        organizationId: org.id,
        memberKey: `member:rollback-${org.id}`,
        pendingPlans,
        pendingDigest,
      },
    });
    await db.organization.update({
      where: { id: org.id },
      data: { settings: armedSettings({ digestEnabled: false, firstBriefingPending: false }) },
    });

    const manualDigest = (await buildOrgDigest(org.id, new Date()))!;
    expect(manualDigest.message).toContain(legacyText);
    expect(manualDigest.message).not.toContain('Request details unavailable');

    await sendScheduledDigests({ organizationIds: [org.id] });

    expect(myMessages()).toHaveLength(0);
    const stored = await db.operatorContext.findFirst({
      where: { organizationId: org.id },
      select: { pendingPlans: true, pendingDigest: true },
    });
    expect(stored).toEqual({ pendingPlans, pendingDigest });
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

    await sendScheduledDigests({ organizationIds: [org.id] });
    await sendScheduledDigests({ organizationIds: [org.id] });

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

    await sendScheduledDigests({ organizationIds: [org.id] });

    // Same local hour, next day: a new window, so yesterday's claim does not
    // hold it. (Also a new dedupe key, which is the point of keying on the
    // window rather than the day.)
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(new Date(Date.now() + 24 * 60 * 60 * 1000));
      await sendScheduledDigests({ organizationIds: [org.id] });
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
    await sendScheduledDigests({ organizationIds: [org.id] });
    expect(myMessages()).toHaveLength(1);
    expect((await readSettings(org.id)).lastDigestWindow).toBeUndefined();

    // A missing briefing is worse than a duplicate one, so the retry still sends.
    await sendScheduledDigests({ organizationIds: [org.id] });
    expect(myMessages()).toHaveLength(2);
    expect((await readSettings(org.id)).lastDigestWindow).toEqual(expect.any(String));
  });
});
