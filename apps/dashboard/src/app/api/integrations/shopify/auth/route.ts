import { NextResponse } from 'next/server';
import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';
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

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const appUrl = process.env.APP_URL;

  if (!clientId || !appUrl) {
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

  const redirectUri = `${appUrl}/api/integrations/shopify/callback`;
  const scopes = 'read_customers,write_customers,read_orders,write_orders,write_order_edits,read_products,read_content';

  const authUrl = new URL(`https://${shopDomain}/admin/oauth/authorize`);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  return NextResponse.redirect(authUrl.toString());
}
