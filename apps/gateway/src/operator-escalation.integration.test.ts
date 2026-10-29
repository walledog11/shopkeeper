import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';
import { pushOperatorEscalation } from './operator-escalation.js';

const { sendImessageToSpaceSpy, sendMessageSpy, createHandoffSpy } = vi.hoisted(() => ({
  sendImessageToSpaceSpy: vi.fn().mockResolvedValue(undefined),
  sendMessageSpy: vi.fn().mockResolvedValue(true),
  createHandoffSpy: vi.fn(),
}));

vi.mock('./clients/telegram-client.js', () => ({
  isTelegramConfigured: vi.fn(() => true),
  sendMessage: sendMessageSpy,
  setWebhook: vi.fn(),
}));

vi.mock('./clients/spectrum.js', () => ({
  isImessageConfigured: vi.fn(() => true),
  sendImessageToSpace: sendImessageToSpaceSpy,
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.on = vi.fn().mockReturnThis();
    this.disconnect = vi.fn();
    this.quit = vi.fn().mockResolvedValue('OK');
    this.status = 'ready';
  }),
}));

vi.mock('@shopkeeper/agent/ai', () => ({
  HAIKU_MODEL: 'test-model',
  anthropic: { messages: { create: createHandoffSpy } },
}));

const DASHBOARD_URL = 'http://dashboard.test';

