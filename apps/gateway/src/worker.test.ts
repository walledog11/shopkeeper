import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChannelType, db } from '@clerk/db';
import {
  createTestOrg,
  createTestIntegration,
  cleanupTestData,
} from '@clerk/db/test-helpers';

// ─── Hoisted mock state ──────────────────────────────────────────────────────
// These must be declared with vi.hoisted so they are available inside vi.mock
// factory functions, which are hoisted above all imports.

const { capturedHandlers, mockAnthropicCreate, mockFetch } = vi.hoisted(() => ({
  capturedHandlers: new Map<string, (job: unknown) => Promise<void>>(),
  mockAnthropicCreate: vi.fn(),
  mockFetch: vi.fn(),
}));

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.on = vi.fn().mockReturnThis();
    this.setMaxListeners = vi.fn();
    this.disconnect = vi.fn();
    this.quit = vi.fn().mockResolvedValue('OK');
    this.status = 'ready';
  }),
}));

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
    queueName: string,
    handler: (job: unknown) => Promise<void>,
  ) {
    capturedHandlers.set(queueName, handler);
    this.on = vi.fn();
    this.close = vi.fn().mockResolvedValue(undefined);
  }),
  Queue: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.add = vi.fn().mockResolvedValue({ id: 'mock-summary-job' });
    this.close = vi.fn().mockResolvedValue(undefined);
  }),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.messages = { create: mockAnthropicCreate };
  }),
}));

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
}));

vi.stubGlobal('fetch', mockFetch);

// Import worker.ts last — by this point all mocks are in place.
// The module-level code (Worker creation, top-level awaits) runs but is fully mocked.
await import('./worker.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEmailJob(organizationId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-test',
    data: {
      platform: 'email',
      organizationId,
      senderEmail: 'customer@example.com',
      senderName: 'Test Customer',
      subject: 'I need help with my order',
      body: 'Hello, my package has not arrived yet.',
      inboundMessageId: `mid_${Date.now()}`,
      traceId: 'trace-test',
      ...overrides,
    },
  };
}

function makeIgDmJob(organizationId: string, senderId = 'ig_sender_001') {
  return {
    id: 'job-ig-test',
    data: {
      platform: 'ig_dm',
      organizationId,
      traceId: 'trace-ig-test',
      rawPayload: {
        object: 'instagram',
        entry: [
          {
            id: 'page_123',
            messaging: [
              {
                sender: { id: senderId },
                recipient: { id: 'page_123' },
                message: { text: 'Hi, can you help me?', mid: `mid_ig_${Date.now()}` },
              },
            ],
          },
        ],
      },
    },
  };
}
function makeShopifyJob(
  organizationId: string,
  topic: string,
  customer: { email?: string; id?: number; first_name?: string; last_name?: string } | null,
  orderOverrides: Record<string, unknown> = {},
) {
  return {
    id: 'job-shopify-test',
    data: {
      platform: 'shopify',
      organizationId,
      topic,
      traceId: 'trace-shopify-test',
      rawPayload: {
        name: '#1001',
        order_number: 1001,
        customer,
        ...orderOverrides,
      },
    },
  };
}
// ─── Tests ───────────────────────────────────────────────────────────────────

let org: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  mockAnthropicCreate.mockReset();
  mockFetch.mockReset();
  // Default fetch mock: IG profile lookup returns no profile (graceful skip)
  mockFetch.mockResolvedValue({ ok: false, json: vi.fn(), text: vi.fn().mockResolvedValue('') });
});

afterEach(async () => {
  await cleanupTestData(org.id);
});

