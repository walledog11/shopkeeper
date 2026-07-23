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
  parkedActionLabel,
  sendOperatorAutoExecutionNotification,
  sendOperatorPlanNotification,
  sendOperatorQuestionNotification,
} from './planning-notifications.js';
import { OperatorNotifyError } from '../operator-notify.js';
import { appendPendingPlan, getContext, updateContext } from '../operator-context.js';
import type { AgentPlan } from '../types.js';

// Send paths look up conversation stage by thread id, a uuid column in Postgres.
const THREAD_ID = '00000000-0000-4000-8000-0000000000aa';
const OTHER_THREAD_ID = '00000000-0000-4000-8000-0000000000bb';

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

// Each label has to complete "I won't …" in the fast-path dismissal.
describe('parkedActionLabel', () => {
  const step = (tool: string, label: string, category = 'write') =>
    ({ category, tool, description: label, label, enabled: true });

  it('names the customer for a single reply step', () => {
    expect(parkedActionLabel([step('send_reply', 'Reply')], 'Sarah Chen')).toBe('reply to Sarah');
    expect(parkedActionLabel([step('send_email', 'Reply')], 'Sarah Chen')).toBe('email Sarah');
  });

  it('falls back to the registry plan-step label for non-send actions', () => {
    expect(parkedActionLabel([step('create_refund', 'Refund')], 'Sarah Chen')).toBe(
      'issue refund for Sarah',
    );
  });

  it('counts the steps for a multi-action plan', () => {
    expect(
      parkedActionLabel([step('create_refund', 'Refund'), step('send_reply', 'Reply')], 'Sarah Chen'),
    ).toBe('run those 2 steps for Sarah');
  });

  it('drops the customer clause when the customer has no name', () => {
    expect(parkedActionLabel([step('send_reply', 'Reply')], null)).toBe('reply to the customer');
    expect(parkedActionLabel([step('create_refund', 'Refund')], null)).toBe('issue refund');
  });

  it('ignores read steps and yields nothing for a read-only plan', () => {
    expect(parkedActionLabel([step('get_order', 'Look up order', 'read')], 'Sarah Chen')).toBeUndefined();
    expect(
      parkedActionLabel(
        [step('get_order', 'Look up order', 'read'), step('send_reply', 'Reply')],
        'Sarah Chen',
      ),
    ).toBe('reply to Sarah');
  });
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

  it('discloses when the card overwrites a different thread\'s pending plan, above the footer', () => {
    const message = formatOperatorPlanMessage(
      'Jane Doe',
      ChannelType.email,
      'Needs a refund',
      plan.steps,
      { queueNotice: { kind: 'replaces', customerName: 'Sarah Chen' } },
    );

    expect(message).toContain("(This replaces the earlier plan for Sarah — that one's still on your dashboard.)");
    expect(message.indexOf('This replaces')).toBeLessThan(message.indexOf('Good to send?'));
  });

  it('uses a generic disclosure when the earlier plan has no customer name', () => {
    const message = formatOperatorPlanMessage(
      null,
      ChannelType.email,
      'Needs a refund',
      plan.steps,
      { queueNotice: { kind: 'replaces', customerName: null } },
    );

    expect(message).toContain("(This replaces an earlier plan — it's still on your dashboard.)");
  });

  it('omits the disclosure when nothing is being overwritten', () => {
    const message = formatOperatorPlanMessage('Jane Doe', ChannelType.email, 'Needs a refund', plan.steps, {});

    expect(message).not.toContain('This replaces');
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
  let orgId: string | null = null;

  afterEach(async () => {
    await cleanupTestData(orgId);
    orgId = null;
  });

  it('uses critical notification policy for each bound operator', async () => {
    const org = await createTestOrg();
    orgId = org.id;
    listOperatorBindingsSpy.mockResolvedValue([
      { channel: 'telegram', chatId: 'chat_1' },
      { channel: 'imessage', senderId: 'sender_2', spaceId: 'space_2' },
    ]);
    notifyOperatorSpy.mockResolvedValue({ channel: 'telegram', chatId: 'chat_1' });

    await sendOperatorPlanNotification(
      org.id,
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
    expect(notifyOperatorSpy.mock.calls[0]?.[4]).toMatchObject({
      policy: 'critical',
      threadId: THREAD_ID,
      idempotencyKey: expect.any(String),
      appendPlan: { maxDepth: 1 },
    });

    const [, , body] = notifyOperatorSpy.mock.calls[0] ?? [];
    expect(body).toContain(`Full thread: https://dashboard.example.com/dashboard/tickets/${THREAD_ID}`);
    expect(body).toContain('Good to send?');
    // Nothing is parked on this fresh context, so no overwrite disclosure.
    expect(body).not.toContain('This replaces');
    // The plan card parks by queue-append, not a whole-slot overwrite.
    expect(notifyOperatorSpy.mock.calls[0]?.[3]).toEqual({});
    expect(notifyOperatorSpy.mock.calls[0]?.[4]?.appendPlan?.plan).toMatchObject({
      planId: '00000000-0000-4000-8000-000000000001',
      sourceMessageId: '00000000-0000-4000-8000-000000000002',
      planHash: 'a'.repeat(64),
      instructionHash: 'b'.repeat(64),
      customerName: 'Jane Doe',
      actionLabel: 'email Jane',
    });
  });

  it('propagates critical notification failures so the worker job can retry', async () => {
    const org = await createTestOrg();
    orgId = org.id;
    listOperatorBindingsSpy.mockResolvedValue([{ channel: 'telegram', chatId: 'chat_1' }]);
    notifyOperatorSpy.mockRejectedValue(new OperatorNotifyError('Telegram send failed'));

    await expect(
      sendOperatorPlanNotification(
        org.id,
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
    const org = await createTestOrg();
    orgId = org.id;
    listOperatorBindingsSpy.mockResolvedValue([
      { channel: 'telegram', chatId: 'chat_1' },
      { channel: 'imessage', senderId: 'sender_2', spaceId: 'space_2' },
    ]);
    notifyOperatorSpy
      .mockResolvedValueOnce({ channel: 'telegram', chatId: 'chat_1' })
      .mockRejectedValueOnce(new OperatorNotifyError('iMessage send failed'));

    await expect(
      sendOperatorPlanNotification(
        org.id,
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

  it('appends the overwrite disclosure when a different thread\'s plan is already parked', async () => {
    const org = await createTestOrg();
    orgId = org.id;
    await updateContext(org.id, 'chat_1', {
      pendingPlan: {
        threadId: OTHER_THREAD_ID,
        instruction: 'Handle earlier request',
        rawToolCalls: [{ id: 'tc_0', name: 'create_refund' }],
        customerName: 'Bob Lee',
      },
    });
    listOperatorBindingsSpy.mockResolvedValue([{ channel: 'telegram', chatId: 'chat_1' }]);
    notifyOperatorSpy.mockResolvedValue({ channel: 'telegram', chatId: 'chat_1' });

    await sendOperatorPlanNotification(
      org.id,
      THREAD_ID,
      'Jane Doe',
      ChannelType.email,
      'Needs a refund',
      plan,
      'Handle refund request',
    );

    const [, , body] = notifyOperatorSpy.mock.calls[0] ?? [];
    expect(body).toContain("(This replaces the earlier plan for Bob — that one's still on your dashboard.)");
  });

  it('omits the disclosure when the parked plan is for the same thread', async () => {
    const org = await createTestOrg();
    orgId = org.id;
    await updateContext(org.id, 'chat_1', {
      pendingPlan: {
        threadId: THREAD_ID,
        instruction: 'Earlier draft on the same ticket',
        rawToolCalls: [{ id: 'tc_0', name: 'send_reply' }],
        customerName: 'Jane Doe',
      },
    });
    listOperatorBindingsSpy.mockResolvedValue([{ channel: 'telegram', chatId: 'chat_1' }]);
    notifyOperatorSpy.mockResolvedValue({ channel: 'telegram', chatId: 'chat_1' });

    await sendOperatorPlanNotification(
      org.id,
      THREAD_ID,
      'Jane Doe',
      ChannelType.email,
      'Needs a refund',
      plan,
      'Handle refund request',
    );

    const [, , body] = notifyOperatorSpy.mock.calls[0] ?? [];
    expect(body).not.toContain('This replaces');
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
      '00000000-0000-4000-8000-00000000c001',
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
        '00000000-0000-4000-8000-00000000c001',
        THREAD_ID,
        null,
        ChannelType.email,
        null,
        'Do we ship to Canada?',
        'Handle shipping question',
      ),
    ).rejects.toThrow(OperatorNotifyError);
  });

  it('clears only its own thread\'s queued plan, leaving other threads\' plans', async () => {
    const org = await createTestOrg();
    try {
      await appendPendingPlan(org.id, 'chat_1', {
        threadId: THREAD_ID, instruction: 'draft on this thread', rawToolCalls: [], planId: 'plan-here',
      }, 3);
      await appendPendingPlan(org.id, 'chat_1', {
        threadId: OTHER_THREAD_ID, instruction: 'other thread plan', rawToolCalls: [], planId: 'plan-other',
      }, 3);
      listOperatorBindingsSpy.mockResolvedValue([{ channel: 'telegram', chatId: 'chat_1' }]);
      notifyOperatorSpy.mockResolvedValue({ channel: 'telegram', chatId: 'chat_1' });

      await sendOperatorQuestionNotification(
        org.id,
        THREAD_ID,
        null,
        ChannelType.email,
        null,
        'Do we ship to Canada?',
        'Handle shipping question',
      );

      // The question's own thread plan is dropped; the unrelated thread survives.
      expect((await getContext(org.id, 'chat_1')).pendingPlans.map((plan) => plan.planId)).toEqual(['plan-other']);
    } finally {
      await cleanupTestData(org.id);
    }
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
