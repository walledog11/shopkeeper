import { createHmac, timingSafeEqual } from 'node:crypto';

import { isRecord } from '@shopkeeper/agent/guards';

import type { NormalizedTikTokShopMessage, TikTokShopWebhookConfig } from './types.js';

export function verifyTikTokShopWebhookSignature({
  body,
  config,
  signature,
}: {
  body: Buffer;
  config: TikTokShopWebhookConfig;
  signature: string;
}): boolean {
  const secret = config.secret;
  if (!secret || !signature) return false;

  const expectedDigest = createHmac(config.signatureAlgorithm, secret)
    .update(body)
    .digest(config.signatureEncoding);
  const expected = `${config.signaturePrefix ?? ''}${expectedDigest}`;
  const trusted = Buffer.from(expected, 'utf8');
  const received = Buffer.from(signature, 'utf8');
  return trusted.length === received.length && timingSafeEqual(trusted, received);
}

export function normalizeTikTokShopWebhookPayload(
  payload: unknown,
  messageEventNames: Set<string> = new Set(),
): NormalizedTikTokShopMessage | null {
  const event = findFirstMessageEvent(payload);
  if (!event) return null;

  const eventType = readString(event, 'event_type', 'eventType', 'type', 'event');
  if (messageEventNames.size > 0 && eventType && !messageEventNames.has(eventType)) return null;

  const message = readObject(event, 'message')
    ?? readObject(event, 'data')
    ?? readObject(event, 'payload')
    ?? event;
  const accountId =
    readString(event, 'shop_id', 'shopId', 'seller_id', 'sellerId')
    ?? readString(message, 'shop_id', 'shopId', 'seller_id', 'sellerId');
  const conversationId =
    readString(message, 'conversation_id', 'conversationId', 'conversation_id_str', 'thread_id', 'threadId')
    ?? readString(event, 'conversation_id', 'conversationId', 'thread_id', 'threadId');
  const buyerId =
    readString(message, 'buyer_id', 'buyerId', 'customer_id', 'customerId', 'sender_id', 'senderId')
    ?? readString(event, 'buyer_id', 'buyerId', 'customer_id', 'customerId', 'sender_id', 'senderId');

  if (!accountId || !conversationId && !buyerId) return null;

  const attachments = readAttachmentUrls(message);
  const text = readMessageText(message);
  if (!text && attachments.length === 0) return null;

  return {
    accountId,
    attachments,
    buyerId,
    conversationId: conversationId ?? buyerId!,
    customerName: readString(message, 'buyer_name', 'buyerName', 'customer_name', 'customerName', 'sender_name', 'senderName'),
    eventType,
    isEcho: isEchoMessage(message),
    messageId:
      readString(message, 'message_id', 'messageId', 'msg_id', 'msgId', 'id')
      ?? readString(event, 'message_id', 'messageId', 'msg_id', 'msgId'),
    orderId: readString(message, 'order_id', 'orderId') ?? readString(event, 'order_id', 'orderId'),
    productId: readString(message, 'product_id', 'productId') ?? readString(event, 'product_id', 'productId'),
    text: text || '[Attachment]',
  };
}

function findFirstMessageEvent(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) return null;
  const candidates = [
    payload,
    ...readObjectArray(payload, 'events'),
    ...readObjectArray(payload, 'messages'),
    ...readObjectArray(payload, 'data'),
    ...readObjectArray(readObject(payload, 'data'), 'events'),
    ...readObjectArray(readObject(payload, 'data'), 'messages'),
  ];
  return candidates.find(candidate => {
    const message = readObject(candidate, 'message') ?? readObject(candidate, 'data') ?? candidate;
    return Boolean(
      readString(message, 'conversation_id', 'conversationId', 'buyer_id', 'buyerId', 'sender_id', 'senderId')
      || readString(candidate, 'conversation_id', 'conversationId', 'buyer_id', 'buyerId'),
    );
  }) ?? null;
}

function readMessageText(message: Record<string, unknown>): string {
  const directText = readString(message, 'text', 'message_text', 'messageText');
  if (directText) return directText;

  const content = message.content;
  if (typeof content === 'string') return content;
  if (isRecord(content)) {
    return readString(content, 'text', 'message_text', 'messageText') ?? '';
  }
  return '';
}

function readAttachmentUrls(message: Record<string, unknown>): string[] {
  const urls = [
    readString(message, 'media_url', 'mediaUrl', 'attachment_url', 'attachmentUrl'),
    ...readObjectArray(message, 'attachments').map(readAttachmentUrl),
    ...readObjectArray(readObject(message, 'content'), 'attachments').map(readAttachmentUrl),
    ...readObjectArray(readObject(message, 'content'), 'images').map(readAttachmentUrl),
  ];
  return [...new Set(urls.filter((url): url is string => Boolean(url)))];
}

function readAttachmentUrl(attachment: Record<string, unknown>): string | null {
  return readString(attachment, 'url', 'media_url', 'mediaUrl', 'resource_url', 'resourceUrl')
    ?? readString(readObject(attachment, 'payload'), 'url');
}

function isEchoMessage(message: Record<string, unknown>): boolean {
  if (message.is_echo === true || message.isEcho === true) return true;
  const direction = readString(message, 'direction')?.toLowerCase();
  if (direction === 'outbound') return true;
  const senderType = readString(message, 'sender_type', 'senderType', 'sender_role', 'senderRole')?.toLowerCase();
  return senderType === 'seller' || senderType === 'shop' || senderType === 'agent' || senderType === 'business';
}

function readObject(value: unknown, ...keys: string[]): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  for (const key of keys) {
    const next = value[key];
    if (isRecord(next)) return next;
  }
  return null;
}

function readObjectArray(value: unknown, ...keys: string[]): Array<Record<string, unknown>> {
  if (!isRecord(value)) return [];
  for (const key of keys) {
    const next = value[key];
    if (Array.isArray(next)) return next.filter(isRecord);
  }
  return [];
}

function readString(value: unknown, ...keys: string[]): string | null {
  if (!isRecord(value)) return null;
  for (const key of keys) {
    const next = value[key];
    if (typeof next === 'string' && next.trim()) return next.trim();
    if (typeof next === 'number' && Number.isFinite(next)) return String(next);
  }
  return null;
}