describe('Message worker — email branch', () => {
  it('drops spam emails without creating any DB records', async () => {
    // No open thread for this customer → AI spam filter IS called
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ text: 'false' }], // AI classifies as spam
    });

    const handler = capturedHandlers.get('inbound-messages');
    expect(handler, 'message worker handler should be captured').toBeDefined();

    await handler!(makeEmailJob(org.id));

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'customer@example.com' },
    });
    expect(customer).toBeNull();
    expect(mockAnthropicCreate).toHaveBeenCalledOnce();
  });

  it('creates customer + thread + message for a legitimate first email', async () => {
    // AI spam filter returns "true" (is a customer support email)
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ text: 'true' }],
    });

    const handler = capturedHandlers.get('inbound-messages');
    await handler!(makeEmailJob(org.id));

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'customer@example.com' },
    });
    expect(customer).not.toBeNull();
    expect(customer?.name).toBe('Test Customer');

    const thread = await db.thread.findFirst({
      where: { organizationId: org.id, customerId: customer!.id, channelType: ChannelType.email },
    });
    expect(thread).not.toBeNull();
    expect(thread?.status).toBe('open');

    const message = await db.message.findFirst({ where: { threadId: thread!.id } });
    expect(message).not.toBeNull();
    expect(message?.senderType).toBe('customer');
  });

  it('skips the spam filter when the customer already has an open thread', async () => {
    // Pre-create customer + open thread so the spam filter is skipped
    const existingCustomer = await db.customer.create({
      data: { organizationId: org.id, platformId: 'customer@example.com', name: 'Test Customer' },
    });
    await db.thread.create({
      data: {
        organizationId: org.id,
        customerId: existingCustomer.id,
        channelType: ChannelType.email,
        status: 'open',
      },
    });

    const handler = capturedHandlers.get('inbound-messages');
    await handler!(makeEmailJob(org.id));

    expect(mockAnthropicCreate).not.toHaveBeenCalled();

    const messageCount = await db.message.count({
      where: { thread: { organizationId: org.id } },
    });
    expect(messageCount).toBeGreaterThanOrEqual(1);
  });

  it('deduplicates messages with the same externalMessageId', async () => {
    mockAnthropicCreate.mockResolvedValue({ content: [{ text: 'true' }] });

    const handler = capturedHandlers.get('inbound-messages');
    const job = makeEmailJob(org.id, { inboundMessageId: 'duplicate-mid-001' });

    await handler!(job);
    await handler!(job); // second call = duplicate

    const messageCount = await db.message.count({
      where: { externalMessageId: 'duplicate-mid-001' },
    });
    expect(messageCount).toBe(1);
  });
});

describe('Message worker — ig_dm branch', () => {
  it('creates customer + thread + message for a new IG DM', async () => {
    const handler = capturedHandlers.get('inbound-messages');
    await handler!(makeIgDmJob(org.id, 'ig_user_new_001'));

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'ig_user_new_001' },
    });
    expect(customer).not.toBeNull();

    const thread = await db.thread.findFirst({
      where: { organizationId: org.id, customerId: customer!.id, channelType: ChannelType.ig_dm },
    });
    expect(thread).not.toBeNull();
    expect(thread?.status).toBe('open');

    const message = await db.message.findFirst({ where: { threadId: thread!.id } });
    expect(message).not.toBeNull();
    expect(message?.senderType).toBe('customer');
    expect(message?.contentText).toBe('Hi, can you help me?');
  });

  it('adds a new message to an existing open thread for a returning sender', async () => {
    // Pre-create customer + open thread
    const existingCustomer = await db.customer.create({
      data: { organizationId: org.id, platformId: 'ig_returning_001' },
    });
    const existingThread = await db.thread.create({
      data: {
        organizationId: org.id,
        customerId: existingCustomer.id,
        channelType: ChannelType.ig_dm,
        status: 'open',
      },
    });

    const handler = capturedHandlers.get('inbound-messages');
    await handler!(makeIgDmJob(org.id, 'ig_returning_001'));

    const messageCount = await db.message.count({ where: { threadId: existingThread.id } });
    expect(messageCount).toBe(1);

    // Thread should still be the same (not a new one created)
    const threadCount = await db.thread.count({
      where: { organizationId: org.id, customerId: existingCustomer.id, channelType: ChannelType.ig_dm },
    });
    expect(threadCount).toBe(1);
  });

  it('fetches IG profile when integration has an access token', async () => {
    await createTestIntegration(org.id, {
      platform: ChannelType.ig_dm,
      externalAccountId: 'page_123',
      accessToken: 'test-ig-token',
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ name: 'IG User Profile', profile_pic: null }),
    });

    const handler = capturedHandlers.get('inbound-messages');
    await handler!(makeIgDmJob(org.id, 'ig_user_with_profile'));

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'ig_user_with_profile' },
    });
    expect(customer?.name).toBe('IG User Profile');
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(String(mockFetch.mock.calls[0][0])).toContain('graph.facebook.com');
  });

  it('drops echo messages without creating DB records', async () => {
    const handler = capturedHandlers.get('inbound-messages');
    await handler!({
      id: 'job-echo',
      data: {
        platform: 'ig_dm',
        organizationId: org.id,
        rawPayload: {
          entry: [
            {
              messaging: [
                {
                  sender: { id: 'page_123' },
                  message: { text: 'Echo', is_echo: true },
                },
              ],
            },
          ],
        },
      },
    });

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'page_123' },
    });
    expect(customer).toBeNull();
  });
});

