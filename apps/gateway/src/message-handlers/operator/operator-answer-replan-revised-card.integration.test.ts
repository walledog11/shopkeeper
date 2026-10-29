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
import { seedCardedSupportTask, refundPlan, actionPlan, withExactReply } from '../../test-fixtures/operator-answer-replan-fixtures.js';

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

  it('continues the task the card it revised was parked on', async () => {
    const { member, thread, taskId, proposalId } = await seedCardedSupportTask(org.id);
    planAgentSpy.mockResolvedValue({
      ...refundPlan(),
      rawToolCalls: [{ id: 'send_1', name: 'send_reply', input: { text: 'Refunded — sorry about that.' } }],
    });

    await applyOperatorAnswerReplan({
      organizationId: org.id,
      memberKey: `member:${member.id}`,
      clerkUserId: member.clerkUserId,
      threadId: thread.id,
      answer: 'Make it warmer and mention the delay.',
      endsWait: 'proposal',
      deliveryRef: 'telegram:chat_9',
    });

    // One task, advanced — not a second one beside it, and not left parked on
    // the card the merchant just replaced.
    expect(await db.agentProposal.findUniqueOrThrow({ where: { id: proposalId } }))
      .toMatchObject({ status: 'superseded' });
    const settled = await db.agentTask.findUniqueOrThrow({ where: { id: taskId } });
    expect(settled).toMatchObject({ status: 'waiting_approval', claimToken: null });
    expect(settled.activeProposalId).not.toBe(proposalId);
    const cached = await db.thread.findUniqueOrThrow({
      where: { id: thread.id }, select: { cachedPlan: true },
    });
    // The new card names the new proposal, which is what stops the approval
    // that follows from falling back to the path that predates them.
    expect(settled.activeProposalId).toBe((cached.cachedPlan as { planId?: string }).planId);
    expect(await db.agentTask.count({ where: { threadId: thread.id } })).toBe(1);
  });

  it.each([
    {
      capability: 'return',
      tool: 'create_return' as const,
      originalInput: { order_id: '9000001001', variant_id: '8001', reason: 'unwanted' },
      revisedInput: { order_id: '9000001001', variant_id: '8003', reason: 'defective' },
      guidance: 'Return the red shirt instead because it is defective.',
    },
    {
      capability: 'exchange',
      tool: 'create_exchange' as const,
      originalInput: {
        order_id: '9000001001', variant_id: '8001', exchange_variant_id: '8002', quantity: 1,
      },
      revisedInput: {
        order_id: '9000001001', variant_id: '8003', exchange_variant_id: '8004', quantity: 1,
      },
      guidance: 'Exchange the red shirt for the extra-large variant instead.',
    },
  ])('executes only the revised $capability inputs after the replacement card is approved', async ({
    capability, tool, originalInput, revisedInput, guidance,
  }) => {
    const objective = `${capability === 'return' ? 'Return' : 'Exchange'} an item from order #1001.`;
    const shopifyCustomerId = '5000001001';
    const originalPlan = actionPlan(objective, tool, originalInput);
    const revisedPlan = actionPlan(objective, tool, revisedInput);
    const { member, thread, taskId, proposalId: originalProposalId } = await seedCardedSupportTask(org.id, {
      customerText: `Please ${capability} the black shirt from order #1001.`,
      objective,
      plan: originalPlan,
      shopifyCustomerId,
    });
    await createTestIntegration(org.id, {
      platform: 'shopify',
      externalAccountId: `test-store-${org.id}.myshopify.com`,
      accessToken: 'shpat_test',
      metadata: { oauthScopes: ['write_returns', 'read_orders', 'read_products'] },
    });

    const mutationInputs: Record<string, unknown>[] = [];
    const providerFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/orders/9000001001.json')) {
        return new Response(JSON.stringify({ order: {
          id: '9000001001', customer: { id: shopifyCustomerId },
        } }), { status: 200 });
      }
      if (url.includes('/orders.json')) {
        return new Response(JSON.stringify({ orders: [] }), { status: 200 });
      }
      if (url.includes('/graphql.json')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          query?: string;
          variables?: { returnInput?: Record<string, unknown> };
        };
        if (body.query?.includes('query returnableFulfillments')) {
          return new Response(JSON.stringify({ data: {
            order: { id: 'gid://shopify/Order/9000001001' },
            returnableFulfillments: { edges: [{ node: { returnableFulfillmentLineItems: {
              edges: [{ node: {
                quantity: 1,
                fulfillmentLineItem: {
                  id: 'gid://shopify/FulfillmentLineItem/7003',
                  lineItem: {
                    name: 'Red shirt', variant: { id: 'gid://shopify/ProductVariant/8003' },
                  },
                },
              } }],
            } } }] },
          } }), { status: 200 });
        }
        if (body.query?.includes('query variantPrices')) {
          return new Response(JSON.stringify({ data: { nodes: [
            {
              id: 'gid://shopify/ProductVariant/8003', price: '42.00', title: 'Red / Medium',
              product: { title: 'Shirt' },
            },
            {
              id: 'gid://shopify/ProductVariant/8004', price: '42.00', title: 'Red / Extra Large',
              product: { title: 'Shirt' },
            },
          ] } }), { status: 200 });
        }
        if (body.query?.includes('mutation returnCreate')) {
          mutationInputs.push(body.variables?.returnInput ?? {});
          return new Response(JSON.stringify({ data: { returnCreate: {
            return: {
              id: `gid://shopify/Return/${tool === 'create_return' ? '9101' : '9102'}`,
              name: tool === 'create_return' ? '#1001-R1' : '#1001-R2',
              status: 'REQUESTED',
            },
            userErrors: [],
          } } }), { status: 200 });
        }
      }
      throw new Error(`Unexpected provider request: ${url}`);
    });
    vi.stubGlobal('fetch', providerFetch);
    planAgentSpy.mockImplementation(withExactReply(revisedPlan, `The revised ${capability} for order #1001 is open.`));
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
          providerReference: `provider-message-${capability}`,
          facts: {
            logicalResponseId: `provider-message-${capability}`,
            messageId: `provider-message-${capability}`,
            threadId: body.threadId, destination: { kind: 'thread', id: body.threadId },
            contentSha256: createHash('sha256').update(body.input.text).digest('hex'),
            deliveryState: 'sent', providerMessageId: `provider-message-${capability}`,
          },
        },
      },
    }));

    await applyOperatorAnswerReplan({
      organizationId: org.id,
      memberKey: `member:${member.id}`,
      clerkUserId: member.clerkUserId,
      threadId: thread.id,
      answer: guidance,
      endsWait: 'proposal',
      deliveryRef: 'telegram:chat_9',
    });

    expect(await db.agentProposal.findUniqueOrThrow({ where: { id: originalProposalId } }))
      .toMatchObject({ status: 'superseded' });
    const revisedTask = await db.agentTask.findUniqueOrThrow({ where: { id: taskId } });
    expect(revisedTask).toMatchObject({
      status: 'waiting_approval', revision: 1, activeProposalId: expect.any(String),
    });
    expect(revisedTask.activeProposalId).not.toBe(originalProposalId);

    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings: resolveAgentSettings(null),
      executionIntent: 'merchant_approved',
      expectedIdentity: expectedPlanIdentity((await getContext(org.id, `member:${member.id}`)).pendingPlan!),
      failureRoute: `test:revised-${capability}-host`,
      approver: { clerkUserId: member.clerkUserId, displayName: 'Test Merchant' },
    }, buildGatewayPlanExecutionDeps());

    expect(executed.execution.status).toBe('committed');
    expect(mutationInputs).toHaveLength(1);
    expect(mutationInputs[0]).toMatchObject({
      returnLineItems: [{
        fulfillmentLineItemId: 'gid://shopify/FulfillmentLineItem/7003', quantity: 1,
      }],
      ...(tool === 'create_exchange' ? {
        exchangeLineItems: [{ variantId: 'gid://shopify/ProductVariant/8004', quantity: 1 }],
      } : {}),
    });
    const action = await db.agentAction.findFirstOrThrow({
      where: { organizationId: org.id, taskId, tool },
    });
    expect(action).toMatchObject({
      proposalId: revisedTask.activeProposalId,
      status: 'success', dispatchState: 'settled', receiptVersion: 1,
    });
    expect(await db.agentAction.count({ where: { organizationId: org.id, taskId, tool } })).toBe(1);
    expect(postDashboardInternal).toHaveBeenCalledWith(
      '/api/agent/io-send-internal',
      expect.objectContaining({ agentTaskId: taskId }),
      expect.anything(),
    );
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: taskId } }))
      .toMatchObject({ status: 'completed' });
  });

  it('leaves the card parked when the guidance comes from outside the organization', async () => {
    const { thread, taskId, proposalId } = await seedCardedSupportTask(org.id);
    const outsiderOrg = await createTestOrg();
    const outsider = await db.orgMember.create({
      data: { organizationId: outsiderOrg.id, clerkUserId: randomUUID() },
    });
    planAgentSpy.mockResolvedValue(refundPlan());

    await expect(applyOperatorAnswerReplan({
      organizationId: org.id,
      memberKey: MEMBER_KEY,
      clerkUserId: outsider.clerkUserId,
      threadId: thread.id,
      answer: 'Make it warmer.',
      endsWait: 'proposal',
    })).rejects.toThrow('membership');

    expect(await db.agentTask.findUniqueOrThrow({ where: { id: taskId } }))
      .toMatchObject({ status: 'waiting_approval', activeProposalId: proposalId });
    expect((await db.agentProposal.findUniqueOrThrow({ where: { id: proposalId } })).status)
      .toBe('ready');
    await cleanupTestData(outsiderOrg.id);
  });
});
