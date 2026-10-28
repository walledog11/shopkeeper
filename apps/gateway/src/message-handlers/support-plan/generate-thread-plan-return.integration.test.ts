import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import {
  createTestCustomer,
  createTestIntegration,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import { stubDurableAgentRuntimeEnv } from '../../test-fixtures/support-plan-test-fixtures.js';
import { createTestOrgTracker } from '../../test-fixtures/test-org-tracker.js';
import {
  acceptedSendReply,
  customerNotFound,
  order,
  orderStatusProviderFetch,
  shopDomain,
  toolUse,
} from '../../test-fixtures/order-status-fixtures.js';

const {
  anthropicCreate,
  postDashboardInternal,
} = vi.hoisted(() => ({
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
    acquire: vi.fn(async () => ({
      isLost: () => false,
      release: vi.fn(async () => {}),
    })),
  }),
}));

vi.mock('../../clients/dashboard-internal.js', () => ({
  postDashboardInternal,
}));

vi.mock('../../realtime/publish.js', () => ({
  publishThreadEvent: vi.fn(async () => {}),
}));

vi.mock('../../product-analytics.js', () => ({
  captureAgentActionsCompleted: vi.fn(),
  captureAgentPlanGenerated: vi.fn(async () => {}),
}));

vi.mock('../../operator-context.js', () => ({
  removePendingPlanForThread: vi.fn(async () => {}),
}));

vi.mock('@shopkeeper/agent/request-outcome', () => ({
  captureCommittedPlanOutcome: vi.fn(async () => {}),
  recordRequestEpisodeExecution: vi.fn(async () => {}),
}));

import { generateThreadPlan } from './generate-thread-plan.js';
import { executeCurrentCachedHomePlan } from '@shopkeeper/agent/plan-execution';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { buildGatewayPlanExecutionDeps } from '../operator/agent-turn-deps.js';

const testOrgs = createTestOrgTracker();
let providerFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  stubDurableAgentRuntimeEnv();

  anthropicCreate
    .mockResolvedValueOnce(toolUse('read-order', 'get_order_by_name', { order_name: '#1001' }))
    .mockResolvedValueOnce(toolUse('reply', 'send_reply', {
      text: 'Order #1001 has shipped.',
    }));

  postDashboardInternal.mockImplementation(acceptedSendReply);

  providerFetch = vi.fn(orderStatusProviderFetch);
  vi.stubGlobal('fetch', providerFetch);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await testOrgs.cleanupAll();
});

