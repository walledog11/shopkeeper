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

describe('durable order-status host path', () => {
  it('keeps a revised customer instruction from running the superseded order-status job', async () => {
    anthropicCreate.mockReset();
    anthropicCreate
      .mockResolvedValueOnce(toolUse('read-product', 'search_shopify_products', {
        query: 'Pencil Half Zip',
      }))
      .mockResolvedValueOnce(toolUse('reply', 'send_reply', {
        text: 'The Pencil Half Zip is available in Navy, size Medium.',
      }));

    const org = await createTestOrg();
    testOrgs.track(org.id);
    await db.organization.update({
      where: { id: org.id },
      data: { settings: { autonomyTier: 'guarded', autoExecuteMode: 'off' } },
    });
    await createTestIntegration(org.id, {
      platform: 'shopify',
      externalAccountId: shopDomain(),
      accessToken: 'shpat_test',
      metadata: { oauthScopes: ['read_orders', 'read_products'] },
    });
    const customer = await createTestCustomer(org.id, `${randomUUID()}@example.com`);
    const thread = await createTestThread(org.id, customer.id, 'ig_dm');
    const oldMessage = await createTestMessage(thread.id, 'Where is order #1001?');
    const revisedMessage = await createTestMessage(
      thread.id,
      'Actually, do you have the Pencil Half Zip in navy, medium?',
    );
    await db.thread.update({
      where: { id: thread.id },
      data: {
        requestSummary: 'Answer the latest product availability question.',
        requestSourceMessageId: revisedMessage.id,
        classifierSignals: {
          version: 5,
          language: 'en',
          intents: {},
          requestFacts: { ask: 'product_question', subject: 'Pencil Half Zip' },
        },
      },
    });

    const stale = await generateThreadPlan(org.id, thread.id, false, {
      sourceMessageId: oldMessage.id,
    });
    const current = await generateThreadPlan(org.id, thread.id, false, {
      sourceMessageId: revisedMessage.id,
    });

    expect(stale.plan).toBeNull();
    expect(current.plan?.rawToolCalls.map(call => call.name)).toEqual([
      'search_shopify_products',
      'send_reply',
    ]);
    expect(anthropicCreate).toHaveBeenCalledTimes(2);
    expect(await db.agentRequest.count({ where: { organizationId: org.id } })).toBe(1);
    expect(await db.agentRequest.findFirstOrThrow({ where: { organizationId: org.id } }))
      .toMatchObject({ sourceMessageId: revisedMessage.id });
    expect(providerFetch).toHaveBeenCalledTimes(1);
    expect(String(providerFetch.mock.calls[0]?.[0])).toContain('/graphql.json');
  });

  it.each([
    { change: 'none', fulfillmentAfterApproval: null, customerAfterApproval: 1234, customerSyncFails: false },
    { change: 'fulfilled', fulfillmentAfterApproval: 'fulfilled', customerAfterApproval: 1234, customerSyncFails: false },
    { change: 'partially fulfilled', fulfillmentAfterApproval: 'partial', customerAfterApproval: 1234, customerSyncFails: false },
    { change: 'different order customer', fulfillmentAfterApproval: null, customerAfterApproval: 9999, customerSyncFails: false },
    { change: 'customer profile sync failure', fulfillmentAfterApproval: null, customerAfterApproval: 1234, customerSyncFails: true },
  ])('handles an approved address change after $change', async ({ fulfillmentAfterApproval, customerAfterApproval, customerSyncFails }) => {
    anthropicCreate.mockReset();
    anthropicCreate
      .mockResolvedValueOnce(toolUse('discover-address', 'discover_capabilities', {
        capability: 'change an order shipping address',
      }))
      .mockResolvedValueOnce(toolUse('change-address', 'update_shopify_order_address', {
        order_id: '9000001001',
        customer_id: '1234',
        address1: '123 Main St',
        city: 'Los Angeles',
        province: 'CA',
        zip: '90001',
        country: 'United States',
      }))
      .mockResolvedValueOnce(toolUse('reply', 'send_reply', {
        text: 'The address for order #1001 has been updated.',
      }));

    const oldAddress = {
      id: 789,
      address1: '10 Old St',
      city: 'Los Angeles',
      province: 'California',
      province_code: 'CA',
      zip: '90002',
      country: 'United States',
      country_code: 'US',
    };
    const newAddress = {
      id: 789,
      address1: '123 Main St',
      city: 'Los Angeles',
      province: 'California',
      province_code: 'CA',
      zip: '90001',
      country: 'United States',
      country_code: 'US',
    };
    const addressOrder = {
      ...order,
      fulfillment_status: null,
      customer: { id: 1234 },
      shipping_address: oldAddress,
    };
    let currentFulfillment: string | null = null;
    let currentCustomerId = 1234;
    let orderUpdateCalls = 0;
    providerFetch.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/orders/9000001001.json')) {
        if (method === 'PUT') orderUpdateCalls += 1;
        return new Response(JSON.stringify({
          order: method === 'PUT'
            ? { ...addressOrder, shipping_address: newAddress }
            : { ...addressOrder, fulfillment_status: currentFulfillment, customer: { id: currentCustomerId } },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('/customers/1234/addresses/789.json')) {
        if (customerSyncFails && method === 'PUT') {
          return new Response(JSON.stringify({ errors: 'Address rejected' }), { status: 422 });
        }
        return new Response(JSON.stringify({ customer_address: newAddress }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/customers/1234.json')) {
        return new Response(JSON.stringify({ customer: { id: 1234, default_address: oldAddress } }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/orders.json')) {
        return new Response(JSON.stringify({ orders: [addressOrder] }), {
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
      metadata: { oauthScopes: ['read_orders', 'write_orders', 'read_customers', 'write_customers'] },
    });
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: randomUUID() },
    });
    const customer = await createTestCustomer(org.id, `${randomUUID()}@example.com`);
    const thread = await createTestThread(org.id, customer.id, 'ig_dm', { shopifyCustomerId: '1234' });
    const sourceMessage = await createTestMessage(
      thread.id,
      'Please change the shipping address on order #1001 to 123 Main St, Los Angeles, CA 90001.',
    );
    await db.thread.update({
      where: { id: thread.id },
      data: {
        requestSummary: 'Change the shipping address for order #1001.',
        requestSourceMessageId: sourceMessage.id,
        classifierSignals: {
          version: 5,
          language: 'en',
          intents: { mutative_request: true },
          requestFacts: { ask: 'address_change', order: '#1001' },
        },
      },
    });

    const generated = await generateThreadPlan(org.id, thread.id, false, {
      sourceMessageId: sourceMessage.id,
    });
    expect(generated.identity?.planId).toEqual(expect.any(String));
    expect(generated.plan?.rawToolCalls.map(call => call.name)).toEqual([
      'update_shopify_order_address',
      'send_reply',
    ]);
    expect(await db.agentTask.findFirstOrThrow({ where: { organizationId: org.id } }))
      .toMatchObject({ status: 'waiting_approval', activeProposalId: generated.identity!.planId });
    currentFulfillment = fulfillmentAfterApproval;
    currentCustomerId = customerAfterApproval;

    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings: resolveAgentSettings(settings),
      executionIntent: 'merchant_approved',
      failureRoute: 'test:address-host',
      approver: { clerkUserId: member.clerkUserId, displayName: 'Test Merchant' },
    }, buildGatewayPlanExecutionDeps());

    if (fulfillmentAfterApproval || customerAfterApproval !== 1234) {
      expect(orderUpdateCalls).toBe(0);
      const blocked = await db.agentAction.findFirstOrThrow({
        where: { organizationId: org.id, tool: 'update_shopify_order_address' },
      });
      expect(blocked).toMatchObject({
        proposalId: generated.identity!.planId,
        status: 'policy_block',
        receiptVersion: 1,
        receipt: {
          outcome: 'rejected',
          code: fulfillmentAfterApproval ? 'order_already_fulfilled' : 'customer_order_mismatch',
        },
      });
      expect(postDashboardInternal.mock.calls.every(([, body]) =>
        !JSON.stringify(body).includes('has been updated'))).toBe(true);
      return;
    }
    if (customerSyncFails) {
      expect(orderUpdateCalls).toBe(1);
      const partial = await db.agentAction.findFirstOrThrow({
        where: { organizationId: org.id, tool: 'update_shopify_order_address' },
      });
      expect(partial).toMatchObject({
        proposalId: generated.identity!.planId,
        status: 'unknown',
        receiptVersion: 1,
        receipt: {
          outcome: 'unknown',
          code: 'customer_sync_failed_after_order_update',
          facts: {
            orderAddress: { outcome: 'updated' },
            customerDefaultAddress: { outcome: 'failed' },
          },
        },
      });
      expect(postDashboardInternal.mock.calls.every(([, body]) =>
        !JSON.stringify(body).includes('has been updated'))).toBe(true);
      return;
    }

    expect(executed.execution.status).toBe('committed');
    expect(executed.result.actionsPerformed.map(action => action.tool)).toEqual([
      'update_shopify_order_address',
      'send_reply',
    ]);
    const addressAction = await db.agentAction.findFirstOrThrow({
      where: { organizationId: org.id, tool: 'update_shopify_order_address' },
    });
    expect(addressAction).toMatchObject({
      taskId: expect.any(String),
      proposalId: generated.identity!.planId,
      status: 'success',
      receiptVersion: 1,
      dispatchState: 'settled',
    });
    expect(addressAction.receipt).toMatchObject({
      outcome: 'succeeded',
      facts: {
        orderId: '9000001001',
        customerId: '1234',
        orderAddress: {
          outcome: 'updated',
          address: { address1: '123 Main St', province: 'California', provinceCode: 'CA' },
        },
        customerDefaultAddress: { outcome: 'updated', addressId: '789' },
      },
    });
    expect(postDashboardInternal).toHaveBeenCalledWith(
      '/api/agent/io-send-internal',
      expect.objectContaining({
        orgId: org.id,
        threadId: thread.id,
        input: {
          text: 'The address for order #1001 has been updated.',
        },
        agentTaskId: addressAction.taskId,
      }),
      expect.anything(),
    );
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: addressAction.taskId! } })).status)
      .toBe('completed');
  });
});
