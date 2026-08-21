import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetchProvider } = vi.hoisted(() => ({ mockFetchProvider: vi.fn() }));

vi.mock('@/lib/server/provider-fetch', () => ({
  fetchProviderWithDeadline: mockFetchProvider,
}));

vi.mock('@/lib/server/logger', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { POST } from './route';

const webhookRequest = (body: string, headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/webhooks/tiktok-shop', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });

beforeEach(() => {
  vi.stubEnv('GATEWAY_INTERNAL_URL', 'https://gateway.internal');
  mockFetchProvider.mockResolvedValue(new Response('ok', { status: 200 }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('POST /api/webhooks/tiktok-shop', () => {
  it('forwards the webhook to the gateway and returns its status', async () => {
    mockFetchProvider.mockResolvedValue(new Response('accepted', { status: 202 }));

    const response = await POST(webhookRequest('{"type":"ORDER_STATUS_CHANGE"}'));

    expect(response.status).toBe(202);
    await expect(response.text()).resolves.toBe('accepted');
    expect(mockFetchProvider).toHaveBeenCalledWith(
      'https://gateway.internal/webhooks/tiktok-shop',
      expect.objectContaining({ method: 'POST' }),
      expect.objectContaining({ provider: 'gateway' }),
    );
  });

  it('preserves the signature header the gateway verifies against', async () => {
    await POST(webhookRequest('{"a":1}', {
      'authorization': 'sig-value-abc123',
      'x-tts-signature': 'tts-sig-xyz',
    }));

    const [, init] = mockFetchProvider.mock.calls[0] as [string, RequestInit];
    const forwarded = new Headers(init.headers as HeadersInit);

    // This proxy performs no HMAC check of its own — the gateway does. Dropping
    // or rewriting the signature header would make every real webhook fail
    // verification while the proxy still answered 200.
    expect(forwarded.get('authorization')).toBe('sig-value-abc123');
    expect(forwarded.get('x-tts-signature')).toBe('tts-sig-xyz');
  });

  it('forwards the body byte-for-byte, since the signature covers the raw bytes', async () => {
    const raw = '{"shop_id":"1","note":"café — ünicode"}';

    await POST(webhookRequest(raw));

    const [, init] = mockFetchProvider.mock.calls[0] as [string, RequestInit];
    const sent = Buffer.from(init.body as Uint8Array).toString('utf8');

    // Any re-encoding here (JSON.parse/stringify, latin-1) changes the bytes the
    // HMAC was computed over and breaks verification downstream.
    expect(sent).toBe(raw);
  });

  it('relays a gateway rejection rather than masking it as success', async () => {
    mockFetchProvider.mockResolvedValue(new Response('bad signature', { status: 401 }));

    const response = await POST(webhookRequest('{"a":1}'));

    // TikTok retries on non-2xx. Converting a 401 into a 200 would silently
    // drop the event instead of letting the provider retry it.
    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe('bad signature');
  });

  it('answers 502 when the gateway cannot be reached', async () => {
    mockFetchProvider.mockRejectedValue(new Error('ECONNREFUSED 10.1.2.3:8080'));

    const response = await POST(webhookRequest('{"a":1}'));

    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).toBe('Gateway unreachable');
    // The body is returned to TikTok, so it must not describe internal topology.
    expect(text).not.toContain('10.1.2.3');
  });

  it('does not follow redirects, which would leak the payload off-host', async () => {
    await POST(webhookRequest('{"a":1}'));

    const [, init] = mockFetchProvider.mock.calls[0] as [string, RequestInit];
    expect(init.redirect).toBe('manual');
    expect(init.cache).toBe('no-store');
  });
});
