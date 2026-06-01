import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { safeReturnTo } from '@/lib/security/safe-return-to';
import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';
import { normalizeShopifyShopDomain } from '@/lib/shopify/oauth';

const SHOPIFY_OAUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 600,
  path: '/',
};

export async function GET(request: Request) {
  return createPostRedirectResponse(request, 'Connect Shopify');
}

export async function POST(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
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
  const returnTo = safeReturnTo(searchParams.get('returnTo'));

  if (!shop?.trim()) {
    return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 });
  }

  const shopDomain = normalizeShopifyShopDomain(shop);
  if (!shopDomain) {
    return NextResponse.json({ error: 'Invalid shop domain' }, { status: 400 });
  }

  const state = crypto.randomBytes(16).toString('hex');

  const redirectUri = `${appUrl}/api/integrations/shopify/callback`;
  const scopes = 'read_customers,write_customers,read_orders,write_orders,write_order_edits,read_products,read_content';

  const authUrl = new URL(`https://${shopDomain}/admin/oauth/authorize`);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);

  const cookieStore = await cookies();
  cookieStore.set('shopify_oauth_state', state, SHOPIFY_OAUTH_COOKIE_OPTIONS);
  cookieStore.set('shopify_oauth_org', orgId, SHOPIFY_OAUTH_COOKIE_OPTIONS);
  cookieStore.set('shopify_oauth_user', userId, SHOPIFY_OAUTH_COOKIE_OPTIONS);
  cookieStore.set('shopify_oauth_shop', shopDomain, SHOPIFY_OAUTH_COOKIE_OPTIONS);
  if (returnTo) {
    cookieStore.set('shopify_oauth_return', returnTo, SHOPIFY_OAUTH_COOKIE_OPTIONS);
  }
  return NextResponse.redirect(authUrl.toString());
}
