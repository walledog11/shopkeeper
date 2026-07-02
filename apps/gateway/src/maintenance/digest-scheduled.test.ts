import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
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
    await createTestThread(org.id, customer.id, ChannelType.email);
    await db.organization.update({
      where: { id: org.id },
      data: { settings: armedSettings() },
    });

    await sendScheduledDigests();

    const messages = myMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('first rundown');
    expect(messages[0]).toContain('Open tickets:');

    expect((await readSettings(org.id)).firstBriefingPending).toBe(false);
  });
});
