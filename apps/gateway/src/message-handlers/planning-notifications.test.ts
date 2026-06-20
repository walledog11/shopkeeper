import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType } from '@shopkeeper/db';

const { mockLogger, notifyOperatorSpy } = vi.hoisted(() => ({
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
  notifyOperator: notifyOperatorSpy,
  OperatorNotifyError: class OperatorNotifyError extends Error {
    name = 'OperatorNotifyError';
  },
}));

const { findManySpy } = vi.hoisted(() => ({
  findManySpy: vi.fn(),
}));

vi.mock('@shopkeeper/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shopkeeper/db')>();
  return {
    ...actual,
    db: {
      ...actual.db,
      orgMemberTelegramChat: {
        ...actual.db.orgMemberTelegramChat,
        findMany: findManySpy,
      },
    },
  };
});

import {
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
  findManySpy.mockReset();
  notifyOperatorSpy.mockReset();
  mockLogger.info.mockClear();
  mockLogger.error.mockClear();
});

describe('sendOperatorPlanNotification', () => {
  it('uses critical notification policy for each bound operator', async () => {
    findManySpy.mockResolvedValue([{ chatId: 'chat_1' }, { chatId: 'chat_2' }]);
    notifyOperatorSpy.mockResolvedValue({ chatId: 'chat_1' });

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
  });

  it('propagates critical notification failures so the worker job can retry', async () => {
    findManySpy.mockResolvedValue([{ chatId: 'chat_1' }]);
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
    findManySpy.mockResolvedValue([{ chatId: 'chat_1' }, { chatId: 'chat_2' }]);
    notifyOperatorSpy.mockResolvedValue({ chatId: 'chat_1' });

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
    findManySpy.mockResolvedValue([]);

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
    findManySpy.mockResolvedValue([{ chatId: 'chat_1' }]);
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
    findManySpy.mockResolvedValue([{ chatId: 'chat_1' }]);
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
      { err: 'network down', threadId: 'thread_1' },
      '[Worker] sendOperatorAutoExecutionNotification error',
    );
  });
});
