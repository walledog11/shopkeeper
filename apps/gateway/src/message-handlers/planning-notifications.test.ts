import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, SenderType } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';

const { listOperatorBindingsSpy, mockLogger, notifyOperatorSpy } = vi.hoisted(() => ({
  listOperatorBindingsSpy: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  notifyOperatorSpy: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  default: mockLogger,
}));

vi.mock('../operator-notify.js', () => ({
  listOperatorBindings: listOperatorBindingsSpy,
  notifyOperator: notifyOperatorSpy,
  OperatorNotifyError: class OperatorNotifyError extends Error {
    name = 'OperatorNotifyError';
  },
}));

vi.mock('../config/env.js', () => ({
  getGatewayDashboardUrl: () => 'https://dashboard.example.com',
}));

import {
  formatOperatorPlanMessage,
  getConversationStage,
  sendOperatorAutoExecutionNotification,
  sendOperatorPlanNotification,
  sendOperatorQuestionNotification,
} from './planning-notifications.js';
import { OperatorNotifyError } from '../operator-notify.js';
import type { AgentPlan } from '../types.js';

// Send paths look up conversation stage by thread id, a uuid column in Postgres.
const THREAD_ID = '00000000-0000-4000-8000-0000000000aa';

const plan: AgentPlan = {
  steps: [
    {
      category: 'write',
      tool: 'send_email',
      description: 'Reply to customer',
      label: 'Reply',
      enabled: true,
    },
  ],
  rawToolCalls: [{ id: 'tc_1', name: 'send_email' }],
};

beforeEach(() => {
  listOperatorBindingsSpy.mockReset();
  notifyOperatorSpy.mockReset();
  mockLogger.info.mockClear();
  mockLogger.error.mockClear();
});

describe('formatOperatorPlanMessage', () => {
  it('lists steps, the deep link, and the draft for multi-step plans', () => {
    const message = formatOperatorPlanMessage(
      'Jane Doe',
      ChannelType.email,
      'Needs a refund',
      [
        { category: 'write', tool: 'send_email', description: 'Reply to customer', label: 'Reply', enabled: true },
        { category: 'write', tool: 'issue_refund', description: 'Issue full refund', label: 'Refund', enabled: true },
      ],
      {
        threadId: 'thread_1',
        dashboardUrl: 'https://dashboard.example.com',
        rawToolCalls: [
          { name: 'send_email', input: { to: 'jane@x.com', subject: 'Your refund', body: 'Your refund is on its way!' } },
          { name: 'issue_refund', input: {} },
        ],
      },
    );

    expect(message).toContain('New email from Jane — needs a refund');
    expect(message).toContain("Here's what I'd do:");
    expect(message).toContain('1. Email Jane');
    expect(message).toContain('2. Refund');
    expect(message).toContain('The reply: "Your refund is on its way!"');
    expect(message).toContain('Full thread: https://dashboard.example.com/dashboard/tickets/thread_1');
    expect(message).toContain('Sound good?');
    expect(message).not.toContain('New ticket');
    expect(message).not.toContain('skip 1');
  });

  it('presents a lone reply on a DM thread as a draft, never as an email', () => {
    const message = formatOperatorPlanMessage(
      'Sarah Lee',
      ChannelType.ig_dm,
      'Customer asked when the next restock will occur.',
      [{ category: 'write', tool: 'send_reply', description: 'Reply to customer', label: 'Reply', enabled: true }],
      {
        threadId: 'thread_1',
        dashboardUrl: 'https://dashboard.example.com',
        rawToolCalls: [{ name: 'send_reply', input: { text: 'It drops in about a month!' } }],
      },
    );

    expect(message).toContain('New Instagram DM from Sarah — customer asked when the next restock will occur.');
    expect(message).toContain('I\'d reply:\n"It drops in about a month!"');
    expect(message).toContain('Good to send?');
    expect(message).not.toContain('Email');
    expect(message).not.toContain('Plan (');
  });

  it('labels send_reply steps by the thread channel in multi-step plans', () => {
    const message = formatOperatorPlanMessage(
      'Sarah Lee',
      ChannelType.ig_dm,
      'Wants a refund and an answer',
      [
        { category: 'write', tool: 'issue_refund', description: 'Issue full refund', label: 'Refund order #1042', enabled: true },
        { category: 'write', tool: 'send_reply', description: 'Reply to customer', label: 'Reply', enabled: true },
      ],
      {
        rawToolCalls: [{ name: 'send_reply', input: { text: 'Refund is on its way!' } }],
      },
    );

    expect(message).toContain('1. Refund order #1042');
    expect(message).toContain('2. Reply to Sarah');
    expect(message).not.toContain('Email');
  });

  it('marks a follow-up on an ongoing conversation instead of announcing a new one', () => {
    const message = formatOperatorPlanMessage(
      'Sarah Lee',
      ChannelType.ig_dm,
      'Customer is asking when the snowboard restocks.',
      [{ category: 'write', tool: 'send_reply', description: 'Reply to customer', label: 'Reply', enabled: true }],
      {
        rawToolCalls: [{ name: 'send_reply', input: { text: 'About a month!' } }],
        stage: { isFollowUp: true, newMessages: 1 },
      },
    );

    expect(message).toContain('Sarah replied on Instagram — customer is asking when the snowboard restocks.');
    expect(message).not.toContain('New Instagram DM');
  });

  it('counts a multi-text burst in the header', () => {
    const followUp = formatOperatorPlanMessage(
      'Sarah Lee',
      ChannelType.ig_dm,
      'Customer sent more details.',
      plan.steps,
      { stage: { isFollowUp: true, newMessages: 3 } },
    );
    expect(followUp).toContain('Sarah sent 3 more messages on Instagram — customer sent more details.');

    const fresh = formatOperatorPlanMessage(
      null,
      ChannelType.ig_dm,
      'Customer asked two things.',
      plan.steps,
      { stage: { isFollowUp: false, newMessages: 2 } },
    );
    expect(fresh).toContain('New Instagram DM (2 messages) — customer asked two things.');
  });

  it('asks for a send on reply-only plans without a draft excerpt', () => {
    const message = formatOperatorPlanMessage(
      null,
      ChannelType.email,
      'Quick reply',
      plan.steps,
      { threadId: 'thread_2', dashboardUrl: 'https://dashboard.example.com' },
    );

    expect(message).toContain('Good to send?');
    expect(message).not.toContain('skip 1');
  });
});

