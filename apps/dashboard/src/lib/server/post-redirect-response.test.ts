import { describe, expect, it, vi } from 'vitest';
// Deterministic redirect response unit coverage.
import { createPostRedirectResponse } from './post-redirect-response';

const requestHeaders = new Headers();
vi.mock('next/headers', () => ({
  headers: async () => requestHeaders,
}));

describe('createPostRedirectResponse', () => {
  it('returns one minimal loading page that auto-submits the POST form', async () => {
    const response = await createPostRedirectResponse(
      new Request('http://localhost/api/integrations/shopify/auth?shop=fixture-shop.myshopify.com'),
      'Connect Shopify',
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');

    const html = await response.text();
    expect(html).toContain('Connect Shopify');
    expect(html).toContain('method="post"');
    expect(html).toContain('action="/api/integrations/shopify/auth?shop=fixture-shop.myshopify.com"');
    expect(html).toContain('requestSubmit()');
    expect(html).toContain('class="spinner"');
    expect(html).toContain('#fbbf24');
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('gmail-oauth');
  });

  // Under the enforced `strict-dynamic` CSP an un-nonced auto-submit script is
  // dropped and the popup hangs on its spinner, which is invisible in dev logs.
  it('nonces the auto-submit script with the middleware nonce', async () => {
    requestHeaders.set('x-nonce', 'test-nonce-value');

    const response = await createPostRedirectResponse(
      new Request('http://localhost/api/integrations/gmail/auth'),
      'Connecting Gmail',
    );

    const html = await response.text();
    expect(html).toContain('<script nonce="test-nonce-value">');
  });
});
