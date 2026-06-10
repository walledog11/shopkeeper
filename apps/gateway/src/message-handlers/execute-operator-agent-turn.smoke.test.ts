import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, ChannelType } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestIntegration,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';

// A4 gateway-operator smoke test (V1 launch scoping). Runs executeOperatorAgentTurn
// end-to-end against the real DB and the real agent core (executeAgentTurn ->
// runAgent -> tool executor -> static policy -> recordAgentActionsBatch), stubbing
// only the host seams a test cannot reach: the ioredis lock provider, the Clerk
// approver lookup, the billing write-gate, and Shopify's REST API.
//
// Asserts the three properties A4 calls for: (1) the thread lock is acquired and
// released around the turn, (2) a hard policy block escalates instead of executing
// (an over-cap refund is routed to a human, and Shopify is never called), and
// (3) the run writes a correct AgentAction audit row for the escalated action.
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

import { executeOperatorAgentTurn } from './execute-operator-agent-turn.js';

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
  await createTestIntegration(org.id, {
    platform: ChannelType.shopify,
    externalAccountId: 'test-store.myshopify.com',
    accessToken: 'shpat_test',
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  await cleanupTestData(org?.id);
});

describe('executeOperatorAgentTurn (smoke)', () => {
  it('holds the thread lock and escalates an over-cap refund instead of executing it', async () => {
    const result = await executeOperatorAgentTurn({
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

    // (2) The over-cap refund is escalated, not executed — Shopify is never touched.
    expect(result.actionsPerformed).toHaveLength(1);
    expect(result.actionsPerformed[0]).toMatchObject({ tool: 'create_refund', status: 'escalated' });
    expect(result.summary).toContain('exceeds the workspace limit of $50');
    expect(fetchMock).not.toHaveBeenCalled();

    // The escalation sink ran: the thread is routed to a human.
    const escalatedThread = await db.thread.findUnique({ where: { id: threadId } });
    expect(escalatedThread?.status).toBe('pending');
    expect(escalatedThread?.tag).toBe('needs_human');

    // (3) A correct AgentAction audit row is persisted for the escalated action.
    const rows = await db.agentAction.findMany({ where: { organizationId: org.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tool: 'create_refund',
      category: 'action',
      status: 'escalated',
      mode: 'human_approved',
      threadId,
    });
    expect(rows[0].approverId).toContain('usr_op');

    // Nothing was actually refunded.
    const spend = await db.refundDailySpend.findFirst({ where: { organizationId: org.id } });
    expect(spend).toBeNull();
  });
});
