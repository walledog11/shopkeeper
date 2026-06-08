import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';

const {
  mockExecuteAgentTurn,
  mockResolveInternalAgentThread,
  mockAssertBillingWriteAllowedForOrgId,
  mockResolveClerkUserApprover,
} = vi.hoisted(() => ({
  mockExecuteAgentTurn: vi.fn().mockResolvedValue({
    summary: 'Done.',
    actionsPerformed: [{ tool: 'get_shopify_orders', result: 'ok' }],
  }),
  mockResolveInternalAgentThread: vi.fn().mockResolvedValue({ id: 'thread_1', channelType: 'sms_agent' }),
  mockAssertBillingWriteAllowedForOrgId: vi.fn().mockResolvedValue(undefined),
  mockResolveClerkUserApprover: vi.fn().mockResolvedValue({ clerkUserId: 'usr_1', displayName: 'Alex' }),
}));

vi.mock('@shopkeeper/agent/turn', () => ({
  executeAgentTurn: mockExecuteAgentTurn,
}));

vi.mock('@shopkeeper/agent/internal-thread', () => ({
  resolveInternalAgentThread: mockResolveInternalAgentThread,
}));

vi.mock('../billing/write-gate.js', () => ({
  assertBillingWriteAllowedForOrgId: mockAssertBillingWriteAllowedForOrgId,
}));

vi.mock('../clients/clerk-approver.js', () => ({
  resolveClerkUserApprover: mockResolveClerkUserApprover,
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
  it('mirrors the internal route for free-form operator turns', async () => {
    const result = await executeOperatorAgentTurn({
      orgId: org.id,
      instruction: 'check order #1001',
      senderPhone: 'telegram:123',
      clerkUserId: 'usr_1',
      orderNumber: '#1001',
    });

    expect(mockAssertBillingWriteAllowedForOrgId).toHaveBeenCalledWith(org.id);
    expect(mockResolveInternalAgentThread).toHaveBeenCalledWith({
      orgId: org.id,
      threadId: undefined,
      orderNumber: '#1001',
      senderPhone: 'telegram:123',
    });
    expect(mockResolveClerkUserApprover).not.toHaveBeenCalled();
    expect(mockExecuteAgentTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: org.id,
        threadId: 'thread_1',
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
      threadId: 'thread_1',
      actionsPerformed: [{ tool: 'get_shopify_orders', result: 'ok' }],
    });
  });

  it('records human approval metadata for pre-approved plan runs', async () => {
    mockResolveInternalAgentThread.mockResolvedValueOnce({ id: 'thread_2', channelType: 'sms_agent' });
    mockResolveClerkUserApprover.mockResolvedValueOnce({ clerkUserId: 'usr_2', displayName: 'Alex' });

    await executeOperatorAgentTurn({
      orgId: org.id,
      threadId: 'thread_2',
      instruction: 'refund order',
      clerkUserId: 'usr_2',
      approvedToolCalls: [{ id: 'tc1', name: 'refund_order', input: undefined }],
    });

    expect(mockResolveClerkUserApprover).toHaveBeenCalledWith('usr_2');
    const [turnParams] = mockExecuteAgentTurn.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(turnParams).toMatchObject({
      threadId: 'thread_2',
      auditMode: 'human_approved',
      approval: {
        approverId: 'usr_2:Alex',
        instructionHash: expect.any(String),
      },
    });
    expect(turnParams).not.toHaveProperty('persistUserMessage');
    expect(turnParams).not.toHaveProperty('persistAgentMessage');
  });
});
