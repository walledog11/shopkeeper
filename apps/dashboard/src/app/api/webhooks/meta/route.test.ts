import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.stubGlobal('fetch', mockFetch);
vi.mock('@/lib/server/gateway-url', () => ({
  getGatewayBaseUrl: vi.fn(() => 'http://gateway.test'),
}));

import { GET, POST } from './route';

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubEnv('INSTAGRAM_APP_SECRET', 'instagram-secret');
});

describe('/api/webhooks/meta forwarding', () => {
  it('forwards verification requests with their query string', async () => {
    mockFetch.mockResolvedValue(new Response('challenge', { status: 200 }));
    const request = new NextRequest('http://dashboard.test/api/webhooks/meta?hub.mode=subscribe');

    const response = await GET(request);

    expect(await response.text()).toBe('challenge');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://gateway.test/webhooks/meta?hub.mode=subscribe',
      expect.objectContaining({ method: 'GET', redirect: 'manual' }),
    );
  });

  it('rejects an invalid signature without forwarding', async () => {
    const request = new NextRequest('http://dashboard.test/api/webhooks/meta', {
      method: 'POST',
      headers: { 'x-hub-signature-256': 'sha256=wrong' },
      body: JSON.stringify({ object: 'instagram' }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('validates and forwards the exact signed body', async () => {
    const body = Buffer.from(JSON.stringify({ object: 'instagram', entry: [] }));
    const signature = `sha256=${createHmac('sha256', 'instagram-secret').update(body).digest('hex')}`;
    mockFetch.mockResolvedValue(new Response('EVENT_RECEIVED', { status: 202 }));
    const request = new NextRequest('http://dashboard.test/api/webhooks/meta?source=dashboard', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signature,
      },
      body,
    });

    const response = await POST(request);

    expect(response.status).toBe(202);
    expect(await response.text()).toBe('EVENT_RECEIVED');
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://gateway.test/webhooks/meta?source=dashboard');
    expect(Buffer.from(init.body)).toEqual(body);
  });
});