describe('getConversationStage', () => {
  let orgId: string | null = null;

  afterEach(async () => {
    await cleanupTestData(orgId);
    orgId = null;
  });

  it('reads fresh vs follow-up and the unanswered burst from thread history', async () => {
    const org = await createTestOrg();
    orgId = org.id;
    const customer = await createTestCustomer(org.id, 'ig_sender_1');
    const thread = await createTestThread(org.id, customer.id, ChannelType.ig_dm);

    await createTestMessage(thread.id, 'When is the restock?');
    expect(await getConversationStage(thread.id)).toEqual({ isFollowUp: false, newMessages: 1 });

    await createTestMessage(thread.id, 'The pink one specifically');
    expect(await getConversationStage(thread.id)).toEqual({ isFollowUp: false, newMessages: 2 });

    await createTestMessage(thread.id, 'It drops in about a month!', SenderType.ai);
    await createTestMessage(thread.id, 'Will you announce it?');
    expect(await getConversationStage(thread.id)).toEqual({ isFollowUp: true, newMessages: 1 });
  });

  it('ignores internal notes and treats an empty thread as fresh', async () => {
    const org = await createTestOrg();
    orgId = org.id;
    const customer = await createTestCustomer(org.id, 'ig_sender_2');
    const thread = await createTestThread(org.id, customer.id, ChannelType.ig_dm);

    expect(await getConversationStage(thread.id)).toEqual({ isFollowUp: false, newMessages: 1 });

    await createTestMessage(thread.id, 'When is the restock?');
    await createTestMessage(thread.id, '__shopkeeper_agent__ transcript', SenderType.note);
    expect(await getConversationStage(thread.id)).toEqual({ isFollowUp: false, newMessages: 1 });
  });
});

