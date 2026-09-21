import { createHash, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestIntegration,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';

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

const orgIds: string[] = [];
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
  vi.stubEnv('AGENT_RUNTIME_VERSION', '2');
  // Task routing owns both behaviors even while the legacy process flags stay
  // off, which is the production-compatible rollout shape.
  vi.stubEnv('AGENT_CAPABILITY_DISCOVERY_MODE', 'off');
  vi.stubEnv('AGENT_PROPOSAL_SUSPENSION_MODE', 'off');
  vi.stubEnv('PLAN_EXECUTION_LEDGER_MODE', 'enforce');

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
  for (const id of orgIds.splice(0)) await cleanupTestData(id);
});

describe('durable order-status host path', () => {
  it('reads the order and sends a task-attributed reply through the gateway host', async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
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
    orgIds.push(org.id);
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
    orgIds.push(org.id);
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
    }));

    const org = await createTestOrg();
    orgIds.push(org.id);
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
      expect.objectContaining({ name: 'send_reply', input: { text: 'What is the order number?' } }),
    ]);
    expect(providerFetch).not.toHaveBeenCalled();
    const request = await db.agentRequest.findFirstOrThrow({
      where: { organizationId: org.id, sourceMessageId: sourceMessage.id },
    });
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: request.taskId! } }))
      .toMatchObject({ status: 'completed' });
    expect(postDashboardInternal).toHaveBeenCalledWith(
      '/api/agent/io-send-internal',
      expect.objectContaining({
        input: { text: 'What is the order number?' },
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
    orgIds.push(org.id);
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
    orgIds.push(org.id);
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

  it('executes an approved address change from the durable proposal and replies from its receipt', async () => {
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
        text: 'I updated the shipping address for order #1001 to 123 Main St, Los Angeles, CA 90001.',
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
    providerFetch.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/orders/9000001001.json')) {
        return new Response(JSON.stringify({
          order: method === 'PUT'
            ? { ...addressOrder, shipping_address: newAddress }
            : addressOrder,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('/customers/1234/addresses/789.json')) {
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
    orgIds.push(org.id);
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

    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings: resolveAgentSettings(settings),
      executionIntent: 'merchant_approved',
      failureRoute: 'test:address-host',
      approver: { clerkUserId: member.clerkUserId, displayName: 'Test Merchant' },
    }, buildGatewayPlanExecutionDeps());

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

  it('executes an approved cancellation once and grounds the reply in confirmed Shopify state', async () => {
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
        return new Response(JSON.stringify({ order: cancelled }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/orders/9000001001.json')) {
        return new Response(JSON.stringify({ order: cancelCalls > 0 ? cancelled : cancellable }), {
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
    orgIds.push(org.id);
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

    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings: resolveAgentSettings(settings),
      executionIntent: 'merchant_approved',
      failureRoute: 'test:cancellation-host',
      approver: { clerkUserId: member.clerkUserId, displayName: 'Test Merchant' },
    }, buildGatewayPlanExecutionDeps());

    expect(cancelCalls).toBe(1);
    expect(executed.execution.status).toBe('committed');
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
    expect(postDashboardInternal).toHaveBeenCalledWith(
      '/api/agent/io-send-internal',
      expect.objectContaining({
        agentTaskId: cancellation.taskId,
        input: { text: 'Order #1001 has been canceled.' },
      }),
      expect.anything(),
    );
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: cancellation.taskId! } })).status)
      .toBe('completed');
  });
});
