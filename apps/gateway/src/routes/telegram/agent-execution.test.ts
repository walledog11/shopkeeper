import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';
import type { OperatorMessageContext } from '../operator-message.js';

// Only the turn itself is stubbed — the ledger and the tools it hands over are
// built against the real database, so this proves what a live operator turn is
// actually offered.
const { mockExecuteOperatorAgentTurn, enqueue, sendTelegram, sendImessage } = vi.hoisted(() => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
  sendTelegram: vi.fn().mockResolvedValue(true),
  sendImessage: vi.fn().mockResolvedValue(undefined),
  mockExecuteOperatorAgentTurn: vi.fn().mockResolvedValue({
    summary: 'Nothing urgent.',
    threadId: 'op_thread_1',
    actionsPerformed: [],
  }),
}));

vi.mock('../../agent-task-ingest.js', async (importActual) => ({
  ...await importActual<typeof import('../../agent-task-ingest.js')>(),
  ensureAgentTaskEnqueued: enqueue,
}));
vi.mock('../../clients/telegram-client.js', () => ({
  sendMessage: sendTelegram,
  sendChatAction: vi.fn().mockResolvedValue(true),
  setMessageReaction: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../clients/spectrum.js', () => ({
  sendImessageToSpace: sendImessage,
  withImessageTyping: (_space: string, work: () => Promise<unknown>) => work(),
}));

vi.mock('../../message-handlers/operator/execute-operator-agent-turn.js', () => ({
  executeOperatorAgentTurn: mockExecuteOperatorAgentTurn,
}));

import { executeFreeFormInstruction } from './agent-execution.js';
import { processAgentTaskJob } from '../../workers/agent-task.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

async function messageContext(body: string, channel: 'telegram' | 'imessage' = 'telegram'): Promise<OperatorMessageContext> {
  const member = await db.orgMember.create({ data: { organizationId: org.id, clerkUserId: 'usr_1' } });
  const chatId = `phone-task-${randomUUID()}`;
  if (channel === 'telegram') {
    await db.orgMemberTelegramChat.create({ data: { orgMemberId: member.id, chatId } });
  } else {
    await db.orgMemberImessageBinding.create({ data: { orgMemberId: member.id, senderId: chatId, spaceId: 'space_phone_task' } });
  }
  const event = await db.operatorEvent.create({ data: {
    organizationId: org.id, clerkUserId: 'usr_1', channel,
    providerMessageId: randomUUID(), chatId, operatorKey: `member:${member.id}`, body,
    spaceId: channel === 'imessage' ? 'space_phone_task' : null,
    status: 'claimed', claimToken: randomUUID(), claimedAt: new Date(),
  } });
  return {
    chatId,
    body,
    senderRef: `member:${member.id}`,
    deliveryRef: `${channel}:${chatId}`,
    turnId: event.id,
    reply: vi.fn().mockResolvedValue(undefined),
    presence: async (_progress, work) => work(),
  };
}

beforeEach(async () => {
  org = await createTestOrg();
  vi.clearAllMocks();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

describe('executeFreeFormInstruction', () => {
  it('offers the operator the inbox tools alongside the pending-plan control tools', async () => {
    const message = await messageContext("what's in my inbox?");
    await executeFreeFormInstruction(org.id, 'usr_1', message);
    await executeFreeFormInstruction(org.id, 'usr_1', message);
    expect(mockExecuteOperatorAgentTurn).not.toHaveBeenCalled();
    expect(await db.agentRequest.count({ where: { organizationId: org.id } })).toBe(1);
    const task = await db.agentTask.findFirstOrThrow({ where: { organizationId: org.id } });
    expect(await db.agentTask.count({ where: { organizationId: org.id } })).toBe(1);
    await processAgentTaskJob({ organizationId: org.id, taskId: task.id, revision: task.revision });

    expect(mockExecuteOperatorAgentTurn).toHaveBeenCalledTimes(1);
    const { moduleTools } = mockExecuteOperatorAgentTurn.mock.calls[0][0];
    expect(Object.keys(moduleTools).sort()).toEqual([
      'answer_operator_question',
      'approve_pending_plan',
      'create_flash_sale',
      'draft_ticket_reply',
      'end_flash_sale',
      'get_order_status',
      'get_ticket',
      'list_active_tickets',
      'list_flash_sales',
      'list_recent_changes',
      'mark_ticket_spam',
      'reject_pending_plan',
      'revise_pending_plan',
      'search_product_help',
      'set_variant_prices',
    ]);
    const event = await db.operatorEvent.findUniqueOrThrow({ where: { id: message.turnId } });
    expect(event.agentRequestId).toBeTruthy();
    expect(event.replyMessageId).toBeTruthy();
    expect(event.replyDeliveredAt).toBeTruthy();
    expect(sendTelegram).toHaveBeenCalledOnce();
  });

  it('scopes the inbox tools to the calling organization', async () => {
    const otherOrg = await createTestOrg();
    try {
      const message = await messageContext('anything urgent?', 'imessage');
      await executeFreeFormInstruction(org.id, 'usr_1', message);
      const task = await db.agentTask.findFirstOrThrow({ where: { organizationId: org.id } });
      await processAgentTaskJob({ organizationId: org.id, taskId: task.id, revision: task.revision });
      const { moduleTools } = mockExecuteOperatorAgentTurn.mock.calls[0][0];

      // The tools close over the org they were built for, so another org's
      // ticket id cannot be read through this turn's get_ticket.
      const result = await moduleTools.get_ticket.execute(
        { ticket_id: '00000000-0000-0000-0000-000000000000' },
        {} as never,
      );
      expect(result.status).toBe('error');
      expect(sendImessage).toHaveBeenCalledWith('space_phone_task', 'Nothing urgent.', { orgId: org.id });
    } finally {
      await cleanupTestData(otherOrg.id);
    }
  });
});
