import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType } from '@shopkeeper/db';
import { createTestMessage, createTestOrg } from '@shopkeeper/db/test-helpers';
import {
  operatorPlanNotificationIdentity,
  seedLegacyClassifierV4Thread,
} from '../../test-fixtures/support-plan-test-fixtures.js';
import { cleanupSingleTestOrg } from '../../test-fixtures/test-org-tracker.js';

// One person with two bound devices: the fan-out sends twice but parks once.
const ORG_MEMBER_ID = '00000000-0000-4000-8000-0000000000aa';
const TELEGRAM_BINDING = { channel: 'telegram', orgMemberId: ORG_MEMBER_ID, chatId: 'chat_1' };
const IMESSAGE_BINDING = {
  channel: 'imessage',
  orgMemberId: ORG_MEMBER_ID,
  senderId: 'sender_2',
  spaceId: 'space_2',
};

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

vi.mock('../../logger.js', () => ({
  default: mockLogger,
}));

vi.mock('../../operator-notify.js', () => ({
  bindingDeliveryKey: (binding: { channel: string; chatId?: string; senderId?: string }) =>
    (binding.channel === 'telegram' ? binding.chatId : binding.senderId),
  listOperatorBindings: listOperatorBindingsSpy,
  notifyOperator: notifyOperatorSpy,
  OperatorNotifyError: class OperatorNotifyError extends Error {
    name = 'OperatorNotifyError';
  },
}));

vi.mock('../../config/env.js', () => ({
  getGatewayDashboardUrl: () => 'https://dashboard.example.com',
}));

import {
  formatOperatorPlanMessage,
  sendOperatorAutoExecutionNotification,
  sendOperatorPlanNotification,
  sendOperatorQuestionNotification,
} from './planning-notifications.js';
import { OperatorNotifyError } from '../../operator-notify.js';
import { appendPendingPlan, getContext } from '../../operator-context.js';
import type { AgentPlan } from '../../types.js';
import type { RequestDisplay } from '../shared/request-display.js';
import { toGatewayAgentPlan } from './agent-plan-adapter.js';

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

function requestDisplay(topic: string): RequestDisplay {
  return {
    version: 1,
    kind: 'classified',
    sourceMessageId: 'fixture-message',
    facts: {
      ask: 'none',
      subject: null,
      order: null,
      deadline: null,
      deadlineText: null,
      alternative: null,
    },
    noRequest: false,
    topic,
  };
}

beforeEach(() => {
  listOperatorBindingsSpy.mockReset();
  notifyOperatorSpy.mockReset();
  mockLogger.info.mockClear();
  mockLogger.error.mockClear();
});

describe('formatOperatorPlanMessage', () => {
  // Found at the first Gate C rerun: the agent called the Special variant "the
  // sample", and a card that said only "Issue partial refund" could not show it.
  it('names the Shopify line item and quote a single line-item write targets', () => {
    const rawToolCalls = [{
      id: 'tc_refund',
      name: 'create_partial_refund',
      input: {
        order_id: '1032',
        items: [{ line_item_id: '11', quantity: 1 }],
        approval_amount: '8.50',
        approval_currency: 'USD',
        approval_line_items: [{ name: 'Linen Napkin - Special', quantity: 1, change: 'refund' }],
      },
    }];
    const adapted = toGatewayAgentPlan({
      instruction: 'Refund the torn napkin',
      steps: [{ id: 'tc_refund', category: 'action', tool: 'create_partial_refund', description: 'Refund', label: 'Issue partial refund', enabled: true }],
      rawToolCalls,
    })!;
    const message = formatOperatorPlanMessage(
      'Jane Doe',
      ChannelType.email,
      requestDisplay('Torn napkin'),
      adapted.steps,
      {
        rawToolCalls: adapted.rawToolCalls,
      },
    );

    expect(message).toContain('$8.50');
    expect(message).toContain('Linen Napkin - Special');
  });
});

