import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, ChannelType } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  createTestIntegration,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import type { AgentPlan } from '@shopkeeper/agent/types';

// Reviewed-plan gateway smoke test. Runs the durable cached-plan approval path
// end-to-end against the real DB and agent core, stubbing only the host seams a
// test cannot reach: ioredis, Clerk, the billing gate, and Shopify's REST API.
// It proves policy-blocked approvals still pass through one durable claim and
// produce linked terminal/audit state without reaching Shopify.
//
// Note: the operator path resolves agent settings from defaults, so the enforced
// refund cap is the guarded-tier default ($50), not the org's configured tier.
// That settings-source divergence from the dashboard is deferred post-V1 work;
// this test only asserts that policy enforcement holds on the live gateway operator path.

const { acquireSpy, releaseSpy } = vi.hoisted(() => {
  const releaseSpy = vi.fn().mockResolvedValue(undefined);
  return {
    releaseSpy,
    acquireSpy: vi.fn(async () => ({ release: releaseSpy })),
  };
});

vi.mock('../clients/agent-runtime.js', () => ({
  getGatewayLockProvider: () => ({ acquire: acquireSpy }),
}));

vi.mock('../billing/write-gate.js', () => ({
  assertBillingWriteAllowedForOrgId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../clients/clerk-approver.js', () => ({
  resolveClerkUserApprover: vi.fn().mockResolvedValue({ clerkUserId: 'usr_op', displayName: 'Owner' }),
}));

import { executeOperatorApprovedCachedPlan } from './execute-operator-agent-turn.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;
let threadId!: string;
// Any Shopify REST call means the policy block failed to short-circuit execution.
const fetchMock = vi.fn(async () => {
  throw new Error('Shopify must not be called when a refund is policy-blocked');
});

beforeEach(async () => {
  org = await createTestOrg();
  const customer = await createTestCustomer(org.id, 'op@test.com', { name: 'Owner' });
  const thread = await createTestThread(org.id, customer.id, ChannelType.sms_agent);
  threadId = thread.id;
  const message = await createTestMessage(threadId, 'Please refund order #1001');
  const plan: AgentPlan = {
    instruction: 'refund order #1001',
    steps: [{
      id: 'tc_1',
      tool: 'create_refund',
      label: 'Refund order',
      description: 'Refund $200.00',
      category: 'action',
      enabled: true,
    }],
    rawToolCalls: [{
      id: 'tc_1',
      name: 'create_refund',
      input: { order_id: '123', amount: '200.00' },
    }],
  };
  const cache = buildAgentPlanCacheRecord({
    instruction: plan.instruction,
    lastCustomerMessageId: message.id,
    settings: resolveAgentSettings(null),
    plan,
  });
  await db.thread.update({
    where: { id: threadId },
    data: { cachedPlanMessageId: message.id, cachedPlan: cache as object },
  });
  await createTestIntegration(org.id, {
    platform: ChannelType.shopify,
    externalAccountId: 'test-store.myshopify.com',
    accessToken: 'shpat_test',
  });
  vi.stubEnv('PLAN_EXECUTION_LEDGER_MODE', 'enforce');
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  await cleanupTestData(org?.id);
});

describe('executeOperatorApprovedCachedPlan (smoke)', () => {
  it('holds the thread lock and leaves an over-cap refund blocked in the operator conversation', async () => {
    const result = await executeOperatorApprovedCachedPlan({
      orgId: org.id,
      threadId,
      instruction: 'refund order #1001',
      clerkUserId: 'usr_op',
      // $200 refund exceeds the guarded-tier default cap ($50) the operator path runs on.
      approvedToolCalls: [{ id: 'tc_1', name: 'create_refund', input: { order_id: '123', amount: '200.00' } }],
    });

    // (1) Lock acquired for this thread and released once the turn completes.
    expect(acquireSpy).toHaveBeenCalledWith(threadId, { failClosed: true });
    expect(releaseSpy).toHaveBeenCalledTimes(1);

    // (2) The over-cap refund is blocked, not executed — Shopify is never touched.
    expect(result.actionsPerformed).toHaveLength(1);
    expect(result.actionsPerformed[0]).toMatchObject({ tool: 'create_refund', status: 'policy_block' });
    expect(result.summary).toContain('exceeds the workspace limit of $50');
    expect(fetchMock).not.toHaveBeenCalled();

    // The merchant is already the human: their operator thread remains active.
    const operatorThread = await db.thread.findUnique({ where: { id: threadId } });
    expect(operatorThread?.status).toBe('open');
    expect(operatorThread?.tag).not.toBe('needs_human');

    // (3) A correct AgentAction audit row is persisted for the escalated action.
    const rows = await db.agentAction.findMany({ where: { organizationId: org.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tool: 'create_refund',
      category: 'action',
      status: 'policy_block',
      mode: 'human_approved',
      threadId,
    });
    expect(rows[0].approverId).toContain('usr_op');
    expect(rows[0].executionId).not.toBeNull();

    const execution = await db.planExecution.findUniqueOrThrow({
      where: { id: rows[0].executionId! },
    });
    expect(execution.status).toBe('failed');
    expect(execution.lastError).toContain('exceeds the workspace limit of $50');

    // Nothing was actually refunded.
    const spend = await db.refundDailySpend.findFirst({ where: { organizationId: org.id } });
    expect(spend).toBeNull();
  });
});
