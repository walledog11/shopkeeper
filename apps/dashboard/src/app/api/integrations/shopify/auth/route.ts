import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { auth } from '@clerk/nextjs/server';
import crypto from 'crypto';

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
  const returnTo = searchParams.get('returnTo');

  if (!shop) {
    return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 });
  }

  // Normalize: accept "mystore" or "mystore.myshopify.com"
  const shopDomain = shop.includes('.') ? shop : `${shop}.myshopify.com`;

  // Basic domain validation
  if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shopDomain)) {
    return NextResponse.json({ error: 'Invalid shop domain' }, { status: 400 });
  }

  // CSRF state token — encode shopDomain so callback can reconstruct it
  const nonce = crypto.randomBytes(16).toString('hex');
  const state = `${nonce}.${shopDomain}`;

  const cookieStore = await cookies();
  cookieStore.set('shopify_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  // Store orgId so the callback can identify the org without a Clerk session
  cookieStore.set('shopify_oauth_org', orgId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  if (returnTo) {
    cookieStore.set('shopify_oauth_return', returnTo, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });
  }

  const redirectUri = `${appUrl}/api/integrations/shopify/callback`;
  const scopes = 'read_customers,write_customers,read_orders,write_orders';

  const authUrl = new URL(`https://${shopDomain}/admin/oauth/authorize`);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);

  return NextResponse.redirect(authUrl.toString());
}
