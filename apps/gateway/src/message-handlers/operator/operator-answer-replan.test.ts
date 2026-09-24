import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { db, SenderType } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestIntegration,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';
import type { AgentPlan } from '@shopkeeper/agent/types';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import {
  ANY_MEMBER_ACTOR_KEY, acceptCustomerAgentRequest, claimAgentTask, settleAgentTaskClaim,
} from '@shopkeeper/agent/task-ledger';
import { randomUUID } from 'node:crypto';

const { planAgentSpy, sendOperatorPlanNotificationSpy, anthropicCreate, postDashboardInternal } = vi.hoisted(() => ({
  planAgentSpy: vi.fn(),
  sendOperatorPlanNotificationSpy: vi.fn(),
  anthropicCreate: vi.fn(),
  postDashboardInternal: vi.fn(),
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

import { applyOperatorAnswerReplan } from './operator-answer-replan.js';
import { getContext, updateContext } from '../../operator-context.js';
import { executeCurrentCachedHomePlan } from '@shopkeeper/agent/plan-execution';
import { buildGatewayPlanExecutionDeps } from './agent-turn-deps.js';
import { reconcileUnknownAgentAction } from '@shopkeeper/agent/unknown-outcome-reconciliation';

let org!: Awaited<ReturnType<typeof createTestOrg>>;
// Operator state is keyed to the person, so every transport in these cases writes
// and reads this one queue.
const MEMBER_KEY = 'member:00000000-0000-4000-8000-0000000000aa';
// No OrgMember row backs it in these cases, so the durable continuation finds
// no actor and the re-plan runs untracked — which is what they already asserted.
const CLERK_USER_ID = 'user_operator_answer_replan';

beforeEach(async () => {
  org = await createTestOrg();
  planAgentSpy.mockReset();
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

describe('applyOperatorAnswerReplan', () => {
  it('records the answer + KB article and clears state when the ticket was already handled', async () => {
    const customer = await createTestCustomer(org.id, 'cust@example.com', { name: 'Jane Doe' });
    const thread = await createTestThread(org.id, customer.id, 'email', { tag: 'Support' });
    const custMsg = await createTestMessage(thread.id, 'Do you ship to Canada?', SenderType.customer);
    // An agent reply is the latest conversation message — so there is no pending
    // customer message and the re-plan (LLM) path is skipped.
    await createTestMessage(thread.id, 'Thanks for reaching out!', SenderType.agent);

    const cacheRecord = buildAgentPlanCacheRecord({
      instruction: 'Handle shipping question',
      lastCustomerMessageId: custMsg.id,
      settings: resolveAgentSettings(null),
      plan: {
        instruction: 'Handle shipping question',
        steps: [{
          id: 'tc1',
          category: 'internal',
          tool: 'ask_operator',
          label: 'Ask the merchant',
          description: 'Ask whether we ship to Canada',
          enabled: true,
        }],
        rawToolCalls: [{ id: 'tc1', name: 'ask_operator', input: { question: 'Do we ship to Canada?' } }],
        warnings: [],
      },
    });
    await db.thread.update({
      where: { id: thread.id },
      data: { cachedPlan: cacheRecord as object, cachedPlanMessageId: custMsg.id },
    });

    const message = await applyOperatorAnswerReplan({
      organizationId: org.id,
      memberKey: MEMBER_KEY,
      clerkUserId: CLERK_USER_ID,
      threadId: thread.id,
      answer: 'Yes, $15 flat to Canada.',
      endsWait: 'question',
      deliveryRef: 'telegram:chat_1',
    });

    expect(message).toContain('already handled');
    expect(planAgentSpy).not.toHaveBeenCalled();

    // The stale plan cache is cleared.
    const refreshed = await db.thread.findUnique({
      where: { id: thread.id },
      select: { cachedPlan: true, cachedPlanMessageId: true },
    });
    expect(refreshed?.cachedPlan).toBeNull();
    expect(refreshed?.cachedPlanMessageId).toBeNull();

    // The answer is captured as a Q/A note and a reusable KB article.
    const note = await db.message.findFirst({
      where: { threadId: thread.id, senderType: SenderType.note },
    });
    expect(note?.contentText).toContain('Q: Do we ship to Canada?');
    expect(note?.contentText).toContain('A: Yes, $15 flat to Canada.');

    const article = await db.kbArticle.findFirst({ where: { organizationId: org.id } });
    expect(article?.title).toBe('International shipping');
    expect(article?.body).toContain('Q: Do we ship to Canada?');
    expect(article?.body).toContain('A: Yes, $15 flat to Canada.');
    expect(article?.tags).toEqual(['agent-learned', 'shipping']);
  });

  it('re-plans, parks the draft, and fans the card out to the other operator channels', async () => {
    const customer = await createTestCustomer(org.id, 'cust@example.com', { name: 'Jane Doe' });
    const thread = await createTestThread(org.id, customer.id, 'email', { tag: 'Support' });
    const custMsg = await createTestMessage(thread.id, 'Do you ship to Canada?', SenderType.customer);

    const cacheRecord = buildAgentPlanCacheRecord({
      instruction: 'Handle shipping question',
      lastCustomerMessageId: custMsg.id,
      settings: resolveAgentSettings(null),
      plan: {
        instruction: 'Handle shipping question',
        steps: [{
          id: 'tc1',
          category: 'internal',
          tool: 'ask_operator',
          label: 'Ask the merchant',
          description: 'Ask whether we ship to Canada',
          enabled: true,
        }],
        rawToolCalls: [{ id: 'tc1', name: 'ask_operator', input: { question: 'Do we ship to Canada?' } }],
        warnings: [],
      },
    });
    await db.thread.update({
      where: { id: thread.id },
      data: { cachedPlan: cacheRecord as object, cachedPlanMessageId: custMsg.id, aiSummary: 'Shipping to Canada', requestSummary: 'Shipping to Canada' },
    });

    const replannedPlan = {
      instruction: 'Shipping to Canada',
      steps: [{
        id: 'tc_reply',
        category: 'write',
        tool: 'send_reply',
        label: 'Reply to customer',
        description: '"Yes, we ship to Canada for $15 flat."',
        enabled: true,
      }],
      rawToolCalls: [{ id: 'tc_reply', name: 'send_reply', input: { text: 'Yes, we ship to Canada for $15 flat.' } }],
      warnings: [],
    };
    planAgentSpy.mockResolvedValue(replannedPlan);

    const message = await applyOperatorAnswerReplan({
      organizationId: org.id,
      memberKey: MEMBER_KEY,
      clerkUserId: CLERK_USER_ID,
      threadId: thread.id,
      answer: 'Yes, $15 flat to Canada.',
      endsWait: 'question',
      deliveryRef: 'imessage:chat_2',
    });

    // The return is a model-facing draft summary carrying the concrete draft, not
    // the operator yes/no card.
    expect(message).toContain('Re-drafted');
    expect(message).toContain('Yes, we ship to Canada for $15 flat.');
    expect(message).not.toContain('Reply "yes" to send');
    expect(planAgentSpy).toHaveBeenCalledTimes(1);

    // The answering device is excluded from the fan-out, so the turn must park the
    // display fields itself or a later "no" here loses the named dismissal.
    const updatedCtx = await getContext(org.id, MEMBER_KEY);
    expect(updatedCtx.pendingPlan).toMatchObject({
      threadId: thread.id,
      instruction: 'Shipping to Canada',
      customerName: 'Jane Doe',
      actionLabel: 'reply to Jane',
    });

    // The operator card still fans out to the merchant's other bound channels.
    expect(sendOperatorPlanNotificationSpy).toHaveBeenCalledWith(
      org.id,
      thread.id,
      'Jane Doe',
      'email',
      'Shipping to Canada',
      expect.objectContaining({
        rawToolCalls: [{ id: 'tc_reply', name: 'send_reply', input: { text: 'Yes, we ship to Canada for $15 flat.' } }],
      }),
      'Shipping to Canada',
      expect.objectContaining({ exclude: { channel: 'imessage', deliveryKey: 'chat_2' } }),
    );
  });

  describe('durable continuation', () => {
    const budget = {
      runtimeVersion: 2, modelCallLimit: 20, activeTimeMsLimit: 300000,
      spendNanoUsdLimit: 1000000000n,
    };

    // A support conversation waiting on the merchant, the way the inbound
    // planning job leaves one: the customer's message is an accepted request on
    // a task parked with a question any bound member may answer.
    async function seedWaitingSupportTask(options: {
      pending: boolean;
      customerText?: string;
      objective?: string;
      question?: string;
    }) {
      const member = await db.orgMember.create({
        data: { organizationId: org.id, clerkUserId: randomUUID() },
      });
      const customer = await createTestCustomer(org.id, 'cust@example.com', { name: 'Jane Doe' });
      const thread = await createTestThread(org.id, customer.id, 'email', { tag: 'Support' });
      const custMsg = await createTestMessage(
        thread.id, options.customerText ?? 'Can I get a refund?', SenderType.customer,
      );
      if (!options.pending) {
        await createTestMessage(thread.id, 'Looking into it!', SenderType.agent);
      }
      await db.thread.update({
        where: { id: thread.id },
        data: {
          cachedPlanMessageId: custMsg.id,
          aiSummary: 'Refund request',
          requestSummary: options.objective ?? 'Refund request',
        },
      });
      const { request, task } = await acceptCustomerAgentRequest({
        organizationId: org.id, threadId: thread.id, sourceMessageId: custMsg.id,
        objective: options.objective ?? 'Refund request', budget,
      });
      const claim = await claimAgentTask({
        organizationId: org.id, taskId: task.id, expectedRevision: task.revision,
      });
      await settleAgentTaskClaim({
        organizationId: org.id, taskId: task.id, expectedRevision: task.revision,
        claimToken: claim!.claimToken, requestId: request.id,
        settlement: {
          status: 'waiting_input', question: options.question ?? 'Is this one within policy?',
          answerer: { kind: 'member', key: ANY_MEMBER_ACTOR_KEY },
        },
      });
      return { member, thread, custMsg, taskId: task.id };
    }

    function refundPlan(): AgentPlan {
      return {
        instruction: 'Refund request',
        steps: [
          {
            id: 'refund_1', tool: 'create_refund', label: 'Refund',
            description: 'Issue the refund', category: 'action', enabled: true,
          },
          {
            id: 'send_1', tool: 'send_reply', label: 'Reply',
            description: 'Tell the customer', category: 'communication', enabled: true,
          },
        ],
        rawToolCalls: [
          { id: 'refund_1', name: 'create_refund', input: { order_id: 'gid://shopify/Order/1', amount: '10.00', currency: 'USD' } },
          { id: 'send_1', name: 'send_reply', input: { text: "You're all set." } },
        ],
        routingEvidence: { classifierState: 'not_applicable', codes: [] },
        validation: { status: 'valid', issues: [] },
        warnings: [],
      };
    }

    // The same conversation waiting on a *card* rather than a question: the
    // attempt parked a proposal any bound member may approve, which is what the
    // merchant's revision guidance supersedes.
    async function seedCardedSupportTask(options?: {
      customerText?: string;
      objective?: string;
      plan?: AgentPlan;
      shopifyCustomerId?: string;
    }) {
      const objective = options?.objective ?? 'Refund request';
      const plan = options?.plan ?? refundPlan();
      const member = await db.orgMember.create({
        data: { organizationId: org.id, clerkUserId: randomUUID() },
      });
      const customer = await createTestCustomer(org.id, 'cust@example.com', { name: 'Jane Doe' });
      const thread = await createTestThread(org.id, customer.id, 'email', {
        tag: 'Support',
        ...(options?.shopifyCustomerId ? { shopifyCustomerId: options.shopifyCustomerId } : {}),
      });
      const custMsg = await createTestMessage(
        thread.id,
        options?.customerText ?? 'Can I get a refund?',
        SenderType.customer,
      );
      const cacheRecord = buildAgentPlanCacheRecord({
        instruction: objective,
        lastCustomerMessageId: custMsg.id,
        settings: resolveAgentSettings(null),
        plan,
      });
      await db.thread.update({
        where: { id: thread.id },
        data: {
          cachedPlan: cacheRecord as object,
          cachedPlanMessageId: custMsg.id,
          aiSummary: objective,
          requestSummary: objective,
        },
      });
      const { request, task } = await acceptCustomerAgentRequest({
        organizationId: org.id, threadId: thread.id, sourceMessageId: custMsg.id,
        objective, budget,
      });
      const claim = await claimAgentTask({
        organizationId: org.id, taskId: task.id, expectedRevision: task.revision,
      });
      await settleAgentTaskClaim({
        organizationId: org.id, taskId: task.id, expectedRevision: task.revision,
        claimToken: claim!.claimToken, requestId: request.id,
        settlement: {
          status: 'waiting_approval',
          proposal: {
            proposalId: cacheRecord.planId!,
            instruction: objective,
            rawToolCalls: plan.rawToolCalls,
            sourceRequestIds: [request.id],
          },
          approver: { kind: 'member', key: ANY_MEMBER_ACTOR_KEY },
        },
      });
      return { member, thread, taskId: task.id, proposalId: cacheRecord.planId! };
    }

    function actionPlan(
      instruction: string,
      tool: 'create_return' | 'create_exchange' | 'update_shopify_customer_info' | 'add_shopify_customer_note',
      input: Record<string, unknown>,
    ): AgentPlan {
      return {
        instruction,
        steps: [{
          id: 'action_1', tool,
          label: tool === 'create_return'
            ? 'Open return'
            : tool === 'create_exchange'
              ? 'Open exchange'
              : tool === 'update_shopify_customer_info'
                ? 'Update customer info'
                : 'Add customer note',
          description: instruction, category: 'action', enabled: true,
        }],
        rawToolCalls: [{ id: 'action_1', name: tool, input }],
        suspendedAtProposal: true,
        routingEvidence: { classifierState: 'not_applicable', codes: [] },
        validation: { status: 'valid', issues: [] },
        warnings: [],
      };
    }

    it('continues the task the card it revised was parked on', async () => {
      const { member, thread, taskId, proposalId } = await seedCardedSupportTask();
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
      const originalPlan = actionPlan(objective, tool, originalInput);
      const revisedPlan = actionPlan(objective, tool, revisedInput);
      const { member, thread, taskId, proposalId: originalProposalId } = await seedCardedSupportTask({
        customerText: `Please ${capability} the black shirt from order #1001.`,
        objective,
        plan: originalPlan,
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
      planAgentSpy.mockResolvedValue(revisedPlan);
      anthropicCreate.mockResolvedValue({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'reply', name: 'send_reply', input: {
          text: `The revised ${capability} for order #1001 is open.`,
        } }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });
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
      const { member, thread, taskId } = await seedCardedSupportTask({
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
      planAgentSpy.mockResolvedValue(plan);
      anthropicCreate.mockResolvedValue({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'reply', name: 'send_reply', input: {
          text: capability === 'profile'
            ? 'Your contact details have been updated.'
            : 'I added that note to your customer record.',
        } }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });
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

    it('leaves the card parked when the guidance comes from outside the organization', async () => {
      const { thread, taskId, proposalId } = await seedCardedSupportTask();
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

    it('ends the wait its answer was asked under and records the re-drafted card as a proposal', async () => {
      const { member, thread, taskId } = await seedWaitingSupportTask({ pending: true });
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
        { runtimeVersion: 2, suspendAtProposal: true },
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
      const { member, thread, taskId } = await seedWaitingSupportTask({
        pending: true,
        customerText: 'Please send me a label for my open return on order #1001.',
        objective: 'Attach the merchant-provided label to the open return for order #1001.',
        question: 'What return label URL should I use for order #1001?',
      });
      await createTestIntegration(org.id, {
        platform: 'shopify',
        externalAccountId: `test-store-${org.id}.myshopify.com`,
        accessToken: 'shpat_test',
        metadata: { oauthScopes: ['write_returns', 'read_orders'] },
      });
      const providerFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
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
        }],
        suspendedAtProposal: true,
        routingEvidence: { classifierState: 'not_applicable', codes: [] },
        validation: { status: 'valid', issues: [] },
        warnings: [],
      } satisfies AgentPlan);
      anthropicCreate.mockResolvedValue({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'reply', name: 'send_reply', input: {
          text: `Your return label is ready: ${labelUrl}`,
        } }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });
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

    it('closes the task when the ticket was already handled', async () => {
      const { member, thread, taskId } = await seedWaitingSupportTask({ pending: false });

      await applyOperatorAnswerReplan({
        organizationId: org.id,
        memberKey: `member:${member.id}`,
        clerkUserId: member.clerkUserId,
        threadId: thread.id,
        answer: 'Yes, refund it.',
        endsWait: 'question',
      });

      expect(planAgentSpy).not.toHaveBeenCalled();
      expect(await db.agentTask.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({
        status: 'completed', claimToken: null, pendingQuestion: null,
      });
    });

    it('fails the task rather than leaving it claimed when the re-plan produces nothing', async () => {
      const { member, thread, taskId } = await seedWaitingSupportTask({ pending: true });
      planAgentSpy.mockRejectedValue(new Error('boom'));

      const message = await applyOperatorAnswerReplan({
        organizationId: org.id,
        memberKey: `member:${member.id}`,
        clerkUserId: member.clerkUserId,
        threadId: thread.id,
        answer: 'Yes, refund it.',
        endsWait: 'question',
      });

      expect(message).toContain("couldn't draft the reply");
      expect(await db.agentTask.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({
        status: 'failed', failureCode: 'answer_replan_failed', claimToken: null,
      });
    });

    it('leaves an unrelated member\'s conversation alone', async () => {
      const { thread, taskId } = await seedWaitingSupportTask({ pending: true });
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
        answer: 'Yes, refund it.',
        endsWait: 'question',
      })).rejects.toThrow('membership');

      expect(planAgentSpy).not.toHaveBeenCalled();
      expect(await db.agentTask.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({
        status: 'waiting_input', pendingQuestion: 'Is this one within policy?',
      });
      await cleanupTestData(outsiderOrg.id);
    });
  });

  it('does nothing destructive and returns an apologetic string when re-plan throws', async () => {
    const customer = await createTestCustomer(org.id, 'cust@example.com', { name: 'Jane Doe' });
    const thread = await createTestThread(org.id, customer.id, 'email', { tag: 'Support' });
    const custMsg = await createTestMessage(thread.id, 'Do you ship to Canada?', SenderType.customer);
    await db.thread.update({
      where: { id: thread.id },
      data: { cachedPlanMessageId: custMsg.id, aiSummary: 'Shipping to Canada', requestSummary: 'Shipping to Canada' },
    });
    await updateContext(org.id, MEMBER_KEY, { pendingQuestion: { threadId: thread.id, question: 'Ship to Canada?' } });

    planAgentSpy.mockRejectedValue(new Error('boom'));

    const message = await applyOperatorAnswerReplan({
      organizationId: org.id,
      memberKey: MEMBER_KEY,
      clerkUserId: CLERK_USER_ID,
      threadId: thread.id,
      answer: 'Yes, $15 flat.',
      endsWait: 'question',
      deliveryRef: 'telegram:chat_3',
    });

    expect(message).toContain("couldn't draft the reply");
    expect(sendOperatorPlanNotificationSpy).not.toHaveBeenCalled();
  });
});
