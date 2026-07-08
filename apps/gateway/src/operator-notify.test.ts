import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';

const { mockLogger, sendImessageToSpaceSpy, sendMessageSpy, updateContextSpy } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  sendImessageToSpaceSpy: vi.fn(),
  sendMessageSpy: vi.fn(),
  updateContextSpy: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  default: mockLogger,
}));

vi.mock('./clients/telegram-client.js', () => ({
  isTelegramConfigured: vi.fn(() => true),
  sendMessage: sendMessageSpy,
}));

vi.mock('./clients/spectrum.js', () => ({
  isImessageConfigured: vi.fn(() => true),
  sendImessageToSpace: sendImessageToSpaceSpy,
}));

vi.mock('./operator-context.js', () => ({
  updateContext: updateContextSpy,
}));

import { isImessageConfigured } from './clients/spectrum.js';
import { isTelegramConfigured } from './clients/telegram-client.js';
import {
  listOperatorBindings,
  notifyOperator,
  OperatorNotifyError,
  type OperatorBinding,
} from './operator-notify.js';

const TELEGRAM_MEMBER: OperatorBinding = { channel: 'telegram', chatId: 'chat_1' };
const IMESSAGE_MEMBER: OperatorBinding = { channel: 'imessage', senderId: 'sender_1', spaceId: 'space_1' };

beforeEach(() => {
  vi.mocked(isTelegramConfigured).mockReturnValue(true);
  vi.mocked(isImessageConfigured).mockReturnValue(true);
  sendMessageSpy.mockReset();
  sendImessageToSpaceSpy.mockReset().mockResolvedValue(undefined);
  updateContextSpy.mockReset().mockResolvedValue(undefined);
  mockLogger.warn.mockClear();
  mockLogger.error.mockClear();
});

describe('notifyOperator (telegram)', () => {
  it('updates context and returns the chat id on success', async () => {
    sendMessageSpy.mockResolvedValue(true);

    const result = await notifyOperator(
      'org_1',
      TELEGRAM_MEMBER,
      'hello',
      { pendingPlan: null },
    );

    expect(result).toEqual({ channel: 'telegram', chatId: 'chat_1' });
    expect(updateContextSpy).toHaveBeenCalledWith('org_1', 'chat_1', { pendingPlan: null });
  });

  it('returns null on best-effort HTTP send failure without updating context', async () => {
    sendMessageSpy.mockResolvedValue(false);

    const result = await notifyOperator(
      'org_1',
      TELEGRAM_MEMBER,
      'hello',
      { pendingPlan: null },
    );

    expect(result).toBeNull();
    expect(updateContextSpy).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { chatId: 'chat_1', channel: 'telegram', organizationId: 'org_1' },
      '[OperatorNotify] Send failed — skipping context update',
    );
  });

  it('throws on critical HTTP send failure', async () => {
    sendMessageSpy.mockResolvedValue(false);

    await expect(
      notifyOperator(
        'org_1',
        TELEGRAM_MEMBER,
        'approve this plan',
        { pendingPlan: null },
        { policy: 'critical', threadId: 'thread_1' },
      ),
    ).rejects.toThrow(OperatorNotifyError);

    expect(updateContextSpy).not.toHaveBeenCalled();
  });

  it('throws on critical network send failure', async () => {
    sendMessageSpy.mockRejectedValue(new Error('network down'));

    await expect(
      notifyOperator(
        'org_1',
        TELEGRAM_MEMBER,
        'escalation',
        {},
        { policy: 'critical', threadId: 'thread_1' },
      ),
    ).rejects.toThrow(OperatorNotifyError);

    expect(updateContextSpy).not.toHaveBeenCalled();
  });

  it('returns null on best-effort network send failure', async () => {
    sendMessageSpy.mockRejectedValue(new Error('network down'));

    const result = await notifyOperator(
      'org_1',
      TELEGRAM_MEMBER,
      'digest',
      {},
    );

    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: 'network down', chatId: 'chat_1', channel: 'telegram', organizationId: 'org_1' },
      '[OperatorNotify] Send failed',
    );
  });

  it('throws when Telegram is not configured on critical paths', async () => {
    vi.mocked(isTelegramConfigured).mockReturnValue(false);

    await expect(
      notifyOperator(
        'org_1',
        TELEGRAM_MEMBER,
        'escalation',
        {},
        { policy: 'critical' },
      ),
    ).rejects.toThrow('Telegram not configured');
  });

  it('returns null when Telegram is not configured on best-effort paths', async () => {
    vi.mocked(isTelegramConfigured).mockReturnValue(false);

    const result = await notifyOperator(
      'org_1',
      TELEGRAM_MEMBER,
      'digest',
      {},
    );

    expect(result).toBeNull();
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });
});

