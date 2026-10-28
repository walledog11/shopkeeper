import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { db } from '@shopkeeper/db';
import { createTestOrg, createTestIntegration, cleanupTestData } from '@shopkeeper/db/test-helpers';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { randomUUID } from 'node:crypto';

const { planAgentSpy, sendOperatorPlanNotificationSpy, anthropicCreate, postDashboardInternal, listBindings, notifyOperator } = vi.hoisted(() => ({
  planAgentSpy: vi.fn(),
  sendOperatorPlanNotificationSpy: vi.fn(),
  anthropicCreate: vi.fn(),
  postDashboardInternal: vi.fn(),
  listBindings: vi.fn(),
  notifyOperator: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: anthropicCreate };
  },
}));

vi.mock('../../clients/agent-runtime.js', () => ({
  getGatewayLockProvider: () => ({
    acquire: vi.fn(async () => ({ isLost: () => false, release: vi.fn(async () => {}) })),
  }),
}));

vi.mock('../../clients/dashboard-internal.js', () => ({ postDashboardInternal }));

vi.mock('@shopkeeper/agent/planner', async (importOriginal) => ({
  ...await importOriginal<typeof import('@shopkeeper/agent/planner')>(),
  planAgent: planAgentSpy,
}));

vi.mock('../support-plan/planning-notifications.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../support-plan/planning-notifications.js')>();
  return {
    ...actual,
    sendOperatorPlanNotification: sendOperatorPlanNotificationSpy,
  };
});

vi.mock('../../operator-notify.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../operator-notify.js')>(),
  listOperatorBindings: listBindings,
  notifyOperator,
}));

import { applyOperatorAnswerReplan } from './operator-answer-replan.js';
import { expectedPlanIdentity, getContext } from '../../operator-context.js';
import { executeCurrentCachedHomePlan } from '@shopkeeper/agent/plan-execution';
import { buildGatewayPlanExecutionDeps } from './agent-turn-deps.js';
import { seedCardedSupportTask, actionPlan, withExactReply } from '../../test-fixtures/operator-answer-replan-fixtures.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;
// Operator state is keyed to the person, so every transport in these cases writes
// and reads this one queue.
const MEMBER_KEY = `member:${randomUUID()}`;
// The authenticated member is backed by a current organization membership.
const CLERK_USER_ID = 'user_operator_answer_replan';

beforeEach(async () => {
  org = await createTestOrg();
  await db.orgMember.create({ data: { id: MEMBER_KEY.slice("member:".length), organizationId: org.id, clerkUserId: CLERK_USER_ID } });
  planAgentSpy.mockReset();
  listBindings.mockReset();
  listBindings.mockResolvedValue([]);
  notifyOperator.mockReset();
  anthropicCreate.mockReset();
  postDashboardInternal.mockReset();
  sendOperatorPlanNotificationSpy.mockReset();
  sendOperatorPlanNotificationSpy.mockResolvedValue(undefined);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await db.operatorContext.deleteMany({ where: { organizationId: org.id } }).catch(() => undefined);
  await cleanupTestData(org?.id);
});

