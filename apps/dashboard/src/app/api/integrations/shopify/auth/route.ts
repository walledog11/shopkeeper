import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { safeReturnTo } from '@/lib/security/safe-return-to';

export async function GET(request: Request) {
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
  const shop = searchParams.get('shop')?.trim().toLowerCase();
  const returnTo = safeReturnTo(searchParams.get('returnTo'));

  if (!shop) {
    return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 });
  }

  // Normalize: accept "mystore" or "mystore.myshopify.com"
  const shopDomain = shop.includes('.') ? shop : `${shop}.myshopify.com`;

  // Basic domain validation
  if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shopDomain)) {
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

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 600,
    path: '/',
  };

  const cookieStore = await cookies();
  cookieStore.set('shopify_oauth_state', state, cookieOpts);
  cookieStore.set('shopify_oauth_org', orgId, cookieOpts);
  cookieStore.set('shopify_oauth_user', userId, cookieOpts);
  if (returnTo) {
    cookieStore.set('shopify_oauth_return', returnTo, cookieOpts);
  }
  return NextResponse.redirect(authUrl.toString());
}
