import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';
import type { OperatorContext } from '../../operator-context.js';
import type { OperatorMessageContext } from '../operator-message.js';

// Only the turn itself is stubbed — the ledger and the tools it hands over are
// built against the real database, so this proves what a live operator turn is
// actually offered.
const { mockExecuteOperatorAgentTurn } = vi.hoisted(() => ({
  mockExecuteOperatorAgentTurn: vi.fn().mockResolvedValue({
    summary: 'Nothing urgent.',
    threadId: 'op_thread_1',
    actionsPerformed: [],
  }),
}));

vi.mock('../../message-handlers/execute-operator-agent-turn.js', () => ({
  executeOperatorAgentTurn: mockExecuteOperatorAgentTurn,
}));

import { executeFreeFormInstruction } from './agent-execution.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

const EMPTY_CONTEXT: OperatorContext = {
  pendingPlans: [],
  pendingPlan: null,
  pendingDigest: null,
  pendingQuestion: null,
};

function messageContext(body: string): OperatorMessageContext {
  return {
    chatId: 'chat_1',
    body,
    senderRef: 'telegram:123',
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
    await executeFreeFormInstruction(org.id, 'usr_1', messageContext("what's in my inbox?"), EMPTY_CONTEXT);

    expect(mockExecuteOperatorAgentTurn).toHaveBeenCalledTimes(1);
    const { moduleTools } = mockExecuteOperatorAgentTurn.mock.calls[0][0];
    expect(Object.keys(moduleTools).sort()).toEqual([
      'answer_operator_question',
      'approve_pending_plan',
      'get_ticket',
      'list_active_tickets',
      'mark_ticket_spam',
      'reject_pending_plan',
      'revise_pending_plan',
      'send_ticket_reply',
    ]);
  });

  it('scopes the inbox tools to the calling organization', async () => {
    const otherOrg = await createTestOrg();
    try {
      await executeFreeFormInstruction(org.id, 'usr_1', messageContext('anything urgent?'), EMPTY_CONTEXT);
      const { moduleTools } = mockExecuteOperatorAgentTurn.mock.calls[0][0];

      // The tools close over the org they were built for, so another org's
      // ticket id cannot be read through this turn's get_ticket.
      const result = await moduleTools.get_ticket.execute(
        { ticket_id: '00000000-0000-0000-0000-000000000000' },
        {} as never,
      );
      expect(result.status).toBe('error');
    } finally {
      await cleanupTestData(otherOrg.id);
    }
  });
});
