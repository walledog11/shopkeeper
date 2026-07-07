import { NextResponse } from 'next/server';
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
  const session = await requireAuthenticatedOAuthSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  const scopes = 'read_customers,write_customers,read_orders,write_orders,write_order_edits,read_returns,write_returns,read_products,read_content,write_gift_cards,read_store_credit_accounts,write_store_credit_account_transactions';

  const authUrl = new URL(`https://${shopDomain}/admin/oauth/authorize`);
  authUrl.searchParams.set('client_id', oauthConfig.clientId);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('redirect_uri', oauthConfig.redirectUri);
  authUrl.searchParams.set('state', state);
  return NextResponse.redirect(authUrl.toString());
}