// Overhaul plan, Next work item 3: an exact-draft proposal's card shows the whole
// message the approval sends, or declines to ask when it cannot.
describe('formatOperatorPlanMessage with an exact draft', () => {
  const addressSteps = [
    { category: 'action', tool: 'update_shopify_order_address', description: 'Update the address', label: 'Update shipping address', enabled: true },
    { category: 'communication', tool: 'send_reply', description: 'Tell the customer', label: 'Reply', enabled: true },
  ];
  const longDraft = `Hi Jane, ${'your order is on its way. '.repeat(130)}`.trim();
  const exact = (draft: string) => ({
    mode: 'exact_draft' as const,
    destination: { kind: 'thread' as const, id: THREAD_ID, channel: ChannelType.ig_dm },
    draft,
    allowedResultBindings: [],
  });

  it('shows an exact draft whole and asks for approval', () => {
    const draft = `Hi Jane, ${'we have updated the address on order #1043. '.repeat(16)}`.trim();
    expect(draft.length).toBeGreaterThan(600);
    const message = formatOperatorPlanMessage('Jane Doe', ChannelType.ig_dm, requestDisplay('Address change'), addressSteps, {
      rawToolCalls: [
        { name: 'update_shopify_order_address', input: {} },
        { name: 'send_reply', input: { text: draft } },
      ],
      communication: exact(draft),
    });

    expect(message).toContain(draft);
    expect(message).toContain('Sound good?');
  });

  it('does not ask for approval of a message too long to show', () => {
    expect(longDraft.length).toBeGreaterThan(3000);
    const message = formatOperatorPlanMessage('Jane Doe', ChannelType.ig_dm, requestDisplay('Address change'), addressSteps, {
      rawToolCalls: [
        { name: 'update_shopify_order_address', input: {} },
        { name: 'send_reply', input: { text: longDraft } },
      ],
      communication: exact(longDraft),
    });

    expect(message).not.toContain(longDraft.slice(0, 200));
    expect(message).toContain('open the thread to read it before approving');
    expect(message).not.toContain('Sound good?');
  });
});

describe('sendOperatorPlanNotification', () => {
  let orgId: string | null = null;

  afterEach(async () => {
    await cleanupSingleTestOrg(orgId);
    orgId = null;
  });

  // A thread on a classifier version older than requestFacts. Production still
  // held two of these at the 2026-08-23 inventory, and every one of them renders
  // through unavailableRequestDisplay().
  async function seedLegacyThread(sourceText: string | null) {
    const org = await createTestOrg();
    orgId = org.id;
    const { thread, messageId } = await seedLegacyClassifierV4Thread(org.id, sourceText);
    listOperatorBindingsSpy.mockResolvedValue([TELEGRAM_BINDING]);
    notifyOperatorSpy.mockResolvedValue({ channel: 'telegram', chatId: 'chat_1' });
    return { org, thread, messageId };
  }

  // The wiring, not the formatter: nothing is handed in, so the send path has to
  // find the customer's message itself.
  it('quotes the customer when the request snapshot cannot render one', async () => {
    const { org, thread, messageId } = await seedLegacyThread(
      'My order arrived with a cracked lid. Can I get a refund?',
    );

    await sendOperatorPlanNotification(
      org.id,
      thread.id,
      'Dana Reyes',
      ChannelType.email,
      'Needs a refund',
      plan,
      'Handle refund request',
      { identity: operatorPlanNotificationIdentity(messageId!) },
    );

    const [, , body] = notifyOperatorSpy.mock.calls[0] ?? [];
    expect(body).toContain('cracked lid');
    expect(body).not.toContain('Request details unavailable');
    expect(body).toContain('Good to send?');
  });

  it('drops the approval question when nothing can show the request', async () => {
    const { org, thread } = await seedLegacyThread(null);

    await sendOperatorPlanNotification(
      org.id,
      thread.id,
      'Dana Reyes',
      ChannelType.email,
      'Needs a refund',
      plan,
      'Handle refund request',
    );

    const [, , body] = notifyOperatorSpy.mock.calls[0] ?? [];
    expect(body).toContain('Request details unavailable');
    expect(body).toContain('open the thread first');
    expect(body).not.toContain('Good to send?');
    expect(body).not.toContain('Sound good?');
  });

  // A superseded message is not what the merchant is being asked about, so the
  // alignment filter has to reject it even though the row is readable.
  it('does not quote a message the thread has moved past', async () => {
    const { org, thread } = await seedLegacyThread('My order arrived with a cracked lid.');
    const stale = await createTestMessage(thread.id, 'Ignore that, wrong order number.');

    await sendOperatorPlanNotification(
      org.id,
      thread.id,
      'Dana Reyes',
      ChannelType.email,
      'Needs a refund',
      plan,
      'Handle refund request',
      { identity: operatorPlanNotificationIdentity(stale.id) },
    );

    const [, , body] = notifyOperatorSpy.mock.calls[0] ?? [];
    expect(body).not.toContain('Ignore that');
    expect(body).toContain('Request details unavailable');
    expect(body).not.toContain('Good to send?');
  });

  it('parks the plan with its identity, under the critical policy, for each bound operator', async () => {
    const org = await createTestOrg();
    orgId = org.id;
    listOperatorBindingsSpy.mockResolvedValue([TELEGRAM_BINDING, IMESSAGE_BINDING]);
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
        // This fixture seeds no thread row, so the snapshot would resolve to
        // `unavailable` and the card would correctly refuse to ask for a
        // decision -- which is not what this test is about. Every production
        // plan notification has a thread behind it; supply the display so the
        // policy assertions run on the path they describe.
        requestDisplay: requestDisplay('a refund on #1024'),
      },
    );

    expect(notifyOperatorSpy).toHaveBeenCalledTimes(2);
    expect(notifyOperatorSpy.mock.calls[0]?.[4]).toMatchObject({ policy: 'critical', threadId: THREAD_ID });
    expect(notifyOperatorSpy.mock.calls[0]?.[4]?.appendPlan?.plan).toMatchObject({
      planId: '00000000-0000-4000-8000-000000000001',
      sourceMessageId: '00000000-0000-4000-8000-000000000002',
      planHash: 'a'.repeat(64),
      instructionHash: 'b'.repeat(64),
    });
  });

  it('parks invalid validation metadata and never asks for approval', async () => {
    const org = await createTestOrg();
    orgId = org.id;
    listOperatorBindingsSpy.mockResolvedValue([TELEGRAM_BINDING]);
    notifyOperatorSpy.mockResolvedValue({ channel: 'telegram', chatId: 'chat_1' });
    const invalidPlan: AgentPlan = {
      ...plan,
      validation: {
        status: 'invalid',
        issues: [{
          code: 'invalid_tool_input',
          message: 'The reply text cannot be blank.',
          toolCallId: 'tc_1',
          tool: 'send_email',
        }],
      },
    };

    await sendOperatorPlanNotification(
      org.id,
      THREAD_ID,
      'Jane Doe',
      ChannelType.email,
      'Needs a refund',
      invalidPlan,
      'Handle refund request',
    );

    const [, , body, , notifyOptions] = notifyOperatorSpy.mock.calls[0] ?? [];
    expect(body).toContain("couldn't produce a safe executable draft");
    expect(body).not.toContain('Good to send?');
    expect(notifyOptions?.appendPlan?.plan?.validation).toEqual(invalidPlan.validation);
  });

  it('propagates critical notification failures so the worker job can retry', async () => {
    const org = await createTestOrg();
    orgId = org.id;
    listOperatorBindingsSpy.mockResolvedValue([TELEGRAM_BINDING]);
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
    listOperatorBindingsSpy.mockResolvedValue([TELEGRAM_BINDING, IMESSAGE_BINDING]);
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
});