describe('applyOperatorAnswerReplan durable continuation', () => {

  it.each([
    { capability: 'profile', tool: 'update_shopify_customer_info' as const },
    { capability: 'note', tool: 'add_shopify_customer_note' as const },
  ].flatMap(capability => [
    { ...capability, scenario: 'confirmed' as const },
    { ...capability, scenario: 'unknown' as const },
    { ...capability, scenario: 'revoked grant' as const },
    { ...capability, scenario: 'changed identity' as const },
  ]))('handles a claimed customer $capability action with $scenario', async ({
    capability, tool, scenario,
  }) => {
    const customerId = '1234';
    const actionInput = tool === 'update_shopify_customer_info'
      ? { customer_id: customerId, email: 'jane.new@example.com', phone: '+15551234567' }
      : { customer_id: customerId, note: 'Merchant requested a priority follow-up.' };
    const objective = tool === 'update_shopify_customer_info'
      ? 'Update the linked customer email and phone.'
      : 'Add the requested note to the linked Shopify customer.';
    const plan = actionPlan(objective, tool, actionInput);
    const { member, thread, taskId } = await seedCardedSupportTask(org.id, {
      customerText: objective,
      objective,
      plan,
      shopifyCustomerId: customerId,
    });
    const integration = await createTestIntegration(org.id, {
      platform: 'shopify',
      externalAccountId: `test-store-${org.id}.myshopify.com`,
      accessToken: 'shpat_test',
      metadata: { oauthScopes: ['read_customers', 'write_customers', 'read_orders'] },
    });

    let mutationCalls = 0;
    const originalCustomer = {
      id: 1234, first_name: 'Jane', last_name: 'Doe', email: 'jane@example.com',
      phone: '+15550000000', note: 'Existing note', orders_count: 1, total_spent: '42.00',
      default_address: null,
    };
    const providerFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/orders.json')) {
        return new Response(JSON.stringify({ orders: [] }), { status: 200 });
      }
      if (url.includes(`/customers/${customerId}.json`) && method === 'GET') {
        return new Response(JSON.stringify({ customer: originalCustomer }), { status: 200 });
      }
      if (url.includes(`/customers/${customerId}.json`) && method === 'PUT') {
        mutationCalls += 1;
        if (scenario === 'unknown') {
          return new Response(JSON.stringify({ errors: 'upstream timeout' }), { status: 503 });
        }
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          customer?: Record<string, unknown>;
        };
        return new Response(JSON.stringify({
          customer: { ...originalCustomer, ...body.customer },
        }), { status: 200 });
      }
      throw new Error(`Unexpected provider request: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', providerFetch);
    planAgentSpy.mockImplementation(withExactReply(plan, capability === 'profile'
      ? 'Your contact details have been updated.'
      : 'I added that note to your customer record.'));
    postDashboardInternal.mockImplementation(async (_path: string, body: {
      operationId: string; executionId: string; threadId: string; input: { text: string };
    }) => ({
      ok: true,
      data: {
        status: 'ok', message: 'Reply accepted.',
        receipt: {
          version: 1, operationId: body.operationId, executionId: body.executionId,
          tool: 'send_reply', target: { kind: 'thread', id: body.threadId },
          observedAt: new Date().toISOString(), outcome: 'succeeded',
          providerReference: `provider-message-${capability}-${scenario}`,
          facts: {
            logicalResponseId: `provider-message-${capability}-${scenario}`,
            messageId: `provider-message-${capability}-${scenario}`,
            threadId: body.threadId, destination: { kind: 'thread', id: body.threadId },
            contentSha256: createHash('sha256').update(body.input.text).digest('hex'),
            deliveryState: 'sent', providerMessageId: `provider-message-${capability}-${scenario}`,
          },
        },
      },
    }));

    await applyOperatorAnswerReplan({
      organizationId: org.id,
      memberKey: `member:${member.id}`,
      clerkUserId: member.clerkUserId,
      threadId: thread.id,
      answer: `Keep this exact ${capability} change.`,
      endsWait: 'proposal',
      deliveryRef: 'telegram:chat_9',
    });
    const parked = await db.agentTask.findUniqueOrThrow({ where: { id: taskId } });
    expect(parked).toMatchObject({ status: 'waiting_approval', activeProposalId: expect.any(String) });

    if (scenario === 'revoked grant') {
      await db.integration.update({
        where: { id: integration.id },
        data: { metadata: { oauthScopes: ['read_customers', 'read_orders'] } },
      });
    } else if (scenario === 'changed identity') {
      await db.thread.update({
        where: { id: thread.id },
        data: { shopifyCustomerId: '9999' },
      });
    }

    const executionDeps = buildGatewayPlanExecutionDeps();
    if (scenario === 'changed identity') {
      const buildContext = executionDeps.buildContext;
      executionDeps.buildContext = async (...args) => {
        const context = await buildContext(...args);
        expect(context.thread.shopifyCustomerId).toBe('9999');
        return context;
      };
    }
    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings: resolveAgentSettings(null),
      executionIntent: 'merchant_approved',
      expectedIdentity: expectedPlanIdentity((await getContext(org.id, `member:${member.id}`)).pendingPlan!),
      failureRoute: `test:customer-${capability}-${scenario}`,
      approver: { clerkUserId: member.clerkUserId, displayName: 'Test Merchant' },
    }, executionDeps);

    const action = await db.agentAction.findFirstOrThrow({
      where: { organizationId: org.id, taskId, tool },
    });
    if (scenario === 'confirmed') {
      expect(executed.execution.status).toBe('committed');
      expect(mutationCalls).toBe(1);
      expect(action).toMatchObject({
        proposalId: parked.activeProposalId,
        status: 'success', dispatchState: 'settled', receiptVersion: 1,
        receipt: tool === 'update_shopify_customer_info'
          ? { outcome: 'succeeded', facts: {
              customerId,
              updates: [
                { field: 'email', value: 'jane.new@example.com' },
                { field: 'phone', value: '+15551234567' },
              ],
            } }
          : { outcome: 'succeeded', facts: {
              customerId, appendState: 'appended', resultingNoteLength: expect.any(Number),
            } },
      });
      expect(postDashboardInternal).toHaveBeenCalledWith(
        '/api/agent/io-send-internal',
        expect.objectContaining({ agentTaskId: taskId }),
        expect.anything(),
      );
      expect(await db.agentTask.findUniqueOrThrow({ where: { id: taskId } }))
        .toMatchObject({ status: 'completed' });
    } else if (scenario === 'unknown') {
      expect(executed.execution.status).toBe('unknown');
      expect(mutationCalls).toBe(1);
      expect(action).toMatchObject({
        proposalId: parked.activeProposalId,
        status: 'unknown', dispatchState: 'unknown', receiptVersion: 1,
        receipt: { outcome: 'unknown' },
      });
      expect(postDashboardInternal).not.toHaveBeenCalled();
      expect(await db.agentTask.findUniqueOrThrow({ where: { id: taskId } }))
        .toMatchObject({ status: 'reconciling' });
    } else {
      expect(mutationCalls).toBe(0);
      expect(action).toMatchObject({
        proposalId: parked.activeProposalId, status: 'policy_block', dispatchState: 'settled',
      });
      expect(action.output).toContain(scenario === 'revoked grant' ? 'write_customers' : 'linked');
      expect(postDashboardInternal).not.toHaveBeenCalled();
    }
  });
});
