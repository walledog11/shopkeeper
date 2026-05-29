import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { auth } from '@clerk/nextjs/server';
import { db } from '@clerk/db';
import crypto from 'crypto';
import logger from '@/lib/server/logger';
import { getGatewayBaseUrl } from '@/lib/server/gateway-url';
import { recordProviderSendFailure } from '@/lib/server/provider-send-alerts';
import { getRedis } from '@/lib/server/redis';
import { timingSafeIncludes } from '@/lib/auth-utils';
import { safeReturnTo } from '@/lib/security/safe-return-to';
import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';
import { normalizeShopifyShopDomain } from '@/lib/shopify/oauth';

export async function GET(request: Request) {
  return createPostRedirectResponse(request, 'Finish Shopify connection');
}

export async function POST(request: Request) {
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
  const savedUserId = cookieStore.get('shopify_oauth_user')?.value;
  const savedShop = cookieStore.get('shopify_oauth_shop')?.value;
  const returnTo = safeReturnTo(cookieStore.get('shopify_oauth_return')?.value);
  cookieStore.delete('shopify_oauth_state');
  cookieStore.delete('shopify_oauth_org');
  cookieStore.delete('shopify_oauth_user');
  cookieStore.delete('shopify_oauth_shop');
  cookieStore.delete('shopify_oauth_return');

  if (!savedState || !state || !timingSafeIncludes([savedState], state)) {
    logger.error('[Shopify OAuth] State mismatch , possible CSRF attempt');
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=shopify_state_mismatch`);
  }

  const { userId: currentUserId } = await auth();
  if (!currentUserId || currentUserId !== savedUserId) {
    logger.error({ savedUserId, currentUserId }, '[Shopify OAuth] User session mismatch , possible CSRF attempt');
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=shopify_state_mismatch`);
  }

  if (!code || !shop || !hmac) {
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=shopify_invalid_callback`);
  }

  const shopDomain = normalizeShopifyShopDomain(shop);
  if (!shopDomain || !savedShop || shopDomain !== savedShop) {
    logger.error({ shop, savedShop }, '[Shopify OAuth] Shop domain mismatch , possible CSRF attempt');
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=shopify_shop_mismatch`);
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

  if (!timingSafeIncludes([digest], hmac)) {
    logger.error('[Shopify OAuth] HMAC verification failed');
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=shopify_hmac_invalid`);
  }

  // ---------------------------------------------------------------
  // Step 3: Exchange code for permanent access token
  // ---------------------------------------------------------------
  try {
    const tokenRes = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
      cache: 'no-store',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      logger.error({ tokenData }, '[Shopify OAuth] Token exchange failed');
      return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=shopify_token_failed`);
    }
    const accessToken: string = tokenData.access_token;

    if (!clerkOrgId) {
      logger.error('[Shopify OAuth] Missing org cookie , session likely interrupted');
      return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=shopify_server_error`);
    }

    // ---------------------------------------------------------------
    // Step 4: Fetch shop info for display name
    // ---------------------------------------------------------------
    const shopRes = await fetch(`https://${shopDomain}/admin/api/2026-04/shop.json`, {
      cache: 'no-store',
      headers: { 'X-Shopify-Access-Token': accessToken },
    });
    const shopData = await shopRes.json();
    const shopName: string = shopData.shop?.name ?? shopDomain;

    // ---------------------------------------------------------------
    // Step 5: Save integration to database
    // externalAccountId = shop domain (used for webhook routing)
    // fromEmail         = shop name (displayed in UI)
    // accessToken       = Shopify Admin API token (permanent)
    // ---------------------------------------------------------------
    const org = await db.organization.findUnique({ where: { clerkOrgId } });
    if (!org) {
      logger.error({ clerkOrgId }, '[Shopify OAuth] Org not found');
      return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=shopify_server_error`);
    }
    const shopifyKey = { organizationId: org.id, platform: 'shopify' as const, externalAccountId: shopDomain };
    const existingShopify = await db.integration.findUnique({ where: { organizationId_platform_externalAccountId: shopifyKey } });
    let shopifyIntegrationId: string | null = existingShopify?.id ?? null;
    if (existingShopify) {
      await db.integration.update({ where: { id: existingShopify.id }, data: { accessToken, fromEmail: shopName } });
    } else {
      try {
        const created = await db.integration.create({ data: { organizationId: org.id, platform: 'shopify', externalAccountId: shopDomain, accessToken, fromEmail: shopName } });
        shopifyIntegrationId = created.id;
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2002') throw err;
        const race = (await db.integration.findUnique({ where: { organizationId_platform_externalAccountId: shopifyKey } }))!;
        await db.integration.update({ where: { id: race.id }, data: { accessToken, fromEmail: shopName } });
        shopifyIntegrationId = race.id;
      }
    }

    logger.info({ shopName, shop: shopDomain, orgId: org.id }, '[Shopify OAuth] Integration saved');

    // Soft-fail: a registration error should not break the OAuth flow.
    let gatewayUrl: string | null = null;
    try {
      gatewayUrl = getGatewayBaseUrl();
    } catch (error) {
      logger.warn({ err: error, shop: shopDomain }, '[Shopify OAuth] Gateway URL invalid , skipping webhook registration');
    }

    if (gatewayUrl) {
      const webhookTopics = ['orders/created', 'orders/fulfilled', 'orders/updated', 'orders/cancelled', 'app/uninstalled'];
      await Promise.allSettled(
        webhookTopics.map((topic) =>
          fetch(`https://${shopDomain}/admin/api/2026-04/webhooks.json`, {
            cache: 'no-store',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
            body: JSON.stringify({ webhook: { topic, address: `${gatewayUrl}/webhooks/shopify`, format: 'json' } }),
          }).then(async (r) => {
            if (!r.ok) {
              const err = await r.json().catch(() => ({}));
              logger.warn({ topic, shop: shopDomain, err }, '[Shopify OAuth] Webhook registration failed');
              void recordProviderSendFailure('shopify', 'webhook_registration', org.id, {
                counterClient: getRedis(),
                integrationId: shopifyIntegrationId,
                detail: `Shopify webhook registration failed for ${topic}`,
                extra: { topic, shop: shopDomain },
              });
            } else {
              logger.info({ topic, shop: shopDomain }, '[Shopify OAuth] Webhook registered');
            }
          })
        )
      );
    } else {
      logger.warn({ shop: shopDomain }, '[Shopify OAuth] Gateway URL not set , skipping webhook registration');
    }

    const successUrl = returnTo
      ? `${appUrl}${returnTo}`
      : `${appUrl}/dashboard/integrations?connected=shopify`;
    return NextResponse.redirect(successUrl);

  } catch (err) {
    logger.error({ err }, '[Shopify OAuth] Unexpected error');
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=shopify_server_error`);
  }
}
