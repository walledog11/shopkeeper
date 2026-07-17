import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';

const {
  mockExecuteAgentTurn,
  mockResolveOperatorThread,
  mockAssertBillingWriteAllowedForOrgId,
} = vi.hoisted(() => ({
  mockExecuteAgentTurn: vi.fn().mockResolvedValue({
    summary: 'Done.',
    actionsPerformed: [{ tool: 'get_shopify_orders', result: 'ok' }],
  }),
  mockResolveOperatorThread: vi.fn().mockResolvedValue({ id: 'op_thread_1', channelType: 'sms_agent' }),
  mockAssertBillingWriteAllowedForOrgId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@shopkeeper/agent/turn', () => ({
  executeAgentTurn: mockExecuteAgentTurn,
}));

vi.mock('@shopkeeper/agent/internal-thread', () => ({
  resolveOperatorThread: mockResolveOperatorThread,
}));

vi.mock('../billing/write-gate.js', () => ({
  assertBillingWriteAllowedForOrgId: mockAssertBillingWriteAllowedForOrgId,
}));

vi.mock('./agent-turn-deps.js', () => ({
  buildGatewayTurnDeps: vi.fn(() => ({ lock: {}, buildContext: vi.fn(), runAgent: vi.fn() })),
}));

import { executeOperatorAgentTurn } from './execute-operator-agent-turn.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  vi.clearAllMocks();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

describe('executeOperatorAgentTurn', () => {
  it('resolves the durable operator thread for free-form turns', async () => {
    const result = await executeOperatorAgentTurn({
      orgId: org.id,
      instruction: 'check order #1001',
      operatorKey: 'telegram:123',
      senderPhone: 'telegram:123',
      clerkUserId: 'usr_1',
    });

    expect(mockAssertBillingWriteAllowedForOrgId).toHaveBeenCalledWith(org.id);
    expect(mockResolveOperatorThread).toHaveBeenCalledWith(org.id, 'telegram:123');
    expect(mockExecuteAgentTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: org.id,
        threadId: 'op_thread_1',
        instruction: 'check order #1001',
        failureRoute: 'gateway:operator-turn',
        persistUserMessage: true,
        persistAgentMessage: true,
        persistAuditNote: true,
        auditMetadata: {
          senderPhone: 'telegram:123',
          clerkUserId: 'usr_1',
        },
      }),
      expect.anything(),
    );
    expect(result).toEqual({
      summary: 'Done.',
      threadId: 'op_thread_1',
      actionsPerformed: [{ tool: 'get_shopify_orders', result: 'ok' }],
    });
  });

  it('forwards the ledger and module tools the caller supplies', async () => {
    const moduleTools = { list_active_tickets: { name: 'list_active_tickets' } } as never;

    await executeOperatorAgentTurn({
      orgId: org.id,
      instruction: "what's in my inbox?",
      operatorKey: 'telegram:123',
      operatorLedger: 'Nothing is awaiting the merchant\'s decision.',
      moduleTools,
    });

    expect(mockExecuteAgentTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorLedger: 'Nothing is awaiting the merchant\'s decision.',
        moduleTools,
      }),
      expect.anything(),
    );
  });
});
