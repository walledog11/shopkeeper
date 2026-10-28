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

describe('durable refund approval', () => {
  it('rejects an approved full refund if Shopify reduces the refundable balance during the wait', async () => {
    anthropicCreate.mockReset();
    anthropicCreate
      .mockResolvedValueOnce(toolUse('discover-refund', 'discover_capabilities', {
        capability: 'issue a full order refund',
      }))
      .mockResolvedValueOnce(toolUse('refund', 'create_refund', {
        order_id: '9000001001', amount: '42.00', currency: 'USD',
      }))
      .mockResolvedValueOnce(toolUse('reply', 'send_reply', {
        text: 'I could not refund order #1001 because the refundable amount changed.',
      }));

    const refundableOrder = {
      ...order,
      financial_status: 'paid',
      refunds: [],
      line_items: [{ ...order.line_items[0], id: 7001, current_quantity: 1 }],
    };
    let refundMutationCalls = 0;
    providerFetch.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/graphql.json')) {
        refundMutationCalls += 1;
        throw new Error('A stale refund amount must not reach Shopify refundCreate.');
      }
      if (url.includes('/refunds/calculate.json')) {
        return new Response(JSON.stringify({ refund: {
          currency: 'USD',
          refund_line_items: [{ line_item_id: 7001, quantity: 1, restock_type: 'no_restock' }],
          transactions: [{
            kind: 'suggested_refund', gateway: 'shopify_payments', parent_id: 222,
            amount: '20.00', maximum_refundable: '20.00',
          }],
        } }), { status: 200 });
      }
      if (url.includes('/orders/9000001001.json')) {
        return new Response(JSON.stringify({ order: refundableOrder }), { status: 200 });
      }
      if (url.includes('/orders.json')) {
        return new Response(JSON.stringify({ orders: [refundableOrder] }), { status: 200 });
      }
      if (url.includes('/customers/1234.json')) return customerNotFound();
      throw new Error(`Unexpected external request: ${url}`);
    });

    const org = await createTestOrg();
    testOrgs.track(org.id);
    const settings = { autonomyTier: 'guarded' as const, autoExecuteMode: 'off' as const };
    await db.organization.update({ where: { id: org.id }, data: { settings } });
    await createTestIntegration(org.id, {
      platform: 'shopify', externalAccountId: shopDomain(), accessToken: 'shpat_test',
      metadata: { oauthScopes: ['read_orders', 'write_orders'] },
    });
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: randomUUID() },
    });
    const customer = await createTestCustomer(org.id, `${randomUUID()}@example.com`);
    const thread = await createTestThread(org.id, customer.id, 'ig_dm', { shopifyCustomerId: '1234' });
    const sourceMessage = await createTestMessage(thread.id, 'Please refund all $42.00 of order #1001.');
    await db.thread.update({
      where: { id: thread.id },
      data: {
        requestSummary: 'Refund the full $42.00 for order #1001.',
        requestSourceMessageId: sourceMessage.id,
        classifierSignals: {
          version: 5, language: 'en', intents: { mutative_request: true },
          requestFacts: { ask: 'refund', order: '#1001' },
        },
      },
    });

    const generated = await generateThreadPlan(org.id, thread.id, false, {
      sourceMessageId: sourceMessage.id,
    });
    expect(generated.plan?.rawToolCalls.map(call => call.name)).toEqual(['create_refund', 'send_reply']);

    await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings: resolveAgentSettings(settings),
      executionIntent: 'merchant_approved',
      failureRoute: 'test:stale-refund-balance-host',
      approver: { clerkUserId: member.clerkUserId, displayName: 'Test Merchant' },
    }, buildGatewayPlanExecutionDeps());

    expect(refundMutationCalls).toBe(0);
    const refund = await db.agentAction.findFirstOrThrow({
      where: { organizationId: org.id, tool: 'create_refund' },
    });
    expect(refund).toMatchObject({
      proposalId: generated.identity!.planId,
      status: 'policy_block',
      receiptVersion: 1,
      receipt: { outcome: 'rejected', code: 'amount_mismatch' },
      output: expect.stringContaining('Shopify now calculates 20.00 USD'),
    });
    expect(postDashboardInternal.mock.calls.every(([, body]) =>
      !JSON.stringify(body).includes('has been refunded'))).toBe(true);
  });

  it('rejects an approved partial refund when another refund consumes the items during the wait', async () => {
    anthropicCreate.mockReset();
    anthropicCreate
      .mockResolvedValueOnce(toolUse('discover-partial-refund', 'discover_capabilities', {
        capability: 'refund one damaged item from an order',
      }))
      .mockResolvedValueOnce(toolUse('partial-refund', 'create_partial_refund', {
        order_id: '9000001001', items: [{ line_item_id: '7001', quantity: 1 }],
      }))
      .mockResolvedValueOnce(toolUse('reply', 'send_reply', {
        text: 'I could not refund the item because the order changed while we waited.',
      }));

    const changedOrder = {
      ...order,
      refunds: [{ id: 991, refund_line_items: [{ line_item_id: 7001, quantity: 1 }] }],
      line_items: [{ ...order.line_items[0], current_quantity: 0 }],
    };
    let refundMutationCalls = 0;
    let approvalGranted = false;
    providerFetch.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/graphql.json')) {
        refundMutationCalls += 1;
        throw new Error('A stale partial refund must not reach Shopify refundCreate.');
      }
      if (url.includes('/refunds/calculate.json')) {
        return new Response(JSON.stringify({ refund: {
          currency: 'USD',
          transactions: [{
            kind: 'suggested_refund', gateway: 'shopify_payments', parent_id: 222, amount: '16.00',
          }],
        } }), { status: 200 });
      }
      if (url.includes('/orders/9000001001.json')) {
        return new Response(JSON.stringify({ order: approvalGranted ? changedOrder : order }), { status: 200 });
      }
      if (url.includes('/orders.json')) {
        return new Response(JSON.stringify({ orders: [order] }), { status: 200 });
      }
      if (url.includes('/customers/1234.json')) return customerNotFound();
      throw new Error(`Unexpected external request: ${url}`);
    });

    const org = await createTestOrg();
    testOrgs.track(org.id);
    const settings = { autonomyTier: 'guarded' as const, autoExecuteMode: 'off' as const };
    await db.organization.update({ where: { id: org.id }, data: { settings } });
    await createTestIntegration(org.id, {
      platform: 'shopify', externalAccountId: shopDomain(), accessToken: 'shpat_test',
      metadata: { oauthScopes: ['read_orders', 'write_orders'] },
    });
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: randomUUID() },
    });
    const customer = await createTestCustomer(org.id, `${randomUUID()}@example.com`);
    const thread = await createTestThread(org.id, customer.id, 'ig_dm', { shopifyCustomerId: '1234' });
    const sourceMessage = await createTestMessage(thread.id, 'Please refund the damaged black shirt from order #1001.');
    await db.thread.update({
      where: { id: thread.id },
      data: {
        requestSummary: 'Refund the damaged black shirt from order #1001.',
        requestSourceMessageId: sourceMessage.id,
        classifierSignals: {
          version: 5, language: 'en', intents: { mutative_request: true },
          requestFacts: { ask: 'refund', order: '#1001' },
        },
      },
    });

    const generated = await generateThreadPlan(org.id, thread.id, false, {
      sourceMessageId: sourceMessage.id,
    });
    expect(generated.plan?.rawToolCalls.map(call => call.name)).toEqual(['create_partial_refund', 'send_reply']);
    expect(generated.plan?.rawToolCalls[0]?.input).toMatchObject({
      approval_amount: '16.00', approval_currency: 'USD',
    });
    approvalGranted = true;

    await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings: resolveAgentSettings(settings),
      executionIntent: 'merchant_approved',
      failureRoute: 'test:stale-partial-refund-host',
      approver: { clerkUserId: member.clerkUserId, displayName: 'Test Merchant' },
    }, buildGatewayPlanExecutionDeps());

    expect(refundMutationCalls).toBe(0);
    const refund = await db.agentAction.findFirstOrThrow({
      where: { organizationId: org.id, tool: 'create_partial_refund' },
    });
    expect(refund).toMatchObject({
      proposalId: generated.identity!.planId,
      status: 'policy_block',
      receiptVersion: 1,
      receipt: { outcome: 'rejected', code: 'prior_refund' },
    });
    expect(postDashboardInternal.mock.calls.every(([, body]) =>
      !JSON.stringify(body).includes('has been refunded'))).toBe(true);
  });

  it('rejects an approved partial refund when Shopify recalculates a different amount', async () => {
    anthropicCreate.mockReset();
    anthropicCreate
      .mockResolvedValueOnce(toolUse('discover-partial-refund', 'discover_capabilities', {
        capability: 'refund one damaged item from an order',
      }))
      .mockResolvedValueOnce(toolUse('partial-refund', 'create_partial_refund', {
        order_id: '9000001001', items: [{ line_item_id: '7001', quantity: 1 }],
      }))
      .mockResolvedValueOnce(toolUse('reply', 'send_reply', {
        text: 'I could not refund the item because the approved amount changed.',
      }));

    let approvalGranted = false;
    let refundMutationCalls = 0;
    providerFetch.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/graphql.json')) {
        refundMutationCalls += 1;
        throw new Error('A changed approved amount must not reach Shopify refundCreate.');
      }
      if (url.includes('/refunds/calculate.json')) {
        return new Response(JSON.stringify({ refund: {
          currency: 'USD',
          transactions: [{
            kind: 'suggested_refund', gateway: 'shopify_payments', parent_id: 222,
            amount: approvalGranted ? '18.00' : '16.00',
          }],
        } }), { status: 200 });
      }
      if (url.includes('/orders/9000001001.json')) {
        return new Response(JSON.stringify({ order }), { status: 200 });
      }
      if (url.includes('/orders.json')) {
        return new Response(JSON.stringify({ orders: [order] }), { status: 200 });
      }
      if (url.includes('/customers/1234.json')) return customerNotFound();
      throw new Error(`Unexpected external request: ${url}`);
    });

    const org = await createTestOrg();
    testOrgs.track(org.id);
    const settings = { autonomyTier: 'guarded' as const, autoExecuteMode: 'off' as const };
    await db.organization.update({ where: { id: org.id }, data: { settings } });
    await createTestIntegration(org.id, {
      platform: 'shopify', externalAccountId: shopDomain(), accessToken: 'shpat_test',
      metadata: { oauthScopes: ['read_orders', 'write_orders'] },
    });
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: randomUUID() },
    });
    const customer = await createTestCustomer(org.id, `${randomUUID()}@example.com`);
    const thread = await createTestThread(org.id, customer.id, 'ig_dm', { shopifyCustomerId: '1234' });
    const sourceMessage = await createTestMessage(thread.id, 'Refund the damaged black shirt from order #1001.');
    await db.thread.update({
      where: { id: thread.id },
      data: {
        requestSummary: 'Refund the damaged black shirt from order #1001.',
        requestSourceMessageId: sourceMessage.id,
        classifierSignals: {
          version: 5, language: 'en', intents: { mutative_request: true },
          requestFacts: { ask: 'refund', order: '#1001' },
        },
      },
    });

    const generated = await generateThreadPlan(org.id, thread.id, false, {
      sourceMessageId: sourceMessage.id,
    });
    expect(generated.plan?.rawToolCalls[0]?.input).toMatchObject({
      approval_amount: '16.00', approval_currency: 'USD',
    });
    approvalGranted = true;

    await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings: resolveAgentSettings(settings),
      executionIntent: 'merchant_approved',
      failureRoute: 'test:changed-partial-refund-amount-host',
      approver: { clerkUserId: member.clerkUserId, displayName: 'Test Merchant' },
    }, buildGatewayPlanExecutionDeps());

    expect(refundMutationCalls).toBe(0);
    expect(await db.agentAction.findFirstOrThrow({
      where: { organizationId: org.id, tool: 'create_partial_refund' },
    })).toMatchObject({
      proposalId: generated.identity!.planId,
      status: 'policy_block',
      receiptVersion: 1,
      receipt: { outcome: 'rejected', code: 'amount_mismatch' },
    });
    expect(postDashboardInternal.mock.calls.every(([, body]) =>
      !JSON.stringify(body).includes('has been refunded'))).toBe(true);
  });
});