describe('durable return and exchange approval', () => {
  it.each([
    { change: 'one item remains returnable', returnableAfterApproval: 1, createOutcome: 'confirmed' },
    { change: 'no item remains returnable', returnableAfterApproval: 0, createOutcome: 'confirmed' },
    { change: 'the provider omits the created return', returnableAfterApproval: 1, createOutcome: 'unknown' },
  ] as const)('handles an approved return when $change', async ({ returnableAfterApproval, createOutcome }) => {
    anthropicCreate.mockReset();
    anthropicCreate
      .mockResolvedValueOnce(toolUse('discover-return', 'discover_capabilities', {
        capability: 'open a return for delivered goods',
      }))
      .mockResolvedValueOnce(toolUse('return', 'create_return', {
        order_id: '9000001001', variant_id: '8001', reason: 'unwanted',
      }))
      .mockResolvedValueOnce(toolUse('reply', 'send_reply', {
        text: 'Your return for order #1001 is open. No refund has been issued yet.',
      }));

    let returnCreateCalls = 0;
    let currentReturnableQuantity = 1;
    providerFetch.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/orders/9000001001.json')) {
        return new Response(JSON.stringify({ order }), { status: 200 });
      }
      if (url.includes('/orders.json')) {
        return new Response(JSON.stringify({ orders: [order] }), { status: 200 });
      }
      if (url.includes('/graphql.json')) {
        const body = JSON.parse(String(init?.body)) as { query: string };
        if (body.query.includes('query returnableFulfillments')) {
          return new Response(JSON.stringify({ data: {
            order: { id: 'gid://shopify/Order/9000001001' },
            returnableFulfillments: { edges: [{ node: { returnableFulfillmentLineItems: {
              edges: [{ node: {
                quantity: currentReturnableQuantity,
                fulfillmentLineItem: {
                  id: 'gid://shopify/FulfillmentLineItem/7001',
                  lineItem: { name: 'Black shirt', variant: { id: 'gid://shopify/ProductVariant/8001' } },
                },
              } }],
            } } }] },
          } }), { status: 200 });
        }
        if (body.query.includes('mutation returnCreate')) {
          returnCreateCalls += 1;
          return new Response(JSON.stringify({ data: { returnCreate: {
            return: createOutcome === 'confirmed'
              ? { id: 'gid://shopify/Return/9901', name: '#1001-R1', status: 'REQUESTED' }
              : null,
            userErrors: [],
          } } }), { status: 200 });
        }
      }
      if (url.includes('/customers/1234.json')) return customerNotFound();
      throw new Error(`Unexpected external request: ${url}`);
    });

    const org = await createTestOrg();
    testOrgs.track(org.id);
    const settings = { autonomyTier: 'guarded' as const, autoExecuteMode: 'off' as const };
    await db.organization.update({ where: { id: org.id }, data: { settings } });
    await createTestIntegration(org.id, {
      platform: 'shopify',
      externalAccountId: shopDomain(),
      accessToken: 'shpat_test',
      metadata: { oauthScopes: ['read_orders', 'write_returns'] },
    });
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: randomUUID() },
    });
    const customer = await createTestCustomer(org.id, `${randomUUID()}@example.com`);
    const thread = await createTestThread(org.id, customer.id, 'ig_dm', { shopifyCustomerId: '1234' });
    const sourceMessage = await createTestMessage(thread.id, 'I received order #1001 and want to return the black shirt.');
    await db.thread.update({
      where: { id: thread.id },
      data: {
        requestSummary: 'Open a return for the black shirt on order #1001.',
        requestSourceMessageId: sourceMessage.id,
        classifierSignals: {
          version: 5,
          language: 'en',
          intents: { mutative_request: true },
          requestFacts: { ask: 'return', order: '#1001' },
        },
      },
    });

    const generated = await generateThreadPlan(org.id, thread.id, false, {
      sourceMessageId: sourceMessage.id,
    });
    expect(generated.plan?.rawToolCalls.map(call => call.name)).toEqual(['create_return', 'send_reply']);
    currentReturnableQuantity = returnableAfterApproval;

    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings: resolveAgentSettings(settings),
      executionIntent: 'merchant_approved',
      failureRoute: 'test:return-host',
      approver: { clerkUserId: member.clerkUserId, displayName: 'Test Merchant' },
    }, buildGatewayPlanExecutionDeps());

    if (returnableAfterApproval === 0) {
      expect(returnCreateCalls).toBe(0);
      const blocked = await db.agentAction.findFirstOrThrow({
        where: { organizationId: org.id, tool: 'create_return' },
      });
      expect(blocked).toMatchObject({
        proposalId: generated.identity!.planId,
        status: 'policy_block',
        receiptVersion: 1,
        receipt: { outcome: 'rejected', code: 'no_returnable_items' },
      });
      expect(postDashboardInternal.mock.calls.every(([, body]) =>
        !JSON.stringify(body).includes('return for order #1001 is open'))).toBe(true);
      return;
    }

    expect(returnCreateCalls).toBe(1);
    if (createOutcome === 'unknown') {
      expect(executed.execution.status).toBe('unknown');
      // The approved reply was written for the write succeeding, so an unknown
      // outcome skips it without dispatch.
      expect(executed.result.actionsPerformed).toMatchObject([
        { tool: 'create_return', status: 'unknown' },
        { tool: 'send_reply', status: 'unknown', result: expect.stringContaining('skipped send_reply') },
      ]);
      expect(executed.result.actionsPerformed).toHaveLength(2);
      const action = await db.agentAction.findFirstOrThrow({
        where: { organizationId: org.id, tool: 'create_return' },
      });
      expect(action).toMatchObject({
        taskId: expect.any(String),
        proposalId: generated.identity!.planId,
        status: 'unknown',
        dispatchState: 'unknown',
        receiptVersion: 1,
        receipt: { outcome: 'unknown', code: 'provider_return_missing' },
      });
      expect(postDashboardInternal).not.toHaveBeenCalled();
      expect((await db.agentTask.findUniqueOrThrow({ where: { id: action.taskId! } })).status)
        .toBe('reconciling');
      return;
    }
    expect(executed.execution.status, JSON.stringify(executed.result.actionsPerformed)).toBe('committed');
    const action = await db.agentAction.findFirstOrThrow({
      where: { organizationId: org.id, tool: 'create_return' },
    });
    expect(action).toMatchObject({
      taskId: expect.any(String),
      proposalId: generated.identity!.planId,
      status: 'success',
      dispatchState: 'settled',
      receiptVersion: 1,
    });
    expect(action.receipt).toMatchObject({
      outcome: 'succeeded',
      providerReference: 'gid://shopify/Return/9901',
      facts: {
        orderId: '9000001001',
        returnName: '#1001-R1',
        status: 'REQUESTED',
        lineItems: [{ fulfillmentLineItemId: 'gid://shopify/FulfillmentLineItem/7001', quantity: 1 }],
        refundIssued: false,
      },
    });
    expect(postDashboardInternal).toHaveBeenCalledWith(
      '/api/agent/io-send-internal',
      expect.objectContaining({ agentTaskId: action.taskId }),
      expect.anything(),
    );
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: action.taskId! } })).status)
      .toBe('completed');
  });

  it.each([
    { change: 'none', returnableAfterApproval: 1, replacementPriceAfterApproval: '42.00', createOutcome: 'confirmed' },
    { change: 'returned item no longer returnable', returnableAfterApproval: 0, replacementPriceAfterApproval: '42.00', createOutcome: 'confirmed' },
    { change: 'replacement becomes more expensive', returnableAfterApproval: 1, replacementPriceAfterApproval: '52.00', createOutcome: 'confirmed' },
    { change: 'the provider omits the created exchange return', returnableAfterApproval: 1, replacementPriceAfterApproval: '42.00', createOutcome: 'unknown' },
  ] as const)('handles an approved exchange after $change', async ({ returnableAfterApproval, replacementPriceAfterApproval, createOutcome }) => {
    anthropicCreate.mockReset();
    anthropicCreate
      .mockResolvedValueOnce(toolUse('discover-exchange', 'discover_capabilities', {
        capability: 'exchange a delivered product for a different variant',
      }))
      .mockResolvedValueOnce(toolUse('exchange', 'create_exchange', {
        order_id: '9000001001', variant_id: '8001', exchange_variant_id: '8002', quantity: 1,
      }))
      .mockResolvedValueOnce(toolUse('reply', 'send_reply', {
        text: 'We have opened an exchange for order #1001.',
      }));

    let returnCreateCalls = 0;
    let currentReturnableQuantity = 1;
    let currentReplacementPrice = '42.00';
    providerFetch.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/orders/9000001001.json')) {
        return new Response(JSON.stringify({ order }), { status: 200 });
      }
      if (url.includes('/orders.json')) {
        return new Response(JSON.stringify({ orders: [order] }), { status: 200 });
      }
      if (url.includes('/graphql.json')) {
        const body = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> };
        if (body.query.includes('query returnableFulfillments')) {
          return new Response(JSON.stringify({ data: {
            order: { id: 'gid://shopify/Order/9000001001' },
            returnableFulfillments: { edges: [{ node: { returnableFulfillmentLineItems: {
              edges: [{ node: {
                quantity: currentReturnableQuantity,
                fulfillmentLineItem: {
                  id: 'gid://shopify/FulfillmentLineItem/7001',
                  lineItem: { name: 'Black shirt', variant: { id: 'gid://shopify/ProductVariant/8001' } },
                },
              } }],
            } } }] },
          } }), { status: 200 });
        }
        if (body.query.includes('query variantPrices')) {
          return new Response(JSON.stringify({ data: { nodes: [
            { id: 'gid://shopify/ProductVariant/8001', price: '42.00', title: 'Black / Medium', product: { title: 'Shirt' } },
            { id: 'gid://shopify/ProductVariant/8002', price: currentReplacementPrice, title: 'Black / Large', product: { title: 'Shirt' } },
          ] } }), { status: 200 });
        }
        if (body.query.includes('mutation returnCreate')) {
          returnCreateCalls += 1;
          expect(body.variables.returnInput).toMatchObject({
            exchangeLineItems: [{ variantId: 'gid://shopify/ProductVariant/8002', quantity: 1 }],
          });
          return new Response(JSON.stringify({ data: { returnCreate: {
            return: createOutcome === 'confirmed'
              ? { id: 'gid://shopify/Return/9902', name: '#1001-R2', status: 'REQUESTED' }
              : null,
            userErrors: [],
          } } }), { status: 200 });
        }
      }
      if (url.includes('/customers/1234.json')) return customerNotFound();
      throw new Error(`Unexpected external request: ${url}`);
    });

    const org = await createTestOrg();
    testOrgs.track(org.id);
    const settings = { autonomyTier: 'guarded' as const, autoExecuteMode: 'off' as const };
    await db.organization.update({ where: { id: org.id }, data: { settings } });
    await createTestIntegration(org.id, {
      platform: 'shopify',
      externalAccountId: shopDomain(),
      accessToken: 'shpat_test',
      metadata: { oauthScopes: ['read_orders', 'read_products', 'write_returns'] },
    });
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: randomUUID() },
    });
    const customer = await createTestCustomer(org.id, `${randomUUID()}@example.com`);
    const thread = await createTestThread(org.id, customer.id, 'ig_dm', { shopifyCustomerId: '1234' });
    const sourceMessage = await createTestMessage(thread.id, 'I received order #1001. Can I exchange the black shirt for a large?');
    await db.thread.update({
      where: { id: thread.id },
      data: {
        requestSummary: 'Exchange the shirt on order #1001 for a large.',
        requestSourceMessageId: sourceMessage.id,
        classifierSignals: {
          version: 5,
          language: 'en',
          intents: { mutative_request: true },
          requestFacts: { ask: 'exchange', order: '#1001' },
        },
      },
    });

    const generated = await generateThreadPlan(org.id, thread.id, false, {
      sourceMessageId: sourceMessage.id,
    });
    expect(generated.plan?.rawToolCalls.map(call => call.name)).toEqual(['create_exchange', 'send_reply']);
    currentReturnableQuantity = returnableAfterApproval;
    currentReplacementPrice = replacementPriceAfterApproval;
    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings: resolveAgentSettings(settings),
      executionIntent: 'merchant_approved',
      failureRoute: 'test:exchange-host',
      approver: { clerkUserId: member.clerkUserId, displayName: 'Test Merchant' },
    }, buildGatewayPlanExecutionDeps());

    if (returnableAfterApproval === 0 || replacementPriceAfterApproval !== '42.00') {
      expect(returnCreateCalls).toBe(0);
      const blocked = await db.agentAction.findFirstOrThrow({
        where: { organizationId: org.id, tool: 'create_exchange' },
      });
      expect(blocked).toMatchObject({
        proposalId: generated.identity!.planId,
        status: 'policy_block',
        receiptVersion: 1,
        receipt: {
          outcome: 'rejected',
          code: returnableAfterApproval === 0 ? 'variant_not_returnable' : 'replacement_price_higher',
        },
      });
      expect(postDashboardInternal.mock.calls.every(([, body]) =>
        !JSON.stringify(body).includes('opened an exchange'))).toBe(true);
      return;
    }

    expect(returnCreateCalls).toBe(1);
    if (createOutcome === 'unknown') {
      expect(executed.execution.status).toBe('unknown');
      // The approved reply was written for the write succeeding, so an unknown
      // outcome skips it without dispatch.
      expect(executed.result.actionsPerformed).toMatchObject([
        { tool: 'create_exchange', status: 'unknown' },
        { tool: 'send_reply', status: 'unknown', result: expect.stringContaining('skipped send_reply') },
      ]);
      expect(executed.result.actionsPerformed).toHaveLength(2);
      const action = await db.agentAction.findFirstOrThrow({
        where: { organizationId: org.id, tool: 'create_exchange' },
      });
      expect(action).toMatchObject({
        taskId: expect.any(String),
        proposalId: generated.identity!.planId,
        status: 'unknown',
        dispatchState: 'unknown',
        receiptVersion: 1,
        receipt: { outcome: 'unknown', code: 'provider_return_missing' },
      });
      expect(postDashboardInternal).not.toHaveBeenCalled();
      expect((await db.agentTask.findUniqueOrThrow({ where: { id: action.taskId! } })).status)
        .toBe('reconciling');
      return;
    }
    expect(executed.execution.status, JSON.stringify(executed.result.actionsPerformed)).toBe('committed');
    const action = await db.agentAction.findFirstOrThrow({
      where: { organizationId: org.id, tool: 'create_exchange' },
    });
    expect(action).toMatchObject({
      taskId: expect.any(String), proposalId: generated.identity!.planId,
      status: 'success', dispatchState: 'settled', receiptVersion: 1,
    });
    expect(action.receipt).toMatchObject({
      outcome: 'succeeded', providerReference: 'gid://shopify/Return/9902',
      facts: {
        orderId: '9000001001', returnName: '#1001-R2', status: 'REQUESTED',
        returnedItems: [{ variantId: 'gid://shopify/ProductVariant/8001', quantity: 1 }],
        replacementItems: [{ variantId: 'gid://shopify/ProductVariant/8002', quantity: 1 }],
        financialConsequence: null,
      },
    });
    expect(postDashboardInternal).toHaveBeenCalledWith(
      '/api/agent/io-send-internal',
      expect.objectContaining({ agentTaskId: action.taskId }),
      expect.anything(),
    );
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: action.taskId! } })).status)
      .toBe('completed');
  });
});
