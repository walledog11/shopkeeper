import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  normalizeTikTokShopWebhookPayload,
  verifyTikTokShopWebhookSignature,
} from './webhook.js';
import type { TikTokShopWebhookConfig } from './types.js';

const webhookConfig: TikTokShopWebhookConfig = {
  secret: 'webhook-secret',
  signatureAlgorithm: 'sha256',
  signatureEncoding: 'hex',
  signaturePrefix: null,
};

function signBody(body: Buffer, config: TikTokShopWebhookConfig = webhookConfig): string {
  const digest = createHmac(config.signatureAlgorithm, config.secret!)
    .update(body)
    .digest(config.signatureEncoding);
  return `${config.signaturePrefix ?? ''}${digest}`;
}

describe('verifyTikTokShopWebhookSignature', () => {
  it('accepts a valid HMAC signature for the raw request body', () => {
    const body = Buffer.from('{"shop_id":"shop-1","text":"hello"}');
    expect(verifyTikTokShopWebhookSignature({
      body,
      config: webhookConfig,
      signature: signBody(body),
    })).toBe(true);
  });

  it('rejects a tampered body or signature', () => {
    const body = Buffer.from('{"shop_id":"shop-1","text":"hello"}');
    expect(verifyTikTokShopWebhookSignature({
      body,
      config: webhookConfig,
      signature: signBody(Buffer.from('{"shop_id":"shop-1","text":"goodbye"}')),
    })).toBe(false);
    expect(verifyTikTokShopWebhookSignature({
      body,
      config: webhookConfig,
      signature: 'not-a-valid-signature',
    })).toBe(false);
  });

  it('requires both a configured secret and a signature header', () => {
    const body = Buffer.from('payload');
    expect(verifyTikTokShopWebhookSignature({
      body,
      config: { ...webhookConfig, secret: null },
      signature: signBody(body),
    })).toBe(false);
    expect(verifyTikTokShopWebhookSignature({
      body,
      config: webhookConfig,
      signature: '',
    })).toBe(false);
  });

  it('supports prefixed signatures and base64 digests', () => {
    const body = Buffer.from('signed-payload');
    const prefixedConfig: TikTokShopWebhookConfig = {
      secret: 'another-secret',
      signatureAlgorithm: 'sha256',
      signatureEncoding: 'base64',
      signaturePrefix: 'sha256=',
    };

    expect(verifyTikTokShopWebhookSignature({
      body,
      config: prefixedConfig,
      signature: signBody(body, prefixedConfig),
    })).toBe(true);
  });
});

describe('normalizeTikTokShopWebhookPayload', () => {
  it('normalizes a flat buyer message payload', () => {
    expect(normalizeTikTokShopWebhookPayload({
      shop_id: 'shop-1',
      conversation_id: 'conv-1',
      buyer_id: 'buyer-1',
      text: 'Where is my order?',
      message_id: 'msg-1',
      event_type: 'buyer_message',
    })).toEqual({
      accountId: 'shop-1',
      attachments: [],
      buyerId: 'buyer-1',
      conversationId: 'conv-1',
      customerName: null,
      eventType: 'buyer_message',
      isEcho: false,
      messageId: 'msg-1',
      orderId: null,
      productId: null,
      text: 'Where is my order?',
    });
  });

  it('normalizes nested event envelopes and attachment-only messages', () => {
    expect(normalizeTikTokShopWebhookPayload({
      events: [{
        event_type: 'message.received',
        data: {
          shopId: 'shop-2',
          buyerId: 'buyer-2',
          attachments: [{ url: 'https://cdn.example/photo.jpg' }],
        },
      }],
    }, new Set(['message.received']))).toEqual({
      accountId: 'shop-2',
      attachments: ['https://cdn.example/photo.jpg'],
      buyerId: 'buyer-2',
      conversationId: 'buyer-2',
      customerName: null,
      eventType: 'message.received',
      isEcho: false,
      messageId: null,
      orderId: null,
      productId: null,
      text: '[Attachment]',
    });
  });

  it('filters unsupported event types and ignores outbound echoes', () => {
    const inbound = normalizeTikTokShopWebhookPayload({
      shop_id: 'shop-3',
      conversation_id: 'conv-3',
      buyer_id: 'buyer-3',
      text: 'Need help',
      event_type: 'buyer_message',
    }, new Set(['buyer_message']));
    const filtered = normalizeTikTokShopWebhookPayload({
      shop_id: 'shop-3',
      conversation_id: 'conv-3',
      buyer_id: 'buyer-3',
      text: 'Need help',
      event_type: 'order.updated',
    }, new Set(['buyer_message']));
    const echo = normalizeTikTokShopWebhookPayload({
      shop_id: 'shop-3',
      conversation_id: 'conv-3',
      buyer_id: 'buyer-3',
      text: 'Thanks!',
      direction: 'outbound',
    });

    expect(inbound?.text).toBe('Need help');
    expect(filtered).toBeNull();
    expect(echo?.isEcho).toBe(true);
  });

  it('returns null when required identifiers or message content are missing', () => {
    expect(normalizeTikTokShopWebhookPayload({ text: 'hello' })).toBeNull();
    expect(normalizeTikTokShopWebhookPayload({
      shop_id: 'shop-4',
      conversation_id: 'conv-4',
    })).toBeNull();
    expect(normalizeTikTokShopWebhookPayload(null)).toBeNull();
  });
});
