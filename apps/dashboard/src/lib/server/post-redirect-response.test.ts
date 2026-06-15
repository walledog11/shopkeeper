import { describe, expect, it } from 'vitest';
import { createPostRedirectResponse } from './post-redirect-response';

describe('createPostRedirectResponse', () => {
  it('returns a branded loading page that auto-submits the POST form', async () => {
    const response = createPostRedirectResponse(
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
    expect(html).toContain('shopkeeper-oauth-popup');
    expect(html).toContain('#fbbf24');
  });
});
