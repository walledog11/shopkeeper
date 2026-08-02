import { NextResponse } from 'next/server';
import { SHOPIFY_OAUTH_SCOPES } from '@shopkeeper/agent/shopify/integration-health';
import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';
import { getShopifyOAuthAuthorizeConfig } from '@/lib/env';
import { normalizeShopifyShopDomain } from '@/lib/shopify/oauth';
import {
  createOAuthSessionCookies,
  requireAuthenticatedOAuthSession,
} from '@/app/api/integrations/_lib/oauth-session';

export async function GET(request: Request) {
  return createPostRedirectResponse(request, 'Connect Shopify');
}

export async function POST(request: Request) {
  const sessionResult = await requireAuthenticatedOAuthSession();
  if (!sessionResult.ok) return sessionResult.response;
  const session = sessionResult.session;

  const oauthConfig = getShopifyOAuthAuthorizeConfig();

  if (!oauthConfig) {
    return NextResponse.json(
      { error: 'SHOPIFY_CLIENT_ID or APP_URL is not configured' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const shop = searchParams.get('shop');

  if (!shop?.trim()) {
    return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 });
  }

  const shopDomain = normalizeShopifyShopDomain(shop);
  if (!shopDomain) {
    return NextResponse.json({ error: 'Invalid shop domain' }, { status: 400 });
  }

  const { state } = await createOAuthSessionCookies(
    request,
    { prefix: 'shopify' },
    session,
    { shop: shopDomain },
  );

  const authUrl = new URL(`https://${shopDomain}/admin/oauth/authorize`);
  authUrl.searchParams.set('client_id', oauthConfig.clientId);
  // The app is on Shopify managed installation, so this param does not decide
  // the grant — the Partner Dashboard app configuration does, and the token
  // exchange has returned scopes this list never requested. Sent anyway because
  // it is what a non-managed install would need; to change what a merchant
  // actually grants, change the Partner Dashboard configuration.
  authUrl.searchParams.set('scope', SHOPIFY_OAUTH_SCOPES.join(','));
  authUrl.searchParams.set('redirect_uri', oauthConfig.redirectUri);
  authUrl.searchParams.set('state', state);
  return NextResponse.redirect(authUrl.toString());
}
