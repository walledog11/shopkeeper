import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestIntegration,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';

// ─── Hoisted mock state ──────────────────────────────────────────────────────
// These must be declared with vi.hoisted so they are available inside vi.mock
// factory functions, which are hoisted above all imports.

const { capturedHandlers, mockAnthropicCreate, mockFetch, mockLogger } = vi.hoisted(() => ({
  capturedHandlers: new Map<string, (job: unknown) => Promise<void>>(),
  mockAnthropicCreate: vi.fn(),
  mockFetch: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.on = vi.fn().mockReturnThis();
    this.set = vi.fn().mockResolvedValue('OK');
    this.get = vi.fn().mockResolvedValue(null);
    this.incrby = vi.fn(async (_key: string, delta: number) => delta);
    this.expire = vi.fn().mockResolvedValue(1);
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

vi.mock('./logger.js', () => ({
  default: mockLogger,
}));

vi.stubGlobal('fetch', mockFetch);

let shutdownWorkerRuntime: (() => Promise<void>) | null = null;

beforeAll(async () => {
  const { startWorkerRuntime } = await import('./worker.js');
  const runtime = await startWorkerRuntime();
  shutdownWorkerRuntime = () => runtime.shutdown();
});

afterAll(async () => {
  await shutdownWorkerRuntime?.();
});

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

function makeIgDmJob(
  organizationId: string,
  senderId = 'ig_sender_001',
  options: { messageMid?: string | null; text?: string } = {},
) {
  const message: { text: string; mid?: string } = {
    text: options.text ?? 'Hi, can you help me?',
  };
  if (options.messageMid !== null) {
    message.mid = options.messageMid ?? `mid_ig_${Date.now()}`;
  }

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
                message,
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
  jobOverrides: Record<string, unknown> = {},
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
      ...jobOverrides,
    },
  };
}
// ─── Tests ───────────────────────────────────────────────────────────────────

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  mockAnthropicCreate.mockReset();
  mockFetch.mockReset();
  vi.mocked(mockLogger.debug).mockClear();
  vi.mocked(mockLogger.error).mockClear();
  vi.mocked(mockLogger.info).mockClear();
  vi.mocked(mockLogger.warn).mockClear();
  // Default fetch mock: IG profile lookup returns no profile (graceful skip)
  mockFetch.mockResolvedValue({ ok: false, json: vi.fn(), text: vi.fn().mockResolvedValue('') });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

function classifierResponse(
  classification: 'genuine' | 'questionable' | 'filtered',
  opts: { summary?: string; tag?: string; reason?: string } = {},
) {
  const payload = {
    summary: opts.summary ?? 'Customer asked about their order.',
    tag: opts.tag ?? 'Order Status',
    classification,
    reason: opts.reason ?? `Looks ${classification}.`,
  };
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] };
}

