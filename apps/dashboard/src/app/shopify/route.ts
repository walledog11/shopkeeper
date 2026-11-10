import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getShopifyOAuthCallbackConfig } from '@/lib/env';
import { normalizeShopifyShopDomain } from '@/lib/shopify/oauth';
import { verifyShopifySessionToken } from '@/lib/shopify/session-token';
import { loadShopifyAppHome } from './_lib/app-home';
import {
  renderShopifyAppHome,
  renderShopifySessionBounce,
  renderShopifySessionError,
} from './_lib/app-home-html';

const RELOAD_PARAM = 'shopkeeper_reload';

// Shopify's iframe-protection rule: only this shop's admin may frame the page,
// named exactly; a wildcard fails its security check.
function htmlResponse(html: string, shop: string, nonce: string): Response {
  return new Response(html, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': [
        `frame-ancestors https://${shop} https://admin.shopify.com`,
        `script-src 'nonce-${nonce}' 'strict-dynamic' https:`,
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join('; '),
    },
  });
}

/**
 * The app home: `application_url` in `shopify.app.toml`, framed by Shopify admin
 * whenever a merchant opens Shopkeeper from their Apps list.
 */
export async function GET(request: Request) {
  const config = getShopifyOAuthCallbackConfig();
  if (!config) {
    return NextResponse.json({ error: 'Shopify is not configured' }, { status: 500 });
  }

  const url = new URL(request.url);
  const requestedShop = normalizeShopifyShopDomain(url.searchParams.get('shop'));
  // Not a Shopify admin load: someone typed the address.
  if (!requestedShop) return NextResponse.redirect(`${config.appUrl}/dashboard`);

  const nonce = randomBytes(16).toString('base64');
  const shell = { appUrl: config.appUrl, clientId: config.clientId, nonce };
  const idToken = url.searchParams.get('id_token');
  const session = verifyShopifySessionToken(idToken, config);
  if (!session || !idToken) {
    const html = url.searchParams.has(RELOAD_PARAM)
      ? renderShopifySessionError(shell)
      : renderShopifySessionBounce(shell, RELOAD_PARAM);
    return htmlResponse(html, requestedShop, nonce);
  }

  const state = await loadShopifyAppHome(session.shop, idToken, config);
  return htmlResponse(renderShopifyAppHome(shell, state), session.shop, nonce);
}
