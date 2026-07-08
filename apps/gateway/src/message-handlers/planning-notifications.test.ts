import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType } from '@shopkeeper/db';

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
  sendOperatorAutoExecutionNotification,
  sendOperatorPlanNotification,
  sendOperatorQuestionNotification,
} from './planning-notifications.js';
import { OperatorNotifyError } from '../operator-notify.js';
import type { AgentPlan } from '../types.js';

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
  it('includes dashboard deep link and SMS-friendly footer for multi-step plans', () => {
    const message = formatOperatorPlanMessage(
      'Jane Doe',
      ChannelType.email,
      'Needs a refund',
      [
        { category: 'write', tool: 'send_email', description: 'Reply to customer', label: 'Reply', enabled: true },
        { category: 'write', tool: 'issue_refund', description: 'Issue full refund', label: 'Refund', enabled: true },
      ],
      { threadId: 'thread_1', dashboardUrl: 'https://dashboard.example.com' },
    );

    expect(message).toContain('Plan (2 steps):');
    expect(message).toContain('1. Email Jane');
    expect(message).toContain('2. Refund');
    expect(message).toContain('Open: https://dashboard.example.com/dashboard/tickets/thread_1');
    expect(message).toContain('yes · no · skip 1 · Open link above');
    expect(message).not.toContain('Sound good?');
  });

  it('omits skip hint for single-step plans', () => {
    const message = formatOperatorPlanMessage(
      null,
      ChannelType.email,
      'Quick reply',
      plan.steps,
      { threadId: 'thread_2', dashboardUrl: 'https://dashboard.example.com' },
    );

    expect(message).toContain('yes · no · Open link above');
    expect(message).not.toContain('skip 1');
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
      'thread_1',
      'Jane Doe',
      ChannelType.email,
      'Needs a refund',
      plan,
      'Handle refund request',
    );

    expect(notifyOperatorSpy).toHaveBeenCalledTimes(2);
    expect(notifyOperatorSpy.mock.calls[0]?.[4]).toEqual({
      policy: 'critical',
      threadId: 'thread_1',
    });

    const [, , body] = notifyOperatorSpy.mock.calls[0] ?? [];
    expect(body).toContain('Open: https://dashboard.example.com/dashboard/tickets/thread_1');
    expect(body).toContain('yes · no · Open link above');
  });

  it('propagates critical notification failures so the worker job can retry', async () => {
    listOperatorBindingsSpy.mockResolvedValue([{ channel: 'telegram', chatId: 'chat_1' }]);
    notifyOperatorSpy.mockRejectedValue(new OperatorNotifyError('Telegram send failed'));

    await expect(
      sendOperatorPlanNotification(
        'org_1',
        'thread_1',
        null,
        ChannelType.email,
        null,
        plan,
        'Handle refund request',
      ),
    ).rejects.toThrow(OperatorNotifyError);
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
      'thread_1',
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
      pendingQuestion: { threadId: 'thread_1', question: 'Do we ship to Canada?' },
    });
    expect(options).toEqual({ policy: 'critical', threadId: 'thread_1' });
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
        'thread_1',
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