describe('Message worker — email branch', () => {
  it('persists genuine email with filterStatus + filterDecidedAt set inline', async () => {
    mockAnthropicCreate.mockResolvedValueOnce(
      classifierResponse('genuine', { summary: 'Customer needs shipping help.', tag: 'Shipping' }),
    );

    const handler = capturedHandlers.get('inbound-messages');
    expect(handler).toBeDefined();
    await handler!(makeEmailJob(org.id));

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'customer@example.com' },
    });
    expect(customer).not.toBeNull();

    const thread = await db.thread.findFirst({
      where: { organizationId: org.id, customerId: customer!.id, channelType: ChannelType.email },
    });
    expect(thread?.filterStatus).toBe('genuine');
    expect(thread?.filterReason).toBe('Looks genuine.');
    expect(thread?.filterDecidedAt).not.toBeNull();
    expect(thread?.aiSummary).toBe('Customer needs shipping help.');
    expect(thread?.tag).toBe('Shipping');
  });

  it('persists spam as filtered', async () => {
    mockAnthropicCreate.mockResolvedValueOnce(classifierResponse('filtered', { reason: 'Promotional newsletter.' }));

    const handler = capturedHandlers.get('inbound-messages');
    await handler!(makeEmailJob(org.id));

    const thread = await db.thread.findFirst({ where: { organizationId: org.id, channelType: ChannelType.email } });
    expect(thread?.filterStatus).toBe('filtered');
    expect(thread?.filterReason).toBe('Promotional newsletter.');
  });

  it('persists ambiguous email as questionable', async () => {
    mockAnthropicCreate.mockResolvedValueOnce(classifierResponse('questionable', { reason: 'Cold pitch — unclear if real customer.' }));

    const handler = capturedHandlers.get('inbound-messages');
    await handler!(makeEmailJob(org.id));

    const thread = await db.thread.findFirst({ where: { organizationId: org.id, channelType: ChannelType.email } });
    expect(thread?.filterStatus).toBe('questionable');
    expect(thread?.filterReason).toBe('Cold pitch — unclear if real customer.');
  });

  it('skips classifier and inherits status when customer already has an open thread', async () => {
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
  });

  it('skips classifier when customer has a prior genuine thread (existing-customer bypass)', async () => {
    const existing = await db.customer.create({
      data: { organizationId: org.id, platformId: 'customer@example.com', name: 'Existing' },
    });
    // Prior genuine, but closed — so no open-thread bypass; existing-customer bypass kicks in.
    await db.thread.create({
      data: {
        organizationId: org.id,
        customerId: existing.id,
        channelType: ChannelType.email,
        status: 'closed',
        filterStatus: 'genuine',
        filterDecidedAt: new Date(),
      },
    });

    const handler = capturedHandlers.get('inbound-messages');
    await handler!(makeEmailJob(org.id));

    expect(mockAnthropicCreate).not.toHaveBeenCalled();

    const newThread = await db.thread.findFirst({
      where: { organizationId: org.id, customerId: existing.id, status: 'open', channelType: ChannelType.email },
    });
    expect(newThread?.filterStatus).toBe('genuine');
    expect(newThread?.filterReason).toBe('Existing customer with prior genuine thread');
  });

  it('skips classifier when spamFilterEnabled is false (kill switch)', async () => {
    await db.organization.update({
      where: { id: org.id },
      data: { settings: { spamFilterEnabled: false } },
    });

    const handler = capturedHandlers.get('inbound-messages');
    await handler!(makeEmailJob(org.id));

    expect(mockAnthropicCreate).not.toHaveBeenCalled();

    const thread = await db.thread.findFirst({ where: { organizationId: org.id, channelType: ChannelType.email } });
    // Lock-as-genuine: filterDecidedAt is set at creation so the downstream
    // SUMMARIZE_THREAD path can't reclassify the thread away from genuine.
    expect(thread?.filterStatus).toBe('genuine');
    expect(thread?.filterReason).toBe('Spam filter disabled');
    expect(thread?.filterDecidedAt).not.toBeNull();
  });

  it('does not classify non-email threads (Shopify order events stay genuine)', async () => {
    // The combined classifier prompt would mark "New order #1001 was placed."
    // as 'filtered' (system alert). Filter writes must be gated to email.
    mockAnthropicCreate.mockResolvedValue(classifierResponse('filtered', { reason: 'system alert' }));
    mockFetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}), text: vi.fn().mockResolvedValue('') });

    const customer = await db.customer.create({
      data: { organizationId: org.id, platformId: 'shop_customer@example.com' },
    });
    const thread = await db.thread.create({
      data: { organizationId: org.id, customerId: customer.id, channelType: ChannelType.shopify, status: 'open' },
    });
    await db.message.create({
      data: { threadId: thread.id, organizationId: org.id, senderType: 'customer', contentText: 'New order #1001 was placed.' },
    });

    const aiHandler = capturedHandlers.get('ai-summary');
    await aiHandler!({
      id: 'ai-job-shopify',
      data: {
        threadId: thread.id,
        organizationId: org.id,
        customerName: 'Shop Customer',
        channelType: ChannelType.shopify,
        traceId: 'trace-shopify',
      },
    });

    const after = await db.thread.findUnique({ where: { id: thread.id } });
    expect(after?.filterStatus).toBe('genuine');
    expect(after?.filterDecidedAt).toBeNull();
  });

  it('preserves genuine lock through SUMMARIZE_THREAD when kill switch is on', async () => {
    await db.organization.update({
      where: { id: org.id },
      data: { settings: { spamFilterEnabled: false } },
    });
    // If SUMMARIZE_THREAD called the classifier, it would return 'filtered'.
    // The lock at thread creation must prevent that write.
    mockAnthropicCreate.mockResolvedValue(classifierResponse('filtered', { reason: 'spammy' }));
    mockFetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}), text: vi.fn().mockResolvedValue('') });

    const handler = capturedHandlers.get('inbound-messages');
    await handler!(makeEmailJob(org.id));

    const thread = await db.thread.findFirst({ where: { organizationId: org.id, channelType: ChannelType.email } });
    expect(thread).not.toBeNull();

    const aiHandler = capturedHandlers.get('ai-summary');
    await aiHandler!({
      id: 'ai-job-killswitch',
      data: {
        threadId: thread!.id,
        organizationId: org.id,
        customerName: 'Test Customer',
        channelType: ChannelType.email,
        traceId: 'trace-killswitch',
      },
    });

    const after = await db.thread.findUnique({ where: { id: thread!.id } });
    expect(after?.filterStatus).toBe('genuine');
    expect(after?.filterReason).toBe('Spam filter disabled');
  });

  it('deduplicates messages with the same externalMessageId', async () => {
    mockAnthropicCreate.mockResolvedValue(classifierResponse('genuine'));

    const handler = capturedHandlers.get('inbound-messages');
    const job = makeEmailJob(org.id, { inboundMessageId: 'duplicate-mid-001' });

    await handler!(job);
    await handler!(job); // second call = duplicate

    const messageCount = await db.message.count({
      where: { organizationId: org.id, externalMessageId: 'duplicate-mid-001' },
    });
    expect(messageCount).toBe(1);
  });

  it('allows the same externalMessageId across different organizations', async () => {
    mockAnthropicCreate.mockResolvedValue(classifierResponse('genuine'));

    const handler = capturedHandlers.get('inbound-messages');
    const otherOrg = await createTestOrg();
    const sharedExternalId = 'shared-message-id-across-orgs';

    try {
      await handler!(makeEmailJob(org.id, { inboundMessageId: sharedExternalId }));
      await handler!(makeEmailJob(otherOrg.id, {
        inboundMessageId: sharedExternalId,
        senderEmail: 'other-org-customer@example.com',
      }));

      expect(await db.message.count({
        where: { organizationId: org.id, externalMessageId: sharedExternalId },
      })).toBe(1);
      expect(await db.message.count({
        where: { organizationId: otherOrg.id, externalMessageId: sharedExternalId },
      })).toBe(1);
    } finally {
      await cleanupTestData(otherOrg.id);
    }
  });

  it('keeps repeated identical emails distinct when Postmark omits Message-ID', async () => {
    mockAnthropicCreate.mockResolvedValue(classifierResponse('genuine'));

    const handler = capturedHandlers.get('inbound-messages');
    const job = makeEmailJob(org.id, {
      senderEmail: 'missing-message-id@example.com',
      inboundMessageId: null,
      body: 'Same text sent twice.',
    });

    await handler!(job);
    await handler!(job);

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'missing-message-id@example.com' },
    });
    const thread = await db.thread.findFirst({
      where: { organizationId: org.id, customerId: customer!.id, channelType: ChannelType.email },
    });
    const messages = await db.message.findMany({
      where: { threadId: thread!.id },
      orderBy: { sentAt: 'asc' },
      select: { contentText: true, externalMessageId: true },
    });

    expect(messages).toEqual([
      { contentText: 'Same text sent twice.', externalMessageId: null },
      { contentText: 'Same text sent twice.', externalMessageId: null },
    ]);
  });
});

