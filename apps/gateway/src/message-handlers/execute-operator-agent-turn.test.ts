import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import type { AgentPlan } from '@shopkeeper/agent/types';

const {
  mockExecuteAgentTurn,
  mockResolveOperatorThread,
  mockAssertBillingWriteAllowedForOrgId,
} = vi.hoisted(() => ({
  mockExecuteAgentTurn: vi.fn().mockResolvedValue({
    summary: 'Done.',
    actionsPerformed: [{ tool: 'get_shopify_orders', result: 'ok' }],
  }),
  mockResolveOperatorThread: vi.fn().mockResolvedValue({ id: 'op_thread_1', channelType: 'operator' }),
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
  buildGatewayPlanExecutionDeps: vi.fn(() => ({
    lock: {}, buildContext: vi.fn(), runAgent: vi.fn(), planAgent: vi.fn(),
  })),
}));

import { executeOperatorAgentTurn, executeOperatorApprovedCachedPlan } from './execute-operator-agent-turn.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  vi.clearAllMocks();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

describe('executeOperatorAgentTurn', () => {
  // Every row of the 2026-09-10 operator turn said `human_approved` with a null
  // approver, because the turn named no mode and the default supplied the
  // strongest one. The merchant who typed the instruction is on record here.
  it('names the merchant who sent the instruction', async () => {
    await executeOperatorAgentTurn({
      orgId: org.id,
      instruction: 'refund order #1031',
      operatorKey: 'member:m1',
      clerkUserId: 'usr_42',
    });

    const [params] = mockExecuteAgentTurn.mock.calls[0] as [Record<string, unknown>];
    expect(params.auditMode).toBe('human_approved');
    expect(params.approval).toMatchObject({ approverId: expect.stringContaining('usr_42') });
    // They authorized the instruction, not a set of tool calls they read first.
    expect(params.approval).not.toHaveProperty('approvedPlanHash');
  });

  it('claims no approval when the sender cannot be identified', async () => {
    await executeOperatorAgentTurn({
      orgId: org.id,
      instruction: 'refund order #1031',
      operatorKey: 'member:m1',
    });

    const [params] = mockExecuteAgentTurn.mock.calls[0] as [Record<string, unknown>];
    expect(params.auditMode).toBeUndefined();
    expect(params.approval).toBeUndefined();
  });

  it('resolves the durable operator thread for free-form turns', async () => {
    const result = await executeOperatorAgentTurn({
      orgId: org.id,
      instruction: 'check order #1001',
      turnId: '00000000-0000-4000-8000-000000000321',
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
        turnId: '00000000-0000-4000-8000-000000000321',
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

  // Package 3, step 7: the same suspended proposal reaching the operator approval
  // surface — the card the merchant approves from Telegram or iMessage. It enters
  // the shared boundary, so it owes the same composition the dashboard's does.
  it('runs a suspended proposal approved from the operator card with composition', async () => {
    const customer = await createTestCustomer(org.id, 'op-approve@test.com', { name: 'Owner' });
    const thread = await createTestThread(org.id, customer.id, ChannelType.operator);
    const message = await createTestMessage(thread.id, 'Refund the torn napkin');
    const approvedToolCalls = [{ id: 'refund_1', name: 'create_refund', input: { order_id: '456', amount: '20.00' } }];
    const plan: AgentPlan = {
      instruction: 'Refund the torn napkin',
      steps: [{
        id: 'refund_1',
        tool: 'create_refund',
        label: 'Issue refund',
        description: 'Refund $20.00',
        category: 'action',
        enabled: true,
      }],
      rawToolCalls: approvedToolCalls,
      suspendedAtProposal: true,
    };
    await db.thread.update({
      where: { id: thread.id },
      data: {
        cachedPlanMessageId: message.id,
        cachedPlan: buildAgentPlanCacheRecord({
          instruction: plan.instruction,
          lastCustomerMessageId: message.id,
          settings: resolveAgentSettings(null),
          plan,
        }) as object,
      },
    });

    await executeOperatorApprovedCachedPlan({
      orgId: org.id,
      threadId: thread.id,
      instruction: plan.instruction,
      approvedToolCalls,
    });

    expect(mockExecuteAgentTurn).toHaveBeenCalledWith(
      expect.objectContaining({ composeFromReceipt: true }),
      expect.anything(),
    );
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

it('passes restrictive workspace policy into free-form operator execution', async () => {
  await db.organization.update({ where: { id: org.id }, data: { settings: {
    blockCancellations: true, maxRefundAmount: 12, dailyLLMSpendCapUsd: 2,
    toolsEnabled: { action: false }, brandVoice: 'Brief and factual',
  } } });
  await executeOperatorAgentTurn({ orgId: org.id, instruction: 'cancel order', operatorKey: 'member:1' });
  expect(mockExecuteAgentTurn).toHaveBeenCalledWith(expect.objectContaining({ orgSettings: expect.objectContaining({
    blockCancellations: true, maxRefundAmount: 12, dailyLLMSpendCapUsd: 2,
    toolsEnabled: expect.objectContaining({ action: false }), brandVoice: 'Brief and factual',
  }) }), expect.anything());
});
