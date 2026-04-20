import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@clerk/db';
import crypto from 'crypto';
import logger from '@/lib/logger';

export async function GET(request: Request) {
  const appUrl = process.env.APP_URL;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!appUrl || !clientId || !clientSecret) {
    return NextResponse.json({ error: 'OAuth callback is not configured' }, { status: 500 });
  }
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
  const clerkOrgId = cookieStore.get('shopify_oauth_org')?.value;
  const returnTo = cookieStore.get('shopify_oauth_return')?.value;
  cookieStore.delete('shopify_oauth_state');
  cookieStore.delete('shopify_oauth_org');
  cookieStore.delete('shopify_oauth_return');

  if (!savedState || savedState !== state) {
    logger.error('[Shopify OAuth] State mismatch — possible CSRF attempt');
    return NextResponse.redirect(`${appUrl}/dashboard/settings?tab=integrations&error=shopify_state_mismatch`);
  }

  if (!code || !shop || !hmac) {
    return NextResponse.redirect(`${appUrl}/dashboard/settings?tab=integrations&error=shopify_invalid_callback`);
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
    logger.error('[Shopify OAuth] HMAC verification failed');
    return NextResponse.redirect(`${appUrl}/dashboard/settings?tab=integrations&error=shopify_hmac_invalid`);
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
      logger.error({ tokenData }, '[Shopify OAuth] Token exchange failed');
      return NextResponse.redirect(`${appUrl}/dashboard/settings?tab=integrations&error=shopify_token_failed`);
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
    if (!clerkOrgId) {
      logger.error('[Shopify OAuth] Missing org cookie — session likely interrupted');
      return NextResponse.redirect(`${appUrl}/dashboard/settings?tab=integrations&error=shopify_server_error`);
    }
    const org = await db.organization.findUnique({ where: { clerkOrgId } });
    if (!org) {
      logger.error({ clerkOrgId }, '[Shopify OAuth] Org not found');
      return NextResponse.redirect(`${appUrl}/dashboard/settings?tab=integrations&error=shopify_server_error`);
    }
    const shopifyKey = { organizationId: org.id, platform: 'shopify' as const, externalAccountId: shop };
    const existingShopify = await db.integration.findUnique({ where: { organizationId_platform_externalAccountId: shopifyKey } });
    if (existingShopify) {
      await db.integration.update({ where: { id: existingShopify.id }, data: { accessToken, fromEmail: shopName } });
    } else {
      try {
        await db.integration.create({ data: { organizationId: org.id, platform: 'shopify', externalAccountId: shop, accessToken, fromEmail: shopName } });
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2002') throw err;
        const race = (await db.integration.findUnique({ where: { organizationId_platform_externalAccountId: shopifyKey } }))!;
        await db.integration.update({ where: { id: race.id }, data: { accessToken, fromEmail: shopName } });
      }
    }

    logger.info({ shopName, shop, orgId: org.id }, '[Shopify OAuth] Integration saved');

    // Register order webhooks so the gateway receives Shopify order events for this store.
    // Soft-fail: a registration error should not break the OAuth flow.
    const gatewayUrl = process.env.GATEWAY_INTERNAL_URL;
    if (gatewayUrl) {
      const webhookTopics = ['orders/created', 'orders/fulfilled', 'orders/updated', 'orders/cancelled'];
      await Promise.allSettled(
        webhookTopics.map((topic) =>
          fetch(`https://${shop}/admin/api/2024-01/webhooks.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
            body: JSON.stringify({ webhook: { topic, address: `${gatewayUrl}/webhooks/shopify`, format: 'json' } }),
          }).then(async (r) => {
            if (!r.ok) {
              const err = await r.json().catch(() => ({}));
              logger.warn({ topic, shop, err }, '[Shopify OAuth] Webhook registration failed');
            } else {
              logger.info({ topic, shop }, '[Shopify OAuth] Webhook registered');
            }
          })
        )
      );
    } else {
      logger.warn({ shop }, '[Shopify OAuth] GATEWAY_INTERNAL_URL not set — skipping webhook registration');
    }

    const successUrl = returnTo
      ? `${appUrl}${returnTo}`
      : `${appUrl}/dashboard/settings?tab=integrations&connected=shopify`;
    return NextResponse.redirect(successUrl);

  } catch (err) {
    logger.error({ err }, '[Shopify OAuth] Unexpected error');
    return NextResponse.redirect(`${appUrl}/dashboard/settings?tab=integrations&error=shopify_server_error`);
  }
}
