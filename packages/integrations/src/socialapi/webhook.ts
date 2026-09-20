import { createHmac, timingSafeEqual } from 'node:crypto';
import { isRecord } from '../guards.js';
import { readString } from '../values.js';

const SIGNATURE_PATTERN = /^sha256=([a-f0-9]{64})$/i;
const TIMESTAMP_PATTERN = /^\d{10,}$/;

export type SocialApiWebhookVerification =
  | { ok: true; timestampSeconds: number }
  | { ok: false; reason: 'missing' | 'malformed' | 'stale' | 'invalid' };

export interface VerifySocialApiWebhookInput {
  secret: string;
  rawBody: Uint8Array;
  signatureV2: string | null | undefined;
  timestamp: string | null | undefined;
  nowMs?: number;
  toleranceMs?: number;
}

/**
 * Verifies SocialAPI's replay-protected signature over `<timestamp>.<raw body>`.
 * The initial unsigned registration ping is deliberately not handled here; only
 * the HTTP route can apply that narrow exception after validating its event and body.
 */
export function verifySocialApiWebhookV2(
  input: VerifySocialApiWebhookInput,
): SocialApiWebhookVerification {
  if (!input.signatureV2 || !input.timestamp) return { ok: false, reason: 'missing' };
  const signatureMatch = SIGNATURE_PATTERN.exec(input.signatureV2);
  if (!signatureMatch || !TIMESTAMP_PATTERN.test(input.timestamp)) {
    return { ok: false, reason: 'malformed' };
  }

  const timestampSeconds = Number(input.timestamp);
  if (!Number.isSafeInteger(timestampSeconds)) return { ok: false, reason: 'malformed' };
  const nowMs = input.nowMs ?? Date.now();
  const toleranceMs = input.toleranceMs ?? 5 * 60 * 1_000;
  if (!Number.isFinite(toleranceMs) || toleranceMs < 0) {
    throw new Error('SocialAPI webhook tolerance must be a non-negative finite number');
  }
  if (Math.abs(nowMs - timestampSeconds * 1_000) > toleranceMs) {
    return { ok: false, reason: 'stale' };
  }

  const expected = createHmac('sha256', input.secret)
    .update(input.timestamp)
    .update('.')
    .update(input.rawBody)
    .digest();
  const received = Buffer.from(signatureMatch[1]!, 'hex');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, timestampSeconds };
}

export interface SocialApiInboundMedia {
  type: string;
  url: string | null;
}

export interface SocialApiInboundDm {
  accountId: string;
  conversationId: string | null;
  platform: string;
  /**
   * `data.platform_id` — the native Instagram message id. This is the canonical
   * dedupe key: the 2026-09-09 controlled spike observed it matching the stored
   * inbox row while `data.id` (the provider-only interaction id) matched neither
   * inbox identifier, so `data.id` must not be used to join webhook delivery
   * against recovery reads.
   */
  nativeMessageId: string | null;
  authorId: string;
  text: string | null;
  media: SocialApiInboundMedia[];
  receivedAt: string;
}

function readMedia(content: Record<string, unknown>): SocialApiInboundMedia[] {
  const items = Array.isArray(content.media) ? content.media : [];
  return items.flatMap((item) => {
    if (!isRecord(item)) return [];
    const type = readString(item.type) ?? 'unsupported';
    return [{ type, url: readString(item.url) ?? readString(item.attachment_url) }];
  });
}

/**
 * Normalizes a verified `dm.received` body into the fields Shopkeeper's Instagram
 * workflow needs. Returns null when a required routing field is absent; the caller
 * decides whether that is a drop or a retry.
 */
export function normalizeSocialApiDmReceived(body: unknown): SocialApiInboundDm | null {
  if (!isRecord(body) || !isRecord(body.data)) return null;
  const data = body.data;
  const raw = isRecord(data.raw_payload) ? data.raw_payload : {};
  const author = isRecord(data.author) ? data.author : {};
  const rawSender = isRecord(raw.sender) ? raw.sender : {};
  const rawMessage = isRecord(raw.message) ? raw.message : {};
  const content = isRecord(data.content) ? data.content : {};

  const accountId = readString(data.account_id);
  const authorId = readString(author.id) ?? readString(rawSender.id);
  const receivedAt = readString(data.received_at);
  if (!accountId || !authorId || !receivedAt) return null;

  return {
    accountId,
    conversationId: readString(data.conversation_id),
    platform: readString(data.platform) ?? 'instagram',
    nativeMessageId: readString(data.platform_id) ?? readString(rawMessage.mid),
    authorId,
    text: readString(content.text),
    media: readMedia(content),
    receivedAt,
  };
}