describe('pushOperatorEscalation', () => {
  let org!: Awaited<ReturnType<typeof createTestOrg>>;
  const originalDashboardUrl = process.env.DASHBOARD_URL;

  beforeEach(async () => {
    process.env.DASHBOARD_URL = DASHBOARD_URL;
    sendMessageSpy.mockClear();
    sendImessageToSpaceSpy.mockClear();
    createHandoffSpy.mockReset();
    org = await createTestOrg();
  });

  afterEach(async () => {
    await cleanupTestData(org?.id);
    if (originalDashboardUrl === undefined) delete process.env.DASHBOARD_URL;
    else process.env.DASHBOARD_URL = originalDashboardUrl;
  });

  it('returns null when the thread does not exist', async () => {
    const notified = await pushOperatorEscalation(
      org.id,
      '00000000-0000-0000-0000-000000000000',
      'missing thread',
    );

    expect(notified).toBeNull();
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it('notifies every bound operator with the escalation message', async () => {
    const customer = await createTestCustomer(org.id, 'two-members@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.shopify);

    const member1 = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `user-${org.id}-1` },
    });
    const member2 = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `user-${org.id}-2` },
    });
    await db.orgMemberTelegramChat.createMany({
      data: [
        { orgMemberId: member1.id, chatId: `chat-${org.id}-1` },
        { orgMemberId: member2.id, chatId: `chat-${org.id}-2` },
      ],
    });

    const notified = await pushOperatorEscalation(org.id, thread.id, 'Order issue');

    expect(notified).toBe(2);
    expect(sendMessageSpy).toHaveBeenCalledTimes(2);

    const bodyArg = sendMessageSpy.mock.calls[0][1] as string;
    expect(bodyArg).toContain(`/dashboard/tickets?thread=${thread.id}`);
  });

  it('notifies operators bound over iMessage alongside Telegram', async () => {
    const customer = await createTestCustomer(org.id, 'imessage-member@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `user-${org.id}-im` },
    });
    await db.orgMemberTelegramChat.create({
      data: { orgMemberId: member.id, chatId: `chat-${org.id}-im` },
    });
    await db.orgMemberImessageBinding.create({
      data: { orgMemberId: member.id, senderId: `sender-${org.id}`, spaceId: `space-${org.id}` },
    });

    const notified = await pushOperatorEscalation(org.id, thread.id, 'Order issue');

    expect(notified).toBe(2);
    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
    expect(sendImessageToSpaceSpy).toHaveBeenCalledTimes(1);

    const [spaceId, body] = sendImessageToSpaceSpy.mock.calls[0] as [string, string];
    expect(spaceId).toBe(`space-${org.id}`);
    expect(body).toBe(sendMessageSpy.mock.calls[0][1]);
  });

  it('persists one handoff before delivery and reuses it after a failed send', async () => {
    const customer = await createTestCustomer(org.id, 'handoff-retry@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({ where: { id: thread.id }, data: { requestSummary: 'Customer asks to cancel order 1038.' } });
    createHandoffSpy.mockResolvedValue({
      stop_reason: 'end_turn', usage: { input_tokens: 20, output_tokens: 30 },
      content: [{ type: 'text', text: JSON.stringify({
        request: { text: 'They want to cancel order 1038.', evidence: 'cancel order 1038' },
        blocker: { text: "I can't cancel it because it shipped.", evidence: 'Order has shipped' },
      }) }],
    });
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `user-${org.id}-retry` },
    });
    await db.orgMemberImessageBinding.create({
      data: { orgMemberId: member.id, senderId: `sender-${org.id}-retry`, spaceId: `space-${org.id}-retry` },
    });
    sendImessageToSpaceSpy.mockRejectedValueOnce(new Error('Definite send failure'));
    expect(await pushOperatorEscalation(org.id, thread.id, 'Order has shipped')).toBe(0);
    const notes = await db.message.findMany({
      where: { organizationId: org.id, threadId: thread.id, externalMessageId: { startsWith: 'merchant-handoff:' } },
    });
    expect(notes).toHaveLength(1);
    expect(notes[0]!.contentText).toContain('They want to cancel order 1038.');
    await pushOperatorEscalation(org.id, thread.id, 'Order has shipped');
    const after = await db.message.findMany({
      where: { organizationId: org.id, threadId: thread.id, externalMessageId: { startsWith: 'merchant-handoff:' } },
    });
    expect(after).toEqual(notes);
    expect(sendImessageToSpaceSpy.mock.calls.at(-1)?.[1]).toBe(notes[0]!.contentText);
    expect(createHandoffSpy).toHaveBeenCalledOnce();
  });

  it('rejects an unsupported direction question before storing and delivering the handoff', async () => {
    const customer = await createTestCustomer(org.id, 'handoff-grounding@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({ where: { id: thread.id }, data: { requestSummary: 'Customer asks to cancel order 1038.' } });
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `user-${org.id}-grounding` },
    });
    await db.orgMemberImessageBinding.create({
      data: { orgMemberId: member.id, senderId: `sender-${org.id}-grounding`, spaceId: `space-${org.id}-grounding` },
    });
    const unsupportedQuestion = 'Should I let them know we can process a refund for a return?';
    createHandoffSpy.mockResolvedValue({
      stop_reason: 'end_turn', usage: { input_tokens: 20, output_tokens: 30 },
      content: [{ type: 'text', text: JSON.stringify({
        request: { text: 'They want to cancel order 1038.', evidence: 'cancel order 1038' },
        blocker: { text: "I can't cancel it because it shipped.", evidence: 'Order has shipped' },
        question: unsupportedQuestion,
      }) }],
    });

    expect(await pushOperatorEscalation(org.id, thread.id, 'Order has shipped')).toBe(1);
    const note = await db.message.findFirstOrThrow({
      where: { organizationId: org.id, threadId: thread.id, externalMessageId: { startsWith: 'merchant-handoff:' } },
    });
    expect(note.contentText).not.toContain(unsupportedQuestion);
    expect(sendImessageToSpaceSpy.mock.calls[0]?.[1]).toBe(note.contentText);
  });

  it('returns 0 when the only bound operator channel fails to send', async () => {
    const customer = await createTestCustomer(org.id, 'send-fail@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `user-${org.id}-fail` },
    });
    await db.orgMemberTelegramChat.create({
      data: { orgMemberId: member.id, chatId: `chat-${org.id}-fail` },
    });

    sendMessageSpy.mockResolvedValueOnce(false);

    const notified = await pushOperatorEscalation(org.id, thread.id, 'Order issue');

    expect(notified).toBe(0);
    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
  });

  it('notifies iMessage when Telegram send fails for a dual-bound operator', async () => {
    const customer = await createTestCustomer(org.id, 'partial-fanout@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `user-${org.id}-partial` },
    });
    await db.orgMemberTelegramChat.create({
      data: { orgMemberId: member.id, chatId: `chat-${org.id}-partial` },
    });
    await db.orgMemberImessageBinding.create({
      data: { orgMemberId: member.id, senderId: `sender-${org.id}-partial`, spaceId: `space-${org.id}-partial` },
    });

    sendMessageSpy.mockResolvedValueOnce(false);

    const notified = await pushOperatorEscalation(org.id, thread.id, 'Order issue');

    expect(notified).toBe(1);
    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
    expect(sendImessageToSpaceSpy).toHaveBeenCalledTimes(1);
  });
});
