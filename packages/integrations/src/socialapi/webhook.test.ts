import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { normalizeSocialApiDmReceived, verifySocialApiWebhookV2 } from './webhook.js';

const secret = 'webhook-secret';
const timestamp = '1789002000';
const nowMs = 1_789_002_000_000;
const rawBody = Buffer.from('{"event":"dm.received","data":{"id":"sapi_dm_1"}}');

function signature(body = rawBody, sentAt = timestamp): string {
  return `sha256=${createHmac('sha256', secret).update(`${sentAt}.`).update(body).digest('hex')}`;
}

describe('SocialAPI V2 webhook verification', () => {
  it('accepts an exact signed raw body inside the replay window', () => {
    expect(verifySocialApiWebhookV2({
      secret,
      rawBody,
      signatureV2: signature(),
      timestamp,
      nowMs,
    })).toEqual({ ok: true, timestampSeconds: Number(timestamp) });
  });

  it('rejects a body changed after signing', () => {
    expect(verifySocialApiWebhookV2({
      secret,
      rawBody: Buffer.from('{"event":"dm.sent"}'),
      signatureV2: signature(),
      timestamp,
      nowMs,
    })).toEqual({ ok: false, reason: 'invalid' });
  });

  it.each([
    [null, timestamp, 'missing'],
    [signature(), null, 'missing'],
    ['not-a-signature', timestamp, 'malformed'],
    [`sha256=${'z'.repeat(64)}`, timestamp, 'malformed'],
    [signature(), 'today', 'malformed'],
  ] as const)('rejects invalid header pair %#', (signatureV2, sentAt, reason) => {
    expect(verifySocialApiWebhookV2({
      secret,
      rawBody,
      signatureV2,
      timestamp: sentAt,
      nowMs,
    })).toEqual({ ok: false, reason });
  });

  it.each([-301_000, 301_000])('rejects delivery outside the past/future tolerance (%sms)', offset => {
    expect(verifySocialApiWebhookV2({
      secret,
      rawBody,
      signatureV2: signature(),
      timestamp,
      nowMs: nowMs + offset,
    })).toEqual({ ok: false, reason: 'stale' });
  });

  it('does not treat an unsigned registration ping as verified', () => {
    expect(verifySocialApiWebhookV2({
      secret,
      rawBody: Buffer.from('{"event":"webhook.test"}'),
      signatureV2: null,
      timestamp: null,
      nowMs,
    })).toEqual({ ok: false, reason: 'missing' });
  });
});

describe('normalizeSocialApiDmReceived', () => {
  const base = {
    event: 'dm.received',
    data: {
      id: 'interaction-1',
      account_id: 'acc_1',
      conversation_id: 'conv_1',
      platform: 'instagram',
      platform_id: 'native-1',
      author: { id: 'author-1' },
      content: { text: 'hi', media: [] },
      received_at: '2026-09-10T01:18:38Z',
    },
  };

  it('reads the native message id rather than the provider interaction id', () => {
    const normalized = normalizeSocialApiDmReceived(base);
    expect(normalized?.nativeMessageId).toBe('native-1');
    expect(normalized?.accountId).toBe('acc_1');
    expect(normalized?.authorId).toBe('author-1');
    expect(normalized?.conversationId).toBe('conv_1');
  });

  it('falls back to the raw Meta message and sender ids', () => {
    const normalized = normalizeSocialApiDmReceived({
      data: {
        account_id: 'acc_1',
        received_at: '2026-09-10T01:18:38Z',
        raw_payload: { message: { mid: 'raw-mid' }, sender: { id: 'raw-sender' } },
      },
    });
    expect(normalized?.nativeMessageId).toBe('raw-mid');
    expect(normalized?.authorId).toBe('raw-sender');
  });

  it('keeps a urlless media item so an ephemeral image is visible downstream', () => {
    const normalized = normalizeSocialApiDmReceived({
      data: {
        ...base.data,
        content: { text: null, media: [{ type: 'ephemeral' }] },
      },
    });
    expect(normalized?.text).toBeNull();
    expect(normalized?.media).toEqual([{ type: 'ephemeral', url: null }]);
  });

  it('returns null when a required routing field is missing', () => {
    expect(normalizeSocialApiDmReceived({ data: { account_id: 'acc_1' } })).toBeNull();
    expect(normalizeSocialApiDmReceived({ data: { received_at: 'now', author: { id: 'a' } } })).toBeNull();
    expect(normalizeSocialApiDmReceived(null)).toBeNull();
  });
});