describe('notifyOperator (imessage)', () => {
  it('sends to the bound space with markdown stripped and keys context by sender id', async () => {
    const result = await notifyOperator(
      'org_1',
      IMESSAGE_MEMBER,
      'Proposed plan (**2 steps**):',
      { pendingPlan: null },
    );

    expect(result).toEqual({ channel: 'imessage', chatId: 'sender_1' });
    expect(sendImessageToSpaceSpy).toHaveBeenCalledWith('space_1', 'Proposed plan (2 steps):', {
      orgId: 'org_1',
      threadId: null,
      spaceId: 'space_1',
    });
    expect(updateContextSpy).toHaveBeenCalledWith('org_1', 'sender_1', { pendingPlan: null });
  });

  it('throws on critical send failure', async () => {
    sendImessageToSpaceSpy.mockRejectedValue(new Error('spectrum down'));

    await expect(
      notifyOperator(
        'org_1',
        IMESSAGE_MEMBER,
        'escalation',
        {},
        { policy: 'critical', threadId: 'thread_1' },
      ),
    ).rejects.toThrow('iMessage send failed');

    expect(updateContextSpy).not.toHaveBeenCalled();
  });

  it('returns null on best-effort send failure', async () => {
    sendImessageToSpaceSpy.mockRejectedValue(new Error('spectrum down'));

    const result = await notifyOperator(
      'org_1',
      IMESSAGE_MEMBER,
      'digest',
      {},
    );

    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: 'spectrum down', chatId: 'sender_1', channel: 'imessage', organizationId: 'org_1' },
      '[OperatorNotify] Send failed',
    );
  });

  it('throws when iMessage is not configured on critical paths', async () => {
    vi.mocked(isImessageConfigured).mockReturnValue(false);

    await expect(
      notifyOperator(
        'org_1',
        IMESSAGE_MEMBER,
        'escalation',
        {},
        { policy: 'critical' },
      ),
    ).rejects.toThrow('iMessage not configured');
  });

  it('returns null when iMessage is not configured on best-effort paths', async () => {
    vi.mocked(isImessageConfigured).mockReturnValue(false);

    const result = await notifyOperator(
      'org_1',
      IMESSAGE_MEMBER,
      'digest',
      {},
    );

    expect(result).toBeNull();
    expect(sendImessageToSpaceSpy).not.toHaveBeenCalled();
  });
});

describe('listOperatorBindings', () => {
  let org!: Awaited<ReturnType<typeof createTestOrg>>;

  beforeEach(async () => {
    org = await createTestOrg();
  });

  afterEach(async () => {
    await cleanupTestData(org?.id);
  });

  it('returns telegram chats and imessage bindings for the org only', async () => {
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `user-${org.id}` },
    });
    await db.orgMemberTelegramChat.create({
      data: { orgMemberId: member.id, chatId: `chat-${org.id}` },
    });
    await db.orgMemberImessageBinding.create({
      data: { orgMemberId: member.id, senderId: `sender-${org.id}`, spaceId: `space-${org.id}` },
    });

    const otherOrg = await createTestOrg();
    try {
      const otherMember = await db.orgMember.create({
        data: { organizationId: otherOrg.id, clerkUserId: `user-${otherOrg.id}` },
      });
      await db.orgMemberTelegramChat.create({
        data: { orgMemberId: otherMember.id, chatId: `chat-${otherOrg.id}` },
      });

      const bindings = await listOperatorBindings(org.id);

      expect(bindings).toEqual([
        { channel: 'telegram', chatId: `chat-${org.id}` },
        { channel: 'imessage', senderId: `sender-${org.id}`, spaceId: `space-${org.id}` },
      ]);
    } finally {
      await cleanupTestData(otherOrg.id);
    }
  });

  it('returns an empty list when no channels are bound', async () => {
    await expect(listOperatorBindings(org.id)).resolves.toEqual([]);
  });
});