describe('sendOperatorPlanNotification', () => {
  it('uses critical notification policy for each bound operator', async () => {
    listOperatorBindingsSpy.mockResolvedValue([
      { channel: 'telegram', chatId: 'chat_1' },
      { channel: 'imessage', senderId: 'sender_2', spaceId: 'space_2' },
    ]);
    notifyOperatorSpy.mockResolvedValue({ channel: 'telegram', chatId: 'chat_1' });

    await sendOperatorPlanNotification(
      'org_1',
      THREAD_ID,
      'Jane Doe',
      ChannelType.email,
      'Needs a refund',
      plan,
      'Handle refund request',
      {
        identity: {
          planId: '00000000-0000-4000-8000-000000000001',
          sourceMessageId: '00000000-0000-4000-8000-000000000002',
          planHash: 'a'.repeat(64),
          instructionHash: 'b'.repeat(64),
        },
      },
    );

    expect(notifyOperatorSpy).toHaveBeenCalledTimes(2);
    expect(notifyOperatorSpy.mock.calls[0]?.[4]).toEqual({
      policy: 'critical',
      threadId: THREAD_ID,
      idempotencyKey: expect.any(String),
    });

    const [, , body] = notifyOperatorSpy.mock.calls[0] ?? [];
    expect(body).toContain(`Full thread: https://dashboard.example.com/dashboard/tickets/${THREAD_ID}`);
    expect(body).toContain('Good to send?');
    expect(notifyOperatorSpy.mock.calls[0]?.[3]).toMatchObject({
      pendingPlan: {
        planId: '00000000-0000-4000-8000-000000000001',
        sourceMessageId: '00000000-0000-4000-8000-000000000002',
        planHash: 'a'.repeat(64),
        instructionHash: 'b'.repeat(64),
      },
    });
  });

  it('propagates critical notification failures so the worker job can retry', async () => {
    listOperatorBindingsSpy.mockResolvedValue([{ channel: 'telegram', chatId: 'chat_1' }]);
    notifyOperatorSpy.mockRejectedValue(new OperatorNotifyError('Telegram send failed'));

    await expect(
      sendOperatorPlanNotification(
        'org_1',
        THREAD_ID,
        null,
        ChannelType.email,
        null,
        plan,
        'Handle refund request',
      ),
    ).rejects.toThrow(OperatorNotifyError);
  });

  it('does not fail the job when at least one channel delivers on partial fan-out failure', async () => {
    listOperatorBindingsSpy.mockResolvedValue([
      { channel: 'telegram', chatId: 'chat_1' },
      { channel: 'imessage', senderId: 'sender_2', spaceId: 'space_2' },
    ]);
    notifyOperatorSpy
      .mockResolvedValueOnce({ channel: 'telegram', chatId: 'chat_1' })
      .mockRejectedValueOnce(new OperatorNotifyError('iMessage send failed'));

    await expect(
      sendOperatorPlanNotification(
        'org_1',
        THREAD_ID,
        null,
        ChannelType.email,
        null,
        plan,
        'Handle refund request',
      ),
    ).resolves.toBeUndefined();

    expect(notifyOperatorSpy).toHaveBeenCalledTimes(2);
  });
});

describe('sendOperatorQuestionNotification', () => {
  it('parks pendingQuestion and clears pendingPlan on each operator, critical policy', async () => {
    listOperatorBindingsSpy.mockResolvedValue([
      { channel: 'telegram', chatId: 'chat_1' },
      { channel: 'imessage', senderId: 'sender_2', spaceId: 'space_2' },
    ]);
    notifyOperatorSpy.mockResolvedValue({ channel: 'telegram', chatId: 'chat_1' });

    await sendOperatorQuestionNotification(
      'org_1',
      THREAD_ID,
      'Jane Doe',
      ChannelType.email,
      'Wants to know shipping coverage',
      'Do we ship to Canada?',
      'Handle shipping question',
    );

    expect(notifyOperatorSpy).toHaveBeenCalledTimes(2);
    const [, , body, contextPatch, options] = notifyOperatorSpy.mock.calls[0] ?? [];
    expect(body).toContain('Do we ship to Canada?');
    expect(contextPatch).toEqual({
      pendingPlan: null,
      pendingQuestion: { threadId: THREAD_ID, question: 'Do we ship to Canada?' },
    });
    expect(options).toEqual({
      policy: 'critical',
      threadId: THREAD_ID,
      idempotencyKey: expect.any(String),
    });
  });

  it('no-ops when no operators are bound', async () => {
    listOperatorBindingsSpy.mockResolvedValue([]);

    await sendOperatorQuestionNotification(
      'org_1',
      'thread_1',
      null,
      ChannelType.email,
      null,
      'Do we ship to Canada?',
      'Handle shipping question',
    );

    expect(notifyOperatorSpy).not.toHaveBeenCalled();
  });

  it('propagates critical notification failures so the worker job can retry', async () => {
    listOperatorBindingsSpy.mockResolvedValue([{ channel: 'telegram', chatId: 'chat_1' }]);
    notifyOperatorSpy.mockRejectedValue(new OperatorNotifyError('Telegram send failed'));

    await expect(
      sendOperatorQuestionNotification(
        'org_1',
        THREAD_ID,
        null,
        ChannelType.email,
        null,
        'Do we ship to Canada?',
        'Handle shipping question',
      ),
    ).rejects.toThrow(OperatorNotifyError);
  });
});

describe('sendOperatorAutoExecutionNotification', () => {
  it('swallows notification failures without rethrowing', async () => {
    listOperatorBindingsSpy.mockResolvedValue([{ channel: 'telegram', chatId: 'chat_1' }]);
    notifyOperatorSpy.mockRejectedValue(new Error('network down'));

    await expect(
      sendOperatorAutoExecutionNotification(
        'org_1',
        'thread_1',
        null,
        ChannelType.email,
        'Auto-executed',
        {
          plan,
          instruction: 'Handle refund request',
          autoExecuted: true,
          autoExecutionStatus: 'success',
          autoExecutionSummary: 'Done',
          autoExecutionActions: [],
        },
      ),
    ).resolves.toBeUndefined();

    expect(mockLogger.error).toHaveBeenCalledWith(
      {
        err: 'network down',
        organizationId: 'org_1',
        threadId: 'thread_1',
        chatId: 'chat_1',
        channel: 'telegram',
      },
      '[Worker] Auto-execution notification failed',
    );
  });
});