describe('sendOperatorQuestionNotification', () => {
  it('propagates critical notification failures so the worker job can retry', async () => {
    listOperatorBindingsSpy.mockResolvedValue([TELEGRAM_BINDING]);
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
      listOperatorBindingsSpy.mockResolvedValue([TELEGRAM_BINDING]);
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
      await cleanupSingleTestOrg(org.id);
    }
  });
});

describe('sendOperatorAutoExecutionNotification', () => {
  it('swallows notification failures without rethrowing', async () => {
    listOperatorBindingsSpy.mockResolvedValue([TELEGRAM_BINDING]);
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
  });

  it('tells the merchant which step failed when a failure-replan recovered', async () => {
    listOperatorBindingsSpy.mockResolvedValue([TELEGRAM_BINDING]);
    notifyOperatorSpy.mockResolvedValue({ channel: 'telegram', chatId: 'chat_1' });

    await sendOperatorAutoExecutionNotification(
      'org_1',
      'thread_1',
      'Jane Doe',
      ChannelType.email,
      'Refund order #1042',
      {
        plan: {
          steps: [{
            category: 'communication',
            tool: 'send_reply',
            description: 'Tell the customer what happened',
            label: 'Reply',
            enabled: true,
          }],
          rawToolCalls: [{ id: 'send_1', name: 'send_reply', input: { text: 'Done' } }],
        },
        instruction: 'Refund order #1042',
        autoExecuted: true,
        autoExecutionKind: 'safe_reply',
        autoExecutionStatus: 'success',
        autoExecutionSummary: 'Replied after the refund failed',
        failureReplanRecovered: true,
        failureReplanFailureTool: 'create_refund',
        failureReplanFailureReason: 'Rejected',
        autoExecutionActions: [],
      },
    );

    const [, , body] = notifyOperatorSpy.mock.calls[0] ?? [];
    expect(body).toContain('create_refund');
    expect(body).toContain('Rejected');
  });
});