describe('AI Summary worker — filter gating', () => {
  it('skips plan precompute and WhatsApp notification when filterStatus is questionable', async () => {
    mockAnthropicCreate.mockResolvedValueOnce(classifierResponse('questionable'));

    const fetchUrls: string[] = [];
    mockFetch.mockImplementation((url: string) => {
      fetchUrls.push(String(url));
      return Promise.resolve({ ok: true, json: vi.fn().mockResolvedValue({}), text: vi.fn().mockResolvedValue('') });
    });

    const customer = await db.customer.create({
      data: { organizationId: org.id, platformId: 'questionable@example.com' },
    });
    const thread = await db.thread.create({
      data: { organizationId: org.id, customerId: customer.id, channelType: ChannelType.email, status: 'open' },
    });
    await db.message.create({
      data: { threadId: thread.id, organizationId: org.id, senderType: 'customer', contentText: 'hey there' },
    });

    const aiHandler = capturedHandlers.get('ai-summary');
    expect(aiHandler).toBeDefined();
    await aiHandler!({
      id: 'ai-job',
      data: {
        threadId: thread.id,
        organizationId: org.id,
        customerName: 'Q',
        channelType: ChannelType.email,
        traceId: 'trace-q',
      },
    });

    const planInternalCalls = fetchUrls.filter(u => u.includes('/api/agent/plan-internal'));
    expect(planInternalCalls).toHaveLength(0);

    const updated = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updated?.filterStatus).toBe('questionable');
  });

  it('skips plan precompute and WhatsApp notification when filterStatus is filtered', async () => {
    mockAnthropicCreate.mockResolvedValueOnce(classifierResponse('filtered'));

    const fetchUrls: string[] = [];
    mockFetch.mockImplementation((url: string) => {
      fetchUrls.push(String(url));
      return Promise.resolve({ ok: true, json: vi.fn().mockResolvedValue({}), text: vi.fn().mockResolvedValue('') });
    });

    const customer = await db.customer.create({
      data: { organizationId: org.id, platformId: 'spam@example.com' },
    });
    const thread = await db.thread.create({
      data: { organizationId: org.id, customerId: customer.id, channelType: ChannelType.email, status: 'open' },
    });
    await db.message.create({
      data: { threadId: thread.id, organizationId: org.id, senderType: 'customer', contentText: 'buy now' },
    });

    const aiHandler = capturedHandlers.get('ai-summary');
    await aiHandler!({
      id: 'ai-job-filtered',
      data: {
        threadId: thread.id,
        organizationId: org.id,
        customerName: null,
        channelType: ChannelType.email,
        traceId: 'trace-f',
      },
    });

    const planInternalCalls = fetchUrls.filter(u => u.includes('/api/agent/plan-internal'));
    expect(planInternalCalls).toHaveLength(0);

    const updated = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updated?.filterStatus).toBe('filtered');
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

  it('skips duplicate IG DMs with the same Meta message id', async () => {
    const handler = capturedHandlers.get('inbound-messages');
    const senderId = 'ig_duplicate_sender_001';
    const messageMid = 'mid_ig_duplicate_001';
    const job = makeIgDmJob(org.id, senderId, { messageMid });

    await handler!(job);
    await handler!(job);

    const customerCount = await db.customer.count({
      where: { organizationId: org.id, platformId: senderId },
    });
    expect(customerCount).toBe(1);

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: senderId },
    });
    expect(customer).not.toBeNull();

    const threadCount = await db.thread.count({
      where: { organizationId: org.id, customerId: customer!.id, channelType: ChannelType.ig_dm },
    });
    expect(threadCount).toBe(1);

    const messageCount = await db.message.count({
      where: { externalMessageId: messageMid },
    });
    expect(messageCount).toBe(1);

    const messagesForSender = await db.message.count({
      where: {
        thread: { organizationId: org.id, customerId: customer!.id, channelType: ChannelType.ig_dm },
      },
    });
    expect(messagesForSender).toBe(1);
  });

  it('keeps repeated identical IG DMs distinct when Meta omits message id', async () => {
    const handler = capturedHandlers.get('inbound-messages');
    const senderId = 'ig_missing_mid_sender_001';
    const job = makeIgDmJob(org.id, senderId, {
      messageMid: null,
      text: 'Same IG message sent twice.',
    });

    await handler!(job);
    await handler!(job);

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: senderId },
    });
    const thread = await db.thread.findFirst({
      where: { organizationId: org.id, customerId: customer!.id, channelType: ChannelType.ig_dm },
    });
    const messages = await db.message.findMany({
      where: { threadId: thread!.id },
      orderBy: { sentAt: 'asc' },
      select: { contentText: true, externalMessageId: true },
    });

    expect(messages).toEqual([
      { contentText: 'Same IG message sent twice.', externalMessageId: null },
      { contentText: 'Same IG message sent twice.', externalMessageId: null },
    ]);
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
    const graphCalls = mockFetch.mock.calls.filter(([url]) =>
      String(url).includes('graph.facebook.com')
    );
    expect(graphCalls).toHaveLength(1);
    expect(String(graphCalls[0][0])).toContain('graph.facebook.com');
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
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { traceId: 'trace-shopify-test' },
      '[Worker] Shopify order missing customer identity — dropping',
    );
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

  it('keeps repeated identical Shopify events distinct when no webhook id is available', async () => {
    const handler = capturedHandlers.get('inbound-messages');
    const job = makeShopifyJob(org.id, 'orders/updated', { email: 'shopify-no-id@example.com' });

    await handler!(job);
    await handler!(job);

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'shopify-no-id@example.com' },
    });
    const thread = await db.thread.findFirst({
      where: { organizationId: org.id, customerId: customer!.id, channelType: ChannelType.shopify },
    });
    const messages = await db.message.findMany({
      where: { threadId: thread!.id },
      orderBy: { sentAt: 'asc' },
      select: { contentText: true, externalMessageId: true },
    });

    expect(messages).toEqual([
      { contentText: 'Order #1001 has been updated.', externalMessageId: null },
      { contentText: 'Order #1001 has been updated.', externalMessageId: null },
    ]);
  });

  it('deduplicates Shopify provider retries with the same webhook id', async () => {
    const handler = capturedHandlers.get('inbound-messages');
    const externalMessageId = 'shopify:retry-shop.myshopify.com:duplicate-webhook-001';
    const job = makeShopifyJob(
      org.id,
      'orders/created',
      { email: 'shopify-duplicate@example.com' },
      {},
      { inboundMessageId: externalMessageId },
    );

    await handler!(job);
    await handler!(job);

    const messageCount = await db.message.count({ where: { externalMessageId } });
    expect(messageCount).toBe(1);

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'shopify-duplicate@example.com' },
    });
    const thread = await db.thread.findFirst({
      where: { organizationId: org.id, customerId: customer!.id, channelType: ChannelType.shopify },
    });
    const messagesForThread = await db.message.count({ where: { threadId: thread!.id } });
    expect(messagesForThread).toBe(1);
  });
});
