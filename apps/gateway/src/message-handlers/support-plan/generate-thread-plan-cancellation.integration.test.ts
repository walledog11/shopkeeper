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

describe('durable cancellation approval', () => {
  it.each([
    { label: 'sent', delivery: 'sent', providerOutcome: 'confirmed_after_timeout' },
    { label: 'failed', delivery: 'failed', providerOutcome: 'direct' },
    { label: 'unknown', delivery: 'unknown', providerOutcome: 'direct' },
    { label: 'skipped after an unresolved provider result', delivery: null, providerOutcome: 'unresolved' },
  ] as const)(
    'executes an approved cancellation once when customer delivery is $label',
    async ({ delivery, providerOutcome }) => {
    anthropicCreate.mockReset();
    anthropicCreate
      .mockResolvedValueOnce(toolUse('discover-cancel', 'discover_capabilities', {
        capability: 'cancel an unfulfilled order',
      }))
      .mockResolvedValueOnce(toolUse('cancel', 'cancel_order', {
        order_id: '9000001001', reason: 'customer', restock: true,
      }))
      .mockResolvedValueOnce(toolUse('reply', 'send_reply', {
        text: 'Order #1001 has been canceled.',
      }));

    const cancellable = {
      ...order,
      fulfillment_status: null,
      cancelled_at: null,
      customer: { id: 1234 },
    };
    // Shopify's cancel refunds only the amount it is sent (decision H), so the
    // refund appears on the cancelled order only because one was requested.
    const cancelled = {
      ...cancellable,
      cancelled_at: '2026-09-20T12:00:00Z',
      cancel_reason: 'customer',
      financial_status: 'refunded',
      refunds: [{
        id: 5001,
        transactions: [{ kind: 'refund', status: 'success', gateway: 'manual', amount: '42.00', currency: 'USD' }],
      }],
    };
    let cancelCalls = 0;
    providerFetch.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/orders/9000001001/refunds/calculate.json')) {
        return new Response(JSON.stringify({
          refund: {
            currency: 'USD',
            transactions: [{ kind: 'suggested_refund', gateway: 'manual', amount: '42.00', currency: 'USD', parent_id: 6001 }],
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('/orders/9000001001/cancel.json')) {
        expect(JSON.parse(String(init?.body))).toMatchObject({ amount: '42.00', currency: 'USD' });
        cancelCalls += 1;
        if (providerOutcome !== 'direct') {
          return new Response(JSON.stringify({ errors: 'response lost after commit' }), { status: 503 });
        }
        return new Response(JSON.stringify({ order: cancelled }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/orders/9000001001.json')) {
        const currentOrder = cancelCalls > 0 && providerOutcome !== 'unresolved'
          ? cancelled
          : cancellable;
        return new Response(JSON.stringify({ order: currentOrder }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/customers/1234.json')) {
        return new Response(JSON.stringify({ customer: { id: 1234 } }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/orders.json')) {
        return new Response(JSON.stringify({ orders: [cancelCalls > 0 ? cancelled : cancellable] }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected external request: ${method} ${url}`);
    });

    const org = await createTestOrg();
    testOrgs.track(org.id);
    const settings = { autonomyTier: 'guarded' as const, autoExecuteMode: 'off' as const };
    await db.organization.update({ where: { id: org.id }, data: { settings } });
    await createTestIntegration(org.id, {
      platform: 'shopify',
      externalAccountId: shopDomain(),
      accessToken: 'shpat_test',
      metadata: { oauthScopes: ['read_orders', 'write_orders'] },
    });
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: randomUUID() },
    });
    const customer = await createTestCustomer(org.id, `${randomUUID()}@example.com`);
    const thread = await createTestThread(org.id, customer.id, 'ig_dm', { shopifyCustomerId: '1234' });
    const sourceMessage = await createTestMessage(thread.id, 'Please cancel order #1001.');
    await db.thread.update({
      where: { id: thread.id },
      data: {
        requestSummary: 'Cancel unfulfilled order #1001.',
        requestSourceMessageId: sourceMessage.id,
        classifierSignals: {
          version: 5,
          language: 'en',
          intents: { mutative_request: true },
          requestFacts: { ask: 'cancel', order: '#1001' },
        },
      },
    });

    const generated = await generateThreadPlan(org.id, thread.id, false, {
      sourceMessageId: sourceMessage.id,
    });
    expect(generated.plan?.rawToolCalls.map(call => call.name)).toEqual(['cancel_order', 'send_reply']);
    if (delivery !== null && delivery !== 'sent') {
      postDashboardInternal.mockResolvedValueOnce({
        ok: false, status: 503, responseBody: 'delivery unavailable', outcome: delivery,
      });
    }

    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings: resolveAgentSettings(settings),
      executionIntent: 'merchant_approved',
      failureRoute: 'test:cancellation-host',
      approver: { clerkUserId: member.clerkUserId, displayName: 'Test Merchant' },
    }, buildGatewayPlanExecutionDeps());

    expect(cancelCalls).toBe(1);
    if (providerOutcome === 'unresolved') {
      expect(executed.execution.status).toBe('unknown');
      // The approved reply was written for the write succeeding, so an unknown
      // outcome skips it without dispatch.
      expect(executed.result.actionsPerformed).toMatchObject([
        { tool: 'cancel_order', status: 'unknown' },
        { tool: 'send_reply', status: 'unknown', result: expect.stringContaining('skipped send_reply') },
      ]);
      expect(executed.result.actionsPerformed).toHaveLength(2);
      const cancellation = await db.agentAction.findFirstOrThrow({
        where: { organizationId: org.id, tool: 'cancel_order' },
      });
      expect(cancellation).toMatchObject({
        taskId: expect.any(String),
        proposalId: generated.identity!.planId,
        status: 'unknown',
        dispatchState: 'unknown',
        receiptVersion: 1,
        receipt: { outcome: 'unknown', code: 'reconciliation_not_confirmed' },
      });
      expect(postDashboardInternal).not.toHaveBeenCalled();
      expect((await db.agentTask.findUniqueOrThrow({ where: { id: cancellation.taskId! } })).status)
        .toBe('reconciling');
      return;
    }
    // The cancellation is the effect; a failed reply is delivery and is recorded
    // on its own row, so it does not fail the execution or the task.
    expect(executed.execution.status).toBe(delivery === 'unknown' ? 'unknown' : 'committed');
    expect(executed.result.actionsPerformed.map(action => action.tool)).toEqual([
      'cancel_order', 'send_reply',
    ]);
    const cancellation = await db.agentAction.findFirstOrThrow({
      where: { organizationId: org.id, tool: 'cancel_order' },
    });
    expect(cancellation).toMatchObject({
      taskId: expect.any(String),
      proposalId: generated.identity!.planId,
      status: 'success',
      dispatchState: 'settled',
      receiptVersion: 1,
    });
    expect(cancellation.receipt).toMatchObject({
      outcome: 'succeeded',
      facts: {
        orderId: '9000001001',
        cancelledAt: '2026-09-20T12:00:00Z',
        reason: 'customer',
        financialStatus: 'refunded',
      },
    });
    if (providerOutcome === 'confirmed_after_timeout') {
      expect(cancellation.output).toContain('confirmed after an interrupted provider response');
    }
    expect(postDashboardInternal).toHaveBeenCalledWith(
      '/api/agent/io-send-internal',
      expect.objectContaining({
        agentTaskId: cancellation.taskId,
        input: { text: 'Order #1001 has been canceled.' },
      }),
      expect.anything(),
    );
    const reply = await db.agentAction.findFirstOrThrow({
      where: { organizationId: org.id, tool: 'send_reply' },
    });
    expect(reply).toMatchObject({
      taskId: cancellation.taskId,
      status: delivery === 'sent' ? 'success' : delivery === 'failed' ? 'error' : 'unknown',
      receipt: { outcome: delivery === 'sent' ? 'succeeded' : delivery },
    });
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: cancellation.taskId! } })).status)
      .toBe(delivery === 'unknown' ? 'reconciling' : 'completed');
    },
  );

  it.each([
    { fulfillment: 'fulfilled' },
    { fulfillment: 'partial' },
  ])('rejects a stale cancellation approval when the order becomes $fulfillment during the wait', async ({ fulfillment }) => {
    anthropicCreate.mockReset();
    anthropicCreate
      .mockResolvedValueOnce(toolUse('discover-cancel', 'discover_capabilities', {
        capability: 'cancel an unfulfilled order',
      }))
      .mockResolvedValueOnce(toolUse('cancel', 'cancel_order', {
        order_id: '9000001001', reason: 'customer',
      }))
      .mockResolvedValueOnce(toolUse('reply', 'send_reply', {
        text: 'Order #1001 has shipped, so I could not cancel it.',
      }));

    let fulfillmentStatus: string | null = null;
    let cancelCalls = 0;
    providerFetch.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      const currentOrder = { ...order, fulfillment_status: fulfillmentStatus, cancelled_at: null };
      if (url.includes('/orders/9000001001/cancel.json')) {
        cancelCalls += 1;
        throw new Error('A stale approved action must not reach Shopify cancellation.');
      }
      // Planning binds the cancellation's refund quote into the approval.
      if (url.includes('/orders/9000001001/refunds/calculate.json')) {
        return new Response(JSON.stringify({
          refund: {
            currency: 'USD',
            transactions: [{ kind: 'suggested_refund', gateway: 'manual', amount: '42.00', currency: 'USD', parent_id: 6001 }],
          },
        }), { status: 200 });
      }
      if (url.includes('/orders/9000001001.json')) {
        return new Response(JSON.stringify({ order: currentOrder }), { status: 200 });
      }
      if (url.includes('/orders.json')) {
        return new Response(JSON.stringify({ orders: [currentOrder] }), { status: 200 });
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
    const sourceMessage = await createTestMessage(thread.id, 'Please cancel order #1001.');
    await db.thread.update({
      where: { id: thread.id },
      data: {
        requestSummary: 'Cancel unfulfilled order #1001.',
        requestSourceMessageId: sourceMessage.id,
        classifierSignals: {
          version: 5, language: 'en', intents: { mutative_request: true },
          requestFacts: { ask: 'cancel', order: '#1001' },
        },
      },
    });

    const generated = await generateThreadPlan(org.id, thread.id, false, {
      sourceMessageId: sourceMessage.id,
    });
    expect(generated.plan?.rawToolCalls.map(call => call.name)).toEqual(['cancel_order', 'send_reply']);
    fulfillmentStatus = fulfillment;

    await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings: resolveAgentSettings(settings),
      executionIntent: 'merchant_approved',
      failureRoute: 'test:stale-cancellation-host',
      approver: { clerkUserId: member.clerkUserId, displayName: 'Test Merchant' },
    }, buildGatewayPlanExecutionDeps());

    expect(cancelCalls).toBe(0);
    const cancellation = await db.agentAction.findFirstOrThrow({
      where: { organizationId: org.id, tool: 'cancel_order' },
    });
    expect(cancellation).toMatchObject({
      proposalId: generated.identity!.planId,
      status: 'policy_block',
      receiptVersion: 1,
      receipt: { outcome: 'rejected', code: 'order_already_fulfilled' },
    });
    expect(postDashboardInternal.mock.calls.every(([, body]) =>
      !JSON.stringify(body).includes('has been canceled'))).toBe(true);
  });

  it.each([
    { change: 'Shopify write grant is revoked', reason: 'write_orders' },
    { change: 'workspace cancellation policy is disabled', reason: 'cancellations are disabled' },
  ])('refuses an approved cancellation if $change during the wait', async ({ reason }) => {
    anthropicCreate.mockReset();
    anthropicCreate
      .mockResolvedValueOnce(toolUse('discover-cancel', 'discover_capabilities', {
        capability: 'cancel an unfulfilled order',
      }))
      .mockResolvedValueOnce(toolUse('cancel', 'cancel_order', {
        order_id: '9000001001', reason: 'customer',
      }))
      .mockResolvedValueOnce(toolUse('reply', 'send_reply', {
        text: 'I could not cancel order #1001 because the store connection needs permission.',
      }));

    const cancellable = { ...order, fulfillment_status: null, cancelled_at: null };
    let cancelCalls = 0;
    providerFetch.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/orders/9000001001/cancel.json')) {
        cancelCalls += 1;
        throw new Error('A revoked write grant must not reach Shopify cancellation.');
      }
      // Planning binds the cancellation's refund quote into the approval.
      if (url.includes('/orders/9000001001/refunds/calculate.json')) {
        return new Response(JSON.stringify({
          refund: {
            currency: 'USD',
            transactions: [{ kind: 'suggested_refund', gateway: 'manual', amount: '42.00', currency: 'USD', parent_id: 6001 }],
          },
        }), { status: 200 });
      }
      if (url.includes('/orders.json')) {
        return new Response(JSON.stringify({ orders: [cancellable] }), { status: 200 });
      }
      if (url.includes('/orders/9000001001.json')) {
        return new Response(JSON.stringify({ order: cancellable }), { status: 200 });
      }
      if (url.includes('/customers/1234.json')) return customerNotFound();
      throw new Error(`Unexpected external request: ${url}`);
    });

    const org = await createTestOrg();
    testOrgs.track(org.id);
    const settings = { autonomyTier: 'guarded' as const, autoExecuteMode: 'off' as const };
    await db.organization.update({ where: { id: org.id }, data: { settings } });
    const integration = await createTestIntegration(org.id, {
      platform: 'shopify', externalAccountId: shopDomain(), accessToken: 'shpat_test',
      metadata: { oauthScopes: ['read_orders', 'write_orders'] },
    });
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: randomUUID() },
    });
    const customer = await createTestCustomer(org.id, `${randomUUID()}@example.com`);
    const thread = await createTestThread(org.id, customer.id, 'ig_dm', { shopifyCustomerId: '1234' });
    const sourceMessage = await createTestMessage(thread.id, 'Please cancel order #1001.');
    await db.thread.update({
      where: { id: thread.id },
      data: {
        requestSummary: 'Cancel unfulfilled order #1001.',
        requestSourceMessageId: sourceMessage.id,
        classifierSignals: {
          version: 5, language: 'en', intents: { mutative_request: true },
          requestFacts: { ask: 'cancel', order: '#1001' },
        },
      },
    });

    const generated = await generateThreadPlan(org.id, thread.id, false, {
      sourceMessageId: sourceMessage.id,
    });
    expect(generated.plan?.rawToolCalls.map(call => call.name)).toEqual(['cancel_order', 'send_reply']);
    if (reason === 'write_orders') {
      await db.integration.update({
        where: { id: integration.id },
        data: { metadata: { oauthScopes: ['read_orders'] } },
      });
    } else {
      await db.organization.update({
        where: { id: org.id },
        data: { settings: { ...settings, blockCancellations: true } },
      });
    }

    const approve = () => executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings: resolveAgentSettings({
        ...settings,
        ...(reason === 'write_orders' ? {} : { blockCancellations: true }),
      }),
      executionIntent: 'merchant_approved',
      failureRoute: 'test:stale-approval-policy-host',
      approver: { clerkUserId: member.clerkUserId, displayName: 'Test Merchant' },
    }, buildGatewayPlanExecutionDeps());

    if (reason === 'write_orders') {
      await approve();
    } else {
      await expect(approve()).rejects.toThrow('Only current approved plans can be executed');
    }

    expect(cancelCalls).toBe(0);
    if (reason === 'write_orders') {
      const cancellation = await db.agentAction.findFirstOrThrow({
        where: { organizationId: org.id, tool: 'cancel_order' },
      });
      expect(cancellation).toMatchObject({ proposalId: generated.identity!.planId });
      expect({ status: cancellation.status, output: cancellation.output }).toEqual({
        status: 'policy_block', output: expect.stringContaining(reason),
      });
    } else {
      expect(await db.agentAction.count({
        where: { organizationId: org.id, tool: 'cancel_order' },
      })).toBe(0);
    }
    expect(postDashboardInternal.mock.calls.every(([, body]) =>
      !JSON.stringify(body).includes('has been canceled'))).toBe(true);
  });
});