describe('Message worker — shopify branch', () => {
  it('creates customer + thread + message for orders/created with customer email', async () => {
    const handler = capturedHandlers.get('inbound-messages');
    await handler!(makeShopifyJob(org.id, 'orders/created', { email: 'jane@shop.com', first_name: 'Jane', last_name: 'Doe' }));

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'jane@shop.com' },
    });
    expect(customer).not.toBeNull();
    expect(customer?.name).toBe('Jane Doe');

    const thread = await db.thread.findFirst({
      where: { organizationId: org.id, customerId: customer!.id, channelType: ChannelType.shopify },
    });
    expect(thread).not.toBeNull();
    expect(thread?.tag).toBe('Order Status');

    const message = await db.message.findFirst({ where: { threadId: thread!.id } });
    expect(message?.contentText).toBe('New order #1001 was placed.');
  });

  it('creates message with correct text for orders/fulfilled', async () => {
    const handler = capturedHandlers.get('inbound-messages');
    await handler!(makeShopifyJob(org.id, 'orders/fulfilled', { email: 'bob@shop.com' }));

    const customer = await db.customer.findFirst({ where: { organizationId: org.id, platformId: 'bob@shop.com' } });
    const thread = await db.thread.findFirst({ where: { customerId: customer!.id } });
    const message = await db.message.findFirst({ where: { threadId: thread!.id } });
    expect(message?.contentText).toBe('Order #1001 has been fulfilled.');
  });

  it('uses shopify_${id} as platformId when customer has no email', async () => {
    const handler = capturedHandlers.get('inbound-messages');
    await handler!(makeShopifyJob(org.id, 'orders/created', { id: 99999, first_name: 'No Email' }));

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'shopify_99999' },
    });
    expect(customer).not.toBeNull();
    expect(customer?.name).toBe('No Email');
  });

  it('drops the event when customer has neither email nor id', async () => {
    const handler = capturedHandlers.get('inbound-messages');
    await handler!(makeShopifyJob(org.id, 'orders/created', null));

    const threads = await db.thread.findMany({
      where: { organizationId: org.id, channelType: ChannelType.shopify },
    });
    expect(threads).toHaveLength(0);
  });

  it('adds a new message to the existing thread for a returning customer', async () => {
    const existingCustomer = await db.customer.create({
      data: { organizationId: org.id, platformId: 'repeat@shop.com', name: 'Repeat Buyer' },
    });
    const existingThread = await db.thread.create({
      data: {
        organizationId: org.id,
        customerId: existingCustomer.id,
        channelType: ChannelType.shopify,
        status: 'open',
        tag: 'Order Status',
      },
    });

    const handler = capturedHandlers.get('inbound-messages');
    await handler!(makeShopifyJob(org.id, 'orders/fulfilled', { email: 'repeat@shop.com' }));

    const customerCount = await db.customer.count({
      where: { organizationId: org.id, platformId: 'repeat@shop.com' },
    });
    expect(customerCount).toBe(1);

    const messageCount = await db.message.count({ where: { threadId: existingThread.id } });
    expect(messageCount).toBe(1);
  });
});
