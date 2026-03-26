import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';
import crypto from 'crypto';

export async function GET(request: Request) {
  const appUrl = process.env.APP_URL!;
  const clientId = process.env.SHOPIFY_CLIENT_ID!;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET!;
  const redirectUri = `${appUrl}/api/integrations/shopify/callback`;

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const shop = searchParams.get('shop');
  const state = searchParams.get('state');
  const hmac = searchParams.get('hmac');

  // ---------------------------------------------------------------
  // Step 1: Verify CSRF state
  // ---------------------------------------------------------------
  const cookieStore = await cookies();
  const savedState = cookieStore.get('shopify_oauth_state')?.value;
  cookieStore.delete('shopify_oauth_state');

  if (!savedState || savedState !== state) {
    console.error('[Shopify OAuth] State mismatch — possible CSRF attempt');
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=shopify_state_mismatch`);
  }

  if (!code || !shop || !hmac) {
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=shopify_invalid_callback`);
  }

  // ---------------------------------------------------------------
  // Step 2: Verify Shopify HMAC signature
  // Shopify signs all query params (except hmac) alphabetically with client secret.
  // ---------------------------------------------------------------
  const params: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    if (key !== 'hmac') params[key] = value;
  });
  const message = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  const digest = crypto.createHmac('sha256', clientSecret).update(message).digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac))) {
    console.error('[Shopify OAuth] HMAC verification failed');
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=shopify_hmac_invalid`);
  }

  // ---------------------------------------------------------------
  // Step 3: Exchange code for permanent access token
  // ---------------------------------------------------------------
  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error('[Shopify OAuth] Token exchange failed:', tokenData);
      return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=shopify_token_failed`);
    }
    const accessToken: string = tokenData.access_token;

    // ---------------------------------------------------------------
    // Step 4: Fetch shop info for display name
    // ---------------------------------------------------------------
    const shopRes = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    });
    const shopData = await shopRes.json();
    const shopName: string = shopData.shop?.name ?? shop;

    // ---------------------------------------------------------------
    // Step 5: Save integration to database
    // externalAccountId = shop domain (used for webhook routing)
    // fromEmail         = shop name (displayed in UI)
    // accessToken       = Shopify Admin API token (permanent)
    // ---------------------------------------------------------------
    const org = await getOrCreateOrg();
    await db.integration.upsert({
      where: {
        organizationId_platform_externalAccountId: {
          organizationId: org.id,
          platform: 'shopify',
          externalAccountId: shop,
        },
      },
      update: {
        accessToken,
        fromEmail: shopName,
      },
      create: {
        organizationId: org.id,
        platform: 'shopify',
        externalAccountId: shop,
        accessToken,
        fromEmail: shopName,
      },
    });

    console.log(`[Shopify OAuth] Integration saved: ${shopName} (${shop}) for org ${org.id}`);
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?connected=shopify`);

  } catch (err) {
    console.error('[Shopify OAuth] Unexpected error:', err);
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=shopify_server_error`);
  }
}
