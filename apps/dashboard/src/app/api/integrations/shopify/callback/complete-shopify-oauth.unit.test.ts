import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  exchangeShopifyAccessToken,
  isValidShopifyHmac,
  mergeShopifyOAuthScopes,
  normalizeShopifyOAuthScopes,
} from './complete-shopify-oauth';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isValidShopifyHmac', () => {
  it('accepts the sorted callback payload and rejects a changed payload', () => {
    const params = new URLSearchParams({
      shop: 'fixture.myshopify.com',
      code: 'oauth_code',
      state: 'state_value',
    });
    const message = [...params.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    const hmac = createHmac('sha256', 'secret').update(message).digest('hex');
    params.set('hmac', hmac);

    expect(isValidShopifyHmac(params, 'secret', hmac)).toBe(true);
    params.set('code', 'changed');
    expect(isValidShopifyHmac(params, 'secret', hmac)).toBe(false);
  });
});

describe('exchangeShopifyAccessToken', () => {
  it.each([
    [400, 'shopify_token_failed', 'invalid_credentials'],
    [429, 'shopify_server_error', 'rate_limited'],
    [503, 'shopify_server_error', 'provider_unavailable'],
  ] as const)('classifies HTTP %s responses', async (status, error, failureCategory) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, { status })));

    await expect(exchange()).resolves.toEqual({ ok: false, error, failureCategory });
  });

  it('classifies a timeout as provider unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')));

    await expect(exchange()).resolves.toEqual({
      ok: false,
      error: 'shopify_server_error',
      failureCategory: 'provider_unavailable',
    });
  });

  it('rejects malformed success payloads as unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ scope: 'read_orders' })));

    await expect(exchange()).resolves.toEqual({
      ok: false,
      error: 'shopify_server_error',
      failureCategory: 'unknown',
    });
  });

  it('validates the token payload and normalizes scopes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      access_token: 'shpat_fixture',
      scope: ' write_orders,read_orders,WRITE_ORDERS ',
    })));

    await expect(exchange()).resolves.toEqual({
      ok: true,
      accessToken: 'shpat_fixture',
      oauthScopes: ['read_orders', 'write_orders'],
    });
  });
});

describe('Shopify OAuth metadata', () => {
  it('normalizes, deduplicates, and sorts scope strings', () => {
    expect(normalizeShopifyOAuthScopes(' write_orders,read_orders,WRITE_ORDERS,, '))
      .toEqual(['read_orders', 'write_orders']);
    expect(normalizeShopifyOAuthScopes(['read_orders'])).toBeUndefined();
  });

  it('preserves unrelated metadata while replacing OAuth scopes', () => {
    expect(mergeShopifyOAuthScopes(
      { oauthScopes: ['old'], providerNote: 'keep', simulated: false },
      ['read_orders'],
    )).toEqual({
      oauthScopes: ['read_orders'],
      providerNote: 'keep',
      simulated: false,
    });
  });
});

function exchange() {
  return exchangeShopifyAccessToken({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    code: 'oauth-code',
    shopDomain: 'fixture.myshopify.com',
  });
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
