import { getWorkerTestState } from './worker-test-setup.js';

export function getCapturedHandlers() {
  return getWorkerTestState().capturedHandlers;
}

export function getMockAnthropicCreate() {
  return getWorkerTestState().mockAnthropicCreate;
}

export function getMockFetch() {
  return getWorkerTestState().mockFetch;
}

export function getMockLogger() {
  return getWorkerTestState().mockLogger;
}

export function makeEmailJob(organizationId: string, overrides: Record<string, unknown> = {}) {
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

export function makeIgDmJob(
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

export function makeShopifyJob(
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

export function makeTikTokShopJob(
  organizationId: string,
  options: {
    accountId?: string;
    buyerId?: string;
    conversationId?: string;
    messageId?: string | null;
    text?: string;
    attachments?: Array<{ url: string }>;
  } = {},
) {
  const accountId = options.accountId ?? 'shop_123';
  const buyerId = options.buyerId ?? 'buyer_123';
  const conversationId = options.conversationId ?? 'conversation_123';
  const messageId = options.messageId === undefined ? `tts_mid_${Date.now()}` : options.messageId;

  return {
    id: 'job-tiktok-test',
    data: {
      platform: 'tiktok',
      organizationId,
      traceId: 'trace-tiktok-test',
      rawPayload: {
        event_type: 'buyer_message.created',
        shop_id: accountId,
        data: {
          conversation_id: conversationId,
          buyer_id: buyerId,
          message_id: messageId,
          text: options.text ?? 'Hi from TikTok Shop',
          attachments: options.attachments ?? [],
          sender_type: 'buyer',
        },
      },
      inboundMessageId: messageId ? `tiktok:${accountId}:${messageId}` : null,
    },
  };
}

export function classifierResponse(
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
