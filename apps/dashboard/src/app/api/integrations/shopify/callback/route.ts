import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import crypto from 'crypto';
import logger from '@/lib/server/logger';
import { getGatewayBaseUrl } from '@/lib/server/gateway-url';
import { recordProviderSendFailure } from '@/lib/server/provider-send-alerts';
import { getRedis } from '@/lib/server/redis';
import { timingSafeIncludes } from '@/lib/security/timing-safe';
import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';
import { normalizeShopifyShopDomain, parseShopifyShopIdentity, isSameShopifyStore } from '@/lib/shopify/oauth';
import { shopifyRestJson, ShopifyRequestError } from '@shopkeeper/agent/shopify';
import { validateOAuthCallbackSession } from '@/app/api/integrations/_lib/oauth-session';
import { buildOAuthCompleteUrl } from '@/app/api/integrations/_lib/oauth-complete-url';
import { upsertRaceSafeIntegration } from '@/app/api/integrations/_lib/integration-upsert';

const SHOPIFY_WEBHOOK_TOPICS = ['orders/created', 'orders/fulfilled', 'orders/updated', 'orders/cancelled', 'app/uninstalled'];

function oauthComplete(
  appUrl: string,
  params: { connected?: string; error?: string; returnTo?: string | null },
) {
  return NextResponse.redirect(buildOAuthCompleteUrl(appUrl, params));
}

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
  const callbackSession = await validateOAuthCallbackSession({
    appUrl,
    extraCookieKeys: ['shop'],
    logPrefix: 'Shopify OAuth',
    prefix: 'shopify',
    state,
    stateMismatchError: 'shopify_state_mismatch',
  });
  if (!callbackSession.ok) return callbackSession.response;
  const {
    clerkOrgId,
    returnTo,
    extra: { shop: savedShop },
  } = callbackSession.session;

  if (!code || !shop || !hmac) {
    return oauthComplete(appUrl, { error: 'shopify_invalid_callback', returnTo });
  }

  const shopDomain = normalizeShopifyShopDomain(shop);
  if (!shopDomain || !savedShop) {
    return oauthComplete(appUrl, { error: 'shopify_invalid_callback', returnTo });
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
    return oauthComplete(appUrl, { error: 'shopify_hmac_invalid', returnTo });
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
      logger.error(
        { status: tokenRes.status, error: tokenData.error },
        '[Shopify OAuth] Token exchange failed',
      );
      return oauthComplete(appUrl, { error: 'shopify_token_failed', returnTo });
    }
    const accessToken: string = tokenData.access_token;

    if (!clerkOrgId) {
      logger.error('[Shopify OAuth] Missing org cookie — session likely interrupted');
      return oauthComplete(appUrl, { error: 'shopify_server_error', returnTo });
    }

    // ---------------------------------------------------------------
    // Step 4: Resolve canonical shop identity and verify requested shop
    // OAuth always returns the store's original myshopify.com domain, which can
    // differ from an alias the merchant typed (e.g. after a domain rename).
    // ---------------------------------------------------------------
    let authorizedShop: Awaited<ReturnType<typeof fetchShopifyShopIdentity>>;
    try {
      authorizedShop = await fetchShopifyShopIdentity(shopDomain, accessToken);
    } catch (err) {
      logger.error({ err, shop: shopDomain }, '[Shopify OAuth] Failed to fetch authorized shop identity');
      return oauthComplete(appUrl, { error: 'shopify_server_error', returnTo });
    }

    if (savedShop !== shopDomain) {
      try {
        const requestedShop = await fetchShopifyShopIdentity(savedShop, accessToken);
        if (!isSameShopifyStore(authorizedShop, requestedShop)) {
          logger.error(
            { shop: shopDomain, savedShop, authorizedShopId: authorizedShop.id, requestedShopId: requestedShop.id },
            '[Shopify OAuth] Shop domain mismatch — possible CSRF attempt',
          );
          return oauthComplete(appUrl, { error: 'shopify_shop_mismatch', returnTo });
        }
        logger.info(
          { shop: shopDomain, savedShop, canonicalShop: authorizedShop.myshopifyDomain },
          '[Shopify OAuth] Accepted myshopify domain alias',
        );
      } catch (err) {
        logger.error(
          { err, shop: shopDomain, savedShop },
          '[Shopify OAuth] Shop domain mismatch — possible CSRF attempt',
        );
        return oauthComplete(appUrl, { error: 'shopify_shop_mismatch', returnTo });
      }
    }

    const canonicalShopDomain = authorizedShop.myshopifyDomain;
    const shopName = authorizedShop.name;

    // ---------------------------------------------------------------
    // Step 5: Save integration to database
    // externalAccountId = canonical shop domain (used for webhook routing)
    // fromEmail         = shop name (displayed in UI)
    // accessToken       = Shopify Admin API token (permanent)
    // ---------------------------------------------------------------
    const org = await db.organization.findUnique({ where: { clerkOrgId } });
    if (!org) {
      logger.error({ clerkOrgId }, '[Shopify OAuth] Org not found');
      return oauthComplete(appUrl, { error: 'shopify_server_error', returnTo });
    }
    const shopifyIntegration = await upsertRaceSafeIntegration({
      organizationId: org.id,
      platform: 'shopify',
      externalAccountId: canonicalShopDomain,
      data: { accessToken, fromEmail: shopName, tokenExpiresAt: null },
    });
    const shopifyIntegrationId = shopifyIntegration.id;

    logger.info({ shopName, shop: canonicalShopDomain, orgId: org.id }, '[Shopify OAuth] Integration saved');

    // Soft-fail: a registration error should not break the OAuth flow.
    let gatewayUrl: string | null = null;
    try {
      gatewayUrl = getGatewayBaseUrl();
    } catch (error) {
      logger.warn({ err: error, shop: canonicalShopDomain }, '[Shopify OAuth] Gateway URL invalid — skipping webhook registration');
    }

    if (gatewayUrl) {
      await Promise.allSettled(
        SHOPIFY_WEBHOOK_TOPICS.map(async (topic) => {
          try {
            await shopifyRestJson(
              { shop: canonicalShopDomain, accessToken },
              'webhooks.json',
              {
                method: 'POST',
                maxRetries: 0,
                body: { webhook: { topic, address: `${gatewayUrl}/webhooks/shopify`, format: 'json' } },
              }
            );
            logger.info({ topic, shop: canonicalShopDomain }, '[Shopify OAuth] Webhook registered');
          } catch (err) {
            const detail = err instanceof ShopifyRequestError ? err.payload ?? {} : err;
            logger.warn({ topic, shop: canonicalShopDomain, err: detail }, '[Shopify OAuth] Webhook registration failed');
            void recordProviderSendFailure('shopify', 'webhook_registration', org.id, {
              counterClient: getRedis(),
              integrationId: shopifyIntegrationId,
              detail: `Shopify webhook registration failed for ${topic}`,
              extra: { topic, shop: canonicalShopDomain },
            });
          }
        })
      );
    } else {
      logger.warn({ shop: canonicalShopDomain }, '[Shopify OAuth] Gateway URL not set — skipping webhook registration');
    }

    return oauthComplete(appUrl, { connected: 'shopify', returnTo });

  } catch (err) {
    logger.error({ err }, '[Shopify OAuth] Unexpected error');
    return oauthComplete(appUrl, { error: 'shopify_server_error', returnTo });
  }
}

async function fetchShopifyShopIdentity(shop: string, accessToken: string) {
  const shopData = await shopifyRestJson<{ shop?: { id?: number | string; name?: string; myshopify_domain?: string } }>(
    { shop, accessToken },
    'shop.json',
    { maxRetries: 0 },
  );
  const identity = parseShopifyShopIdentity(shopData, shop);
  if (!identity) {
    throw new Error(`Shopify shop identity missing for ${shop}`);
  }
  return identity;
}
