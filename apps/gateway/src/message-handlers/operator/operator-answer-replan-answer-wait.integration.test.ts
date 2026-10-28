import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { db } from '@shopkeeper/db';
import { createTestOrg, createTestIntegration, cleanupTestData } from '@shopkeeper/db/test-helpers';
import type { AgentPlan } from '@shopkeeper/agent/types';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { ANY_MEMBER_ACTOR_KEY } from '@shopkeeper/agent/task-ledger';
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
import { reconcileUnknownAgentAction } from '@shopkeeper/agent/unknown-outcome-reconciliation';
import { seedWaitingSupportTask, refundPlan } from '../../test-fixtures/operator-answer-replan-fixtures.js';

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

  it('ends the wait its answer was asked under and records the re-drafted card as a proposal', async () => {
    const { member, thread, taskId } = await seedWaitingSupportTask(org.id, { pending: true });
    planAgentSpy.mockResolvedValue(refundPlan());

    await applyOperatorAnswerReplan({
      organizationId: org.id,
      memberKey: `member:${member.id}`,
      clerkUserId: member.clerkUserId,
      threadId: thread.id,
      answer: 'Yes, refund it.',
      endsWait: 'question',
      deliveryRef: 'telegram:chat_9',
    });

    expect(planAgentSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.anything(),
      { runtimeVersion: 2, merchantInstruction: true, merchantContinuation: 'answer' },
    );

    const settled = await db.agentTask.findUniqueOrThrow({ where: { id: taskId } });
    expect(settled).toMatchObject({
      status: 'waiting_approval', claimToken: null,
      pendingQuestion: null, pendingAnswererKey: null,
    });
    // The card the merchant now holds is the proposal the task waits on, and
    // it is theirs to approve rather than the customer's.
    const cached = await db.thread.findUniqueOrThrow({
      where: { id: thread.id }, select: { cachedPlan: true },
    });
    const planId = (cached.cachedPlan as { planId?: string } | null)?.planId;
    expect(settled.activeProposalId).toBe(planId);
    expect(await db.agentProposal.findUniqueOrThrow({ where: { id: settled.activeProposalId! } }))
      .toMatchObject({ taskId, status: 'ready', approverScopeKey: ANY_MEMBER_ACTOR_KEY });
  });

  it.each([
    { providerOutcome: 'confirmed' as const },
    { providerOutcome: 'ambiguous' as const },
  ])('continues a return-label question through approval with a $providerOutcome provider outcome', async ({ providerOutcome }) => {
    const labelUrl = 'https://labels.example.com/return-1001.pdf';
    const shopifyCustomerId = '5000001001';
    const { member, thread, taskId } = await seedWaitingSupportTask(org.id, {
      pending: true,
      customerText: 'Please send me a label for my open return on order #1001.',
      objective: 'Attach the merchant-provided label to the open return for order #1001.',
      question: 'What return label URL should I use for order #1001?',
    });
    await db.thread.update({ where: { id: thread.id }, data: { shopifyCustomerId } });
    await createTestIntegration(org.id, {
      platform: 'shopify',
      externalAccountId: `test-store-${org.id}.myshopify.com`,
      accessToken: 'shpat_test',
      metadata: { oauthScopes: ['write_returns', 'read_orders'] },
    });
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
        const body = JSON.parse(String(init?.body ?? '{}')) as { query?: string };
        if (body.query?.includes('reverseDeliveryCreateWithShipping')) {
          if (providerOutcome === 'ambiguous') {
            return new Response(JSON.stringify({ errors: 'upstream timeout' }), { status: 503 });
          }
          return new Response(JSON.stringify({ data: {
            reverseDeliveryCreateWithShipping: {
              reverseDelivery: { id: 'gid://shopify/ReverseDelivery/501' }, userErrors: [],
            },
          } }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: { order: { returns: { edges: [{ node: {
          id: 'gid://shopify/Return/401', name: '#1001-R1', status: 'OPEN',
          reverseFulfillmentOrders: { edges: [{ node: { id: 'gid://shopify/ReverseFulfillmentOrder/301' } }] },
        } }] } } } }), { status: 200 });
      }
      throw new Error(`Unexpected provider request: ${url}`);
    });
    vi.stubGlobal('fetch', providerFetch);
    planAgentSpy.mockResolvedValue({
      instruction: 'Attach the return label for order #1001.',
      steps: [{
        id: 'label', tool: 'attach_return_label', category: 'action', enabled: true,
        label: 'Attach return label', description: 'Attach the approved label',
      }],
      rawToolCalls: [{
        id: 'label', name: 'attach_return_label', input: { order_id: '9000001001', label_url: labelUrl },
      }, {
        id: 'reply', name: 'send_reply', input: { text: `Your return label is ready: ${labelUrl}` },
      }],
      communication: {
        mode: 'exact_draft',
        destination: { kind: 'thread', id: thread.id, channel: thread.channelType },
        draft: `Your return label is ready: ${labelUrl}`,
        allowedResultBindings: [],
      },
      routingEvidence: { classifierState: 'not_applicable', codes: [] },
      validation: { status: 'valid', issues: [] },
      warnings: [],
    } satisfies AgentPlan);
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
          providerReference: 'provider-message-501',
          facts: {
            logicalResponseId: 'provider-message-501', messageId: 'provider-message-501',
            threadId: body.threadId, destination: { kind: 'thread', id: body.threadId },
            contentSha256: createHash('sha256').update(body.input.text).digest('hex'),
            deliveryState: 'sent', providerMessageId: 'provider-message-501',
          },
        },
      },
    }));

    await applyOperatorAnswerReplan({
      organizationId: org.id,
      memberKey: `member:${member.id}`,
      clerkUserId: member.clerkUserId,
      threadId: thread.id,
      answer: labelUrl,
      endsWait: 'question',
      deliveryRef: 'telegram:chat_9',
    });
    const parked = await db.agentTask.findUniqueOrThrow({ where: { id: taskId } });
    expect(parked).toMatchObject({ status: 'waiting_approval', activeProposalId: expect.any(String) });

    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings: resolveAgentSettings(null),
      executionIntent: 'merchant_approved',
      expectedIdentity: expectedPlanIdentity((await getContext(org.id, `member:${member.id}`)).pendingPlan!),
      failureRoute: 'test:return-label-continuation-host',
      approver: { clerkUserId: member.clerkUserId, displayName: 'Test Merchant' },
    }, buildGatewayPlanExecutionDeps());

    expect(executed.execution.status).toBe(providerOutcome === 'confirmed' ? 'committed' : 'unknown');
    const labelAction = await db.agentAction.findFirstOrThrow({
      where: { organizationId: org.id, taskId, tool: 'attach_return_label' },
    });
    expect(labelAction).toMatchObject(providerOutcome === 'confirmed' ? {
      proposalId: parked.activeProposalId, status: 'success', receiptVersion: 1,
      receipt: { outcome: 'succeeded', facts: {
        orderId: '9000001001', returnId: 'gid://shopify/Return/401',
        reverseDeliveryId: 'gid://shopify/ReverseDelivery/501', attachmentState: 'attached',
      } },
    } : {
      proposalId: parked.activeProposalId, status: 'unknown', receiptVersion: 1,
      receipt: { outcome: 'unknown', code: 'ambiguous_provider_response' },
    });
    expect(providerFetch.mock.calls.filter(([input]) =>
      String(input).includes('/graphql.json'))).toHaveLength(2);
    // The reply is the exact draft the card showed; no model writes it afterwards.
    expect(anthropicCreate).not.toHaveBeenCalled();
    if (providerOutcome === 'confirmed') {
      expect(postDashboardInternal).toHaveBeenCalledWith(
        '/api/agent/io-send-internal',
        expect.objectContaining({ agentTaskId: taskId, input: { text: `Your return label is ready: ${labelUrl}` } }),
        expect.anything(),
      );
    } else {
      expect(postDashboardInternal).not.toHaveBeenCalled();
      const handoff = await reconcileUnknownAgentAction({
        actionId: labelAction.id,
        organizationId: org.id,
        executionId: labelAction.executionId,
        providerOperationKey: labelAction.providerOperationKey,
        tool: labelAction.tool,
        input: labelAction.input,
        shopify: { shop: `test-store-${org.id}.myshopify.com`, accessToken: 'shpat_test' },
      });
      expect(handoff).toBe('still_unknown');
      expect(await db.agentAction.findUniqueOrThrow({ where: { id: labelAction.id } }))
        .toMatchObject({ status: 'unknown', dispatchState: 'unknown' });
      expect(providerFetch.mock.calls.filter(([, init]) =>
        String((init as RequestInit | undefined)?.body ?? '')
          .includes('reverseDeliveryCreateWithShipping'))).toHaveLength(1);
      expect(postDashboardInternal).not.toHaveBeenCalled();
    }
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: taskId } }))
      .toMatchObject({ status: providerOutcome === 'confirmed' ? 'completed' : 'reconciling' });
  });
});
