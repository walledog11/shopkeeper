import { createHash, randomUUID } from 'node:crypto';
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

const order = {
  id: 9000001001,
  name: '#1001',
  created_at: '2026-09-18T10:00:00-07:00',
  financial_status: 'paid',
  fulfillment_status: 'fulfilled',
  current_total_price: '42.00',
  total_price: '42.00',
  currency: 'USD',
  line_items: [{
    id: 7001,
    title: 'Black shirt',
    quantity: 1,
    fulfillable_quantity: 0,
    current_quantity: 1,
    fulfillment_status: 'fulfilled',
    variant_id: 8001,
  }],
  shipping_address: null,
};

const catalogProduct = {
  id: 'gid://shopify/Product/9001',
  title: 'Pencil Half Zip',
  variants: {
    nodes: [{
      id: 'gid://shopify/ProductVariant/9101',
      title: 'Navy / Medium',
      price: '78.00',
      inventoryQuantity: 6,
    }],
  },
};

function toolUse(id: string, name: string, input: Record<string, unknown>) {
  return {
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id, name, input }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  stubDurableAgentRuntimeEnv();

  anthropicCreate
    .mockResolvedValueOnce(toolUse('read-order', 'get_order_by_name', { order_name: '#1001' }))
    .mockResolvedValueOnce(toolUse('reply', 'send_reply', {
      text: 'Order #1001 has shipped.',
    }));

  postDashboardInternal.mockImplementation(async (
    _path: string,
    body: {
      operationId?: string;
      executionId?: string;
      threadId: string;
      input: { text: string };
    },
  ) => ({
    ok: true,
    data: {
      status: 'ok',
      message: 'Reply accepted for delivery.',
      receipt: {
        version: 1,
        operationId: body.operationId,
        executionId: body.executionId,
        tool: 'send_reply',
        target: { kind: 'thread', id: body.threadId },
        observedAt: '2026-09-19T12:00:00.000Z',
        outcome: 'succeeded',
        providerReference: 'provider-message-1',
        facts: {
          logicalResponseId: 'provider-message-1',
          messageId: 'provider-message-1',
          threadId: body.threadId,
          destination: { kind: 'thread', id: body.threadId },
          contentSha256: createHash('sha256').update(body.input.text).digest('hex'),
          deliveryState: 'sent',
          providerMessageId: 'provider-message-1',
        },
      },
    },
  }));

  providerFetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/admin/api/') && url.includes('/orders.json')) {
      return new Response(JSON.stringify({ orders: [order] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/admin/api/') && url.includes('/graphql.json')) {
      return new Response(JSON.stringify({
        data: { products: { nodes: [catalogProduct] } },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`Unexpected external request: ${url}`);
  });
  vi.stubGlobal('fetch', providerFetch);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await testOrgs.cleanupAll();
});

describe('durable order-status host path', () => {
  it('reads the order and sends a task-attributed reply through the gateway host', async () => {
    const org = await createTestOrg();
    testOrgs.track(org.id);
    await db.organization.update({
      where: { id: org.id },
      data: {
        settings: {
          autonomyTier: 'guarded',
          autoExecuteMode: 'off',
        },
      },
    });
    await createTestIntegration(org.id, {
      platform: 'shopify',
      externalAccountId: 'test-store.myshopify.com',
      accessToken: 'shpat_test',
      metadata: { oauthScopes: ['read_orders'] },
    });
    const customer = await createTestCustomer(org.id, `${randomUUID()}@example.com`);
    const thread = await createTestThread(org.id, customer.id, 'ig_dm', {
      shopifyCustomerId: '1234',
    });
    const sourceMessage = await createTestMessage(thread.id, 'Where is order #1001?');
    await db.thread.update({
      where: { id: thread.id },
      data: {
        requestSummary: 'Tell the customer where order #1001 is.',
        requestSourceMessageId: sourceMessage.id,
        classifierSignals: {
          version: 5,
          language: 'en',
          intents: { order_status: true },
          requestFacts: { ask: 'order_status', order: '#1001' },
        },
      },
    });

    const generated = await generateThreadPlan(org.id, thread.id, false, {
      sourceMessageId: sourceMessage.id,
    });

    expect(generated.autoExecutionError).toBeUndefined();
    expect(generated).toMatchObject({
      autoExecuted: true,
      autoExecutionKind: 'safe_reply',
      autoExecutionStatus: 'success',
    });
    expect(generated.plan?.rawToolCalls.map(call => call.name)).toEqual([
      'get_order_by_name',
      'send_reply',
    ]);
    expect(anthropicCreate).toHaveBeenCalledTimes(2);
    expect((anthropicCreate.mock.calls[0]?.[0] as { tools: Array<{ name: string }> }).tools)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'get_order_by_name' }),
        expect.objectContaining({ name: 'discover_capabilities' }),
      ]));
    expect(JSON.stringify((anthropicCreate.mock.calls[1]?.[0] as { messages: unknown }).messages))
      .toContain('fulfilled');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('name=%231001'),
      expect.anything(),
    );

    const request = await db.agentRequest.findFirstOrThrow({
      where: { organizationId: org.id, sourceMessageId: sourceMessage.id },
    });
    const task = await db.agentTask.findFirstOrThrow({
      where: { id: request.taskId! },
    });
    expect(task.status).toBe('completed');

    expect(postDashboardInternal).toHaveBeenCalledWith(
      '/api/agent/io-send-internal',
      expect.objectContaining({
        orgId: org.id,
        threadId: thread.id,
        op: 'send_reply',
        input: { text: 'Order #1001 has shipped.' },
        agentRequestId: request.id,
        agentTaskId: task.id,
        operationId: expect.any(String),
        executionId: expect.any(String),
      }),
      expect.objectContaining({ requestId: expect.any(String) }),
    );
    expect(await db.agentAction.findFirstOrThrow({
      where: { organizationId: org.id, tool: 'send_reply' },
    })).toMatchObject({
      turnId: request.id,
      taskId: task.id,
      status: 'success',
      receiptVersion: 1,
    });
  });

  it('reads policy evidence and sends a task-attributed answer through the gateway host', async () => {
    anthropicCreate.mockReset();
    anthropicCreate
      .mockResolvedValueOnce(toolUse('read-policy', 'search_kb', { query: 'return policy' }))
      .mockResolvedValueOnce(toolUse('reply', 'send_reply', {
        text: 'Unused items can be returned within 30 days.',
      }));

    const org = await createTestOrg();
    testOrgs.track(org.id);
    await db.organization.update({
      where: { id: org.id },
      data: {
        settings: {
          autonomyTier: 'guarded',
          autoExecuteMode: 'off',
        },
      },
    });
    const knowledgeBase = await db.knowledgeBase.create({
      data: { organizationId: org.id, name: 'Policies' },
    });
    const article = await db.kbArticle.create({
      data: {
        organizationId: org.id,
        knowledgeBaseId: knowledgeBase.id,
        title: 'Return policy',
        body: 'Unused items can be returned within 30 days.',
        tags: ['returns'],
      },
    });
    const customer = await createTestCustomer(org.id, `${randomUUID()}@example.com`);
    const thread = await createTestThread(org.id, customer.id, 'ig_dm');
    const sourceMessage = await createTestMessage(thread.id, 'What is your return policy?');
    await db.thread.update({
      where: { id: thread.id },
      data: {
        requestSummary: 'Answer the customer\'s return-policy question.',
        requestSourceMessageId: sourceMessage.id,
        classifierSignals: {
          version: 5,
          language: 'en',
          intents: { policy_question: true },
          requestFacts: { ask: 'policy_question' },
        },
      },
    });

    const generated = await generateThreadPlan(org.id, thread.id, false, {
      sourceMessageId: sourceMessage.id,
    });

    expect(generated).toMatchObject({
      autoExecuted: true,
      autoExecutionKind: 'safe_reply',
      autoExecutionStatus: 'success',
    });
    expect(generated.plan?.rawToolCalls.map(call => call.name)).toEqual([
      'search_kb',
      'send_reply',
    ]);
    expect(JSON.stringify((anthropicCreate.mock.calls[1]?.[0] as { messages: unknown }).messages))
      .toContain('Unused items can be returned within 30 days.');

    const request = await db.agentRequest.findFirstOrThrow({
      where: { organizationId: org.id, sourceMessageId: sourceMessage.id },
    });
    const task = await db.agentTask.findFirstOrThrow({ where: { id: request.taskId! } });
    expect(task.status).toBe('completed');
    expect(await db.kbCitation.findFirstOrThrow({
      where: { organizationId: org.id, threadId: thread.id, kbArticleId: article.id },
    })).toMatchObject({ kbArticleId: article.id });
    expect(postDashboardInternal).toHaveBeenCalledWith(
      '/api/agent/io-send-internal',
      expect.objectContaining({
        orgId: org.id,
        threadId: thread.id,
        op: 'send_reply',
        input: { text: 'Unused items can be returned within 30 days.' },
        agentRequestId: request.id,
        agentTaskId: task.id,
      }),
      expect.anything(),
    );
  });

  it('reads the product catalog and grounds a task-attributed answer in the provider result', async () => {
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
      externalAccountId: 'test-store.myshopify.com',
      accessToken: 'shpat_test',
      metadata: { oauthScopes: ['read_products'] },
    });
    const customer = await createTestCustomer(org.id, `${randomUUID()}@example.com`);
    const thread = await createTestThread(org.id, customer.id, 'ig_dm');
    const sourceMessage = await createTestMessage(
      thread.id,
      'Do you have the Pencil Half Zip in navy, medium?',
    );
    await db.thread.update({
      where: { id: thread.id },
      data: {
        requestSummary: 'Answer the product availability question.',
        requestSourceMessageId: sourceMessage.id,
        classifierSignals: {
          version: 5,
          language: 'en',
          intents: {},
          requestFacts: { ask: 'product_question', subject: 'Pencil Half Zip' },
        },
      },
    });

    const generated = await generateThreadPlan(org.id, thread.id, false, {
      sourceMessageId: sourceMessage.id,
    });

    expect(generated).toMatchObject({
      autoExecuted: true,
      autoExecutionKind: 'safe_reply',
      autoExecutionStatus: 'success',
    });
    expect(generated.plan?.rawToolCalls.map(call => call.name)).toEqual([
      'search_shopify_products',
      'send_reply',
    ]);
    expect(JSON.stringify((anthropicCreate.mock.calls[1]?.[0] as { messages: unknown }).messages))
      .toContain('Navy / Medium');

    const productRequest = providerFetch.mock.calls.find(([input]) => String(input).includes('/graphql.json'));
    expect(productRequest).toBeDefined();
    expect(JSON.parse(String((productRequest?.[1] as RequestInit).body))).toMatchObject({
      variables: { query: 'Pencil Half Zip', first: 5 },
    });

    const request = await db.agentRequest.findFirstOrThrow({
      where: { organizationId: org.id, sourceMessageId: sourceMessage.id },
    });
    const task = await db.agentTask.findFirstOrThrow({ where: { id: request.taskId! } });
    expect(task.status).toBe('completed');
    expect(postDashboardInternal).toHaveBeenCalledWith(
      '/api/agent/io-send-internal',
      expect.objectContaining({
        orgId: org.id,
        threadId: thread.id,
        input: { text: 'The Pencil Half Zip is available in Navy, size Medium.' },
        agentRequestId: request.id,
        agentTaskId: task.id,
      }),
      expect.anything(),
    );
  });

  it('asks for the missing order reference without inventing or reading an order', async () => {
    anthropicCreate.mockReset();
    anthropicCreate.mockResolvedValueOnce(toolUse('reply', 'send_reply', {
      text: 'What is the order number?',
      await_response: true,
    }));

    const org = await createTestOrg();
    testOrgs.track(org.id);
    await db.organization.update({
      where: { id: org.id },
      data: { settings: { autonomyTier: 'guarded', autoExecuteMode: 'off' } },
    });
    const customer = await createTestCustomer(org.id, `${randomUUID()}@example.com`);
    const thread = await createTestThread(org.id, customer.id, 'ig_dm');
    const sourceMessage = await createTestMessage(thread.id, 'Where is my order?');
    await db.thread.update({
      where: { id: thread.id },
      data: {
        requestSummary: 'Answer the customer\'s order-status question.',
        requestSourceMessageId: sourceMessage.id,
        classifierSignals: {
          version: 5,
          language: 'en',
          intents: { order_status: true },
          requestFacts: { ask: 'order_status', order: null },
        },
      },
    });

    const generated = await generateThreadPlan(org.id, thread.id, false, {
      sourceMessageId: sourceMessage.id,
    });

    expect(generated.plan?.rawToolCalls).toEqual([
      expect.objectContaining({
        name: 'send_reply',
        input: { text: 'What is the order number?', await_response: true },
      }),
    ]);
    expect(providerFetch).not.toHaveBeenCalled();
    const request = await db.agentRequest.findFirstOrThrow({
      where: { organizationId: org.id, sourceMessageId: sourceMessage.id },
    });
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: request.taskId! } }))
      .toMatchObject({
        status: 'waiting_input',
        pendingQuestion: 'What is the order number?',
        pendingAnswererKind: 'customer',
        pendingAnswererKey: `customer:${customer.id}`,
      });
    expect(postDashboardInternal).toHaveBeenCalledWith(
      '/api/agent/io-send-internal',
      expect.objectContaining({
        input: { text: 'What is the order number?', await_response: true },
        agentRequestId: request.id,
        agentTaskId: request.taskId,
      }),
      expect.anything(),
    );
  });

  it('states that policy evidence is missing instead of inventing an answer', async () => {
    anthropicCreate.mockReset();
    anthropicCreate
      .mockResolvedValueOnce(toolUse('read-policy', 'search_kb', { query: 'international returns' }))
      .mockResolvedValueOnce(toolUse('reply', 'send_reply', {
        text: 'I could not find an international returns policy, so I need to check with the team.',
      }));

    const org = await createTestOrg();
    testOrgs.track(org.id);
    await db.organization.update({
      where: { id: org.id },
      data: { settings: { autonomyTier: 'guarded', autoExecuteMode: 'off' } },
    });
    const customer = await createTestCustomer(org.id, `${randomUUID()}@example.com`);
    const thread = await createTestThread(org.id, customer.id, 'ig_dm');
    const sourceMessage = await createTestMessage(
      thread.id,
      'Can an international order be returned?',
    );
    await db.thread.update({
      where: { id: thread.id },
      data: {
        requestSummary: 'Answer the international-return policy question.',
        requestSourceMessageId: sourceMessage.id,
        classifierSignals: {
          version: 5,
          language: 'en',
          intents: { policy_question: true },
          requestFacts: { ask: 'policy_question' },
        },
      },
    });

    const generated = await generateThreadPlan(org.id, thread.id, false, {
      sourceMessageId: sourceMessage.id,
    });

    expect(generated.plan?.rawToolCalls.map(call => call.name)).toEqual([
      'search_kb',
      'send_reply',
    ]);
    expect(JSON.stringify((anthropicCreate.mock.calls[1]?.[0] as { messages: unknown }).messages))
      .toContain('No knowledge base articles found for that query.');
    const request = await db.agentRequest.findFirstOrThrow({
      where: { organizationId: org.id, sourceMessageId: sourceMessage.id },
    });
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: request.taskId! } }))
      .toMatchObject({ status: 'waiting_input', pendingAnswererKind: 'member' });
    expect(await db.kbCitation.count({ where: { organizationId: org.id, threadId: thread.id } }))
      .toBe(0);
    expect(postDashboardInternal).not.toHaveBeenCalled();
  });

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
      externalAccountId: 'test-store.myshopify.com',
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
      externalAccountId: 'test-store.myshopify.com',
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
    const cancelled = {
      ...cancellable,
      cancelled_at: '2026-09-20T12:00:00Z',
      cancel_reason: 'customer',
      financial_status: 'refunded',
    };
    let cancelCalls = 0;
    providerFetch.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/orders/9000001001/cancel.json')) {
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
      externalAccountId: 'test-store.myshopify.com',
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
    expect(generated.plan?.rawToolCalls.map(call => call.name)).toEqual(['cancel_order']);
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
      expect(executed.result.actionsPerformed).toMatchObject([
        { tool: 'cancel_order', status: 'unknown' },
      ]);
      expect(executed.result.actionsPerformed).toHaveLength(1);
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
    expect(executed.execution.status).toBe(
      delivery === 'sent' ? 'committed' : delivery === 'failed' ? 'partial' : 'unknown',
    );
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
      .toBe(delivery === 'sent' ? 'completed' : delivery === 'failed' ? 'failed' : 'reconciling');
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
      if (url.includes('/orders/9000001001.json')) {
        return new Response(JSON.stringify({ order: currentOrder }), { status: 200 });
      }
      if (url.includes('/orders.json')) {
        return new Response(JSON.stringify({ orders: [currentOrder] }), { status: 200 });
      }
      throw new Error(`Unexpected external request: ${url}`);
    });

    const org = await createTestOrg();
    testOrgs.track(org.id);
    const settings = { autonomyTier: 'guarded' as const, autoExecuteMode: 'off' as const };
    await db.organization.update({ where: { id: org.id }, data: { settings } });
    await createTestIntegration(org.id, {
      platform: 'shopify', externalAccountId: 'test-store.myshopify.com', accessToken: 'shpat_test',
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
    expect(generated.plan?.rawToolCalls.map(call => call.name)).toEqual(['cancel_order']);
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
      if (url.includes('/orders.json')) {
        return new Response(JSON.stringify({ orders: [cancellable] }), { status: 200 });
      }
      if (url.includes('/orders/9000001001.json')) {
        return new Response(JSON.stringify({ order: cancellable }), { status: 200 });
      }
      throw new Error(`Unexpected external request: ${url}`);
    });

    const org = await createTestOrg();
    testOrgs.track(org.id);
    const settings = { autonomyTier: 'guarded' as const, autoExecuteMode: 'off' as const };
    await db.organization.update({ where: { id: org.id }, data: { settings } });
    const integration = await createTestIntegration(org.id, {
      platform: 'shopify', externalAccountId: 'test-store.myshopify.com', accessToken: 'shpat_test',
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
    expect(generated.plan?.rawToolCalls.map(call => call.name)).toEqual(['cancel_order']);
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
      throw new Error(`Unexpected external request: ${url}`);
    });

    const org = await createTestOrg();
    testOrgs.track(org.id);
    const settings = { autonomyTier: 'guarded' as const, autoExecuteMode: 'off' as const };
    await db.organization.update({ where: { id: org.id }, data: { settings } });
    await createTestIntegration(org.id, {
      platform: 'shopify', externalAccountId: 'test-store.myshopify.com', accessToken: 'shpat_test',
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
    expect(generated.plan?.rawToolCalls.map(call => call.name)).toEqual(['create_refund']);

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
      output: expect.stringContaining('refundable balance'),
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
      throw new Error(`Unexpected external request: ${url}`);
    });

    const org = await createTestOrg();
    testOrgs.track(org.id);
    const settings = { autonomyTier: 'guarded' as const, autoExecuteMode: 'off' as const };
    await db.organization.update({ where: { id: org.id }, data: { settings } });
    await createTestIntegration(org.id, {
      platform: 'shopify', externalAccountId: 'test-store.myshopify.com', accessToken: 'shpat_test',
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
    expect(generated.plan?.rawToolCalls.map(call => call.name)).toEqual(['create_partial_refund']);
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
      throw new Error(`Unexpected external request: ${url}`);
    });

    const org = await createTestOrg();
    testOrgs.track(org.id);
    const settings = { autonomyTier: 'guarded' as const, autoExecuteMode: 'off' as const };
    await db.organization.update({ where: { id: org.id }, data: { settings } });
    await createTestIntegration(org.id, {
      platform: 'shopify', externalAccountId: 'test-store.myshopify.com', accessToken: 'shpat_test',
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
      throw new Error(`Unexpected external request: ${url}`);
    });

    const org = await createTestOrg();
    testOrgs.track(org.id);
    const settings = { autonomyTier: 'guarded' as const, autoExecuteMode: 'off' as const };
    await db.organization.update({ where: { id: org.id }, data: { settings } });
    await createTestIntegration(org.id, {
      platform: 'shopify',
      externalAccountId: 'test-store.myshopify.com',
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
    expect(generated.plan?.rawToolCalls.map(call => call.name)).toEqual(['create_return']);
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
      expect(executed.result.actionsPerformed).toMatchObject([
        { tool: 'create_return', status: 'unknown' },
      ]);
      expect(executed.result.actionsPerformed).toHaveLength(1);
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
      throw new Error(`Unexpected external request: ${url}`);
    });

    const org = await createTestOrg();
    testOrgs.track(org.id);
    const settings = { autonomyTier: 'guarded' as const, autoExecuteMode: 'off' as const };
    await db.organization.update({ where: { id: org.id }, data: { settings } });
    await createTestIntegration(org.id, {
      platform: 'shopify',
      externalAccountId: 'test-store.myshopify.com',
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
    expect(generated.plan?.rawToolCalls.map(call => call.name)).toEqual(['create_exchange']);
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
      expect(executed.result.actionsPerformed).toMatchObject([
        { tool: 'create_exchange', status: 'unknown' },
      ]);
      expect(executed.result.actionsPerformed).toHaveLength(1);
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
