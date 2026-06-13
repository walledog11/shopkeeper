import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.stubGlobal('fetch', mockFetch);

vi.mock('@/lib/server/gateway-url', () => ({
  getGatewayBaseUrl: vi.fn(() => 'http://gateway.test'),
}));

import { POST } from './route';

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubEnv('POSTMARK_INBOUND_USERNAME', 'postmark');
  vi.stubEnv('POSTMARK_INBOUND_PASSWORD', 'secret');
});

describe('POST /api/webhooks/email', () => {
  it('forwards the incoming Authorization header to the gateway', async () => {
    mockFetch.mockResolvedValueOnce(new Response('OK', { status: 200 }));

    const res = await POST(new Request('http://localhost/api/webhooks/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic cG9zdG1hcms6c2VjcmV0',
      },
      body: JSON.stringify({ From: 'customer@example.com', TextBody: 'hello' }),
    }));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('OK');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://gateway.test/webhooks/email/inbound',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Basic cG9zdG1hcms6c2VjcmV0',
        }),
      }),
    );
  });
});
