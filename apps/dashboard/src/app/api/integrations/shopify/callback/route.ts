import { NextResponse } from 'next/server';
import crypto from 'crypto';
import logger from '@/lib/server/logger';
import { getShopifyOAuthCallbackConfig } from '@/lib/env';
import { getGatewayBaseUrl } from '@/lib/server/gateway-url';
import { recordProviderSendFailure } from '@/lib/server/provider-send-alerts';
import { getRedis } from '@/lib/server/redis';
import {
  captureIntegrationConnectionCompleted,
  captureIntegrationConnectionFailed,
  captureOAuthIntegrationConnectionFailed,
} from '@/lib/server/product-analytics';
import { timingSafeIncludes } from '@/lib/security/timing-safe';
import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';
import { normalizeShopifyShopDomain, parseShopifyShopIdentity, isSameShopifyStore } from '@/lib/shopify/oauth';
import { shopifyRestJson, ShopifyRequestError } from '@shopkeeper/agent/shopify';
import { validateOAuthCallbackSession } from '@/app/api/integrations/_lib/oauth-session';
import { upsertRaceSafeIntegration } from '@/app/api/integrations/_lib/integration-upsert';
import {
  oauthCompleteResponse,
  resolveOAuthOrganization,
} from '@/app/api/integrations/_lib/oauth-callback';

const SHOPIFY_WEBHOOK_TOPICS = ['orders/created', 'orders/fulfilled', 'orders/updated', 'orders/cancelled', 'app/uninstalled'];

export async function GET(request: Request) {
  return createPostRedirectResponse(request, 'Finish Shopify connection');
}

export async function POST(request: Request) {
  const oauthConfig = getShopifyOAuthCallbackConfig();

  if (!oauthConfig) {
    return NextResponse.json({ error: 'OAuth callback is not configured' }, { status: 500 });
  }
  const { appUrl, clientId, clientSecret } = oauthConfig;

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const shop = searchParams.get('shop');
  const state = searchParams.get('state');
  const hmac = searchParams.get('hmac');

  const callbackSession = await validateOAuthCallbackSession({
    appUrl,
    extraCookieKeys: ['shop'],
    logPrefix: 'Shopify OAuth',
    prefix: 'shopify',
    state,
    stateMismatchError: 'shopify_state_mismatch',
  });
  if (!callbackSession.ok) {
    await captureOAuthIntegrationConnectionFailed({
      ...callbackSession.analyticsContext,
      failureCategory: 'state_mismatch',
      platform: 'shopify',
    });
    return callbackSession.response;
  }
  const {
    attemptId,
    clerkOrgId,
    returnTo,
    extra: { shop: savedShop },
  } = callbackSession.session;
  const orgResult = await resolveOAuthOrganization(clerkOrgId, 'Shopify OAuth');
  if (!orgResult.ok) return oauthCompleteResponse(appUrl, { error: 'shopify_server_error', returnTo });
  const org = orgResult.org;

  if (!code || !shop || !hmac) {
    await captureIntegrationConnectionFailed({
      attemptId,
      failureCategory: 'invalid_callback',
      organizationId: org.id,
      platform: 'shopify',
    });
    return oauthCompleteResponse(appUrl, { error: 'shopify_invalid_callback', returnTo });
  }

  const shopDomain = normalizeShopifyShopDomain(shop);
  if (!shopDomain || !savedShop) {
    await captureIntegrationConnectionFailed({
      attemptId,
      failureCategory: 'invalid_callback',
      organizationId: org.id,
      platform: 'shopify',
    });
    return oauthCompleteResponse(appUrl, { error: 'shopify_invalid_callback', returnTo });
  }

  if (!isValidShopifyHmac(searchParams, clientSecret, hmac)) {
    logger.error('[Shopify OAuth] HMAC verification failed');
    await captureIntegrationConnectionFailed({
      attemptId,
      failureCategory: 'invalid_callback',
      organizationId: org.id,
      platform: 'shopify',
    });
    return oauthCompleteResponse(appUrl, { error: 'shopify_hmac_invalid', returnTo });
  }

  try {
    const accessToken = await exchangeShopifyAccessToken({
      clientId,
      clientSecret,
      code,
      shopDomain,
    });
    if (!accessToken) {
      await captureIntegrationConnectionFailed({
        attemptId,
        failureCategory: 'invalid_credentials',
        organizationId: org.id,
        platform: 'shopify',
      });
      return oauthCompleteResponse(appUrl, { error: 'shopify_token_failed', returnTo });
    }

    const shopIdentityResult = await resolveShopifyAuthorizedShop({
      accessToken,
      savedShop,
      shopDomain,
    });
    if (!shopIdentityResult.ok) {
      await captureIntegrationConnectionFailed({
        attemptId,
        failureCategory: shopIdentityResult.error === 'shopify_shop_mismatch'
          ? 'validation_failed'
          : 'provider_unavailable',
        organizationId: org.id,
        platform: 'shopify',
      });
      return oauthCompleteResponse(appUrl, { error: shopIdentityResult.error, returnTo });
    }

    const canonicalShopDomain = shopIdentityResult.shop.myshopifyDomain;
    const shopName = shopIdentityResult.shop.name;

    const shopifyIntegration = await upsertRaceSafeIntegration({
      organizationId: org.id,
      platform: 'shopify',
      externalAccountId: canonicalShopDomain,
      data: { accessToken, fromEmail: shopName, tokenExpiresAt: null },
    });
    const shopifyIntegrationId = shopifyIntegration.id;
    await captureIntegrationConnectionCompleted({
      integrationId: shopifyIntegrationId,
      organizationId: org.id,
      platform: 'shopify',
    });

    logger.info({ shopName, shop: canonicalShopDomain, orgId: org.id }, '[Shopify OAuth] Integration saved');

    await registerShopifyWebhooks({
      accessToken,
      integrationId: shopifyIntegrationId,
      orgId: org.id,
      shop: canonicalShopDomain,
    });

    return oauthCompleteResponse(appUrl, { connected: 'shopify', returnTo });

  } catch (err) {
    logger.error({ err }, '[Shopify OAuth] Unexpected error');
    await captureIntegrationConnectionFailed({
      attemptId,
      failureCategory: 'unknown',
      organizationId: org.id,
      platform: 'shopify',
    });
    return oauthCompleteResponse(appUrl, { error: 'shopify_server_error', returnTo });
  }
}

function isValidShopifyHmac(
  searchParams: URLSearchParams,
  clientSecret: string,
  hmac: string,
): boolean {
  const params: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    if (key !== 'hmac') params[key] = value;
  });
  const message = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  const digest = crypto.createHmac('sha256', clientSecret).update(message).digest('hex');
  return timingSafeIncludes([digest], hmac);
}

async function exchangeShopifyAccessToken({
  clientId,
  clientSecret,
  code,
  shopDomain,
}: {
  clientId: string;
  clientSecret: string;
  code: string;
  shopDomain: string;
}): Promise<string | null> {
  const tokenRes = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    cache: 'no-store',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  const tokenData = await tokenRes.json() as { access_token?: string; error?: unknown };

  if (!tokenData.access_token) {
    logger.error(
      { status: tokenRes.status, error: tokenData.error },
      '[Shopify OAuth] Token exchange failed',
    );
    return null;
  }

  return tokenData.access_token;
}

async function resolveShopifyAuthorizedShop({
  accessToken,
  savedShop,
  shopDomain,
}: {
  accessToken: string;
  savedShop: string;
  shopDomain: string;
}): Promise<
  | { ok: true; shop: Awaited<ReturnType<typeof fetchShopifyShopIdentity>> }
  | { ok: false; error: 'shopify_server_error' | 'shopify_shop_mismatch' }
> {
  let authorizedShop: Awaited<ReturnType<typeof fetchShopifyShopIdentity>>;
  try {
    authorizedShop = await fetchShopifyShopIdentity(shopDomain, accessToken);
  } catch (err) {
    logger.error({ err, shop: shopDomain }, '[Shopify OAuth] Failed to fetch authorized shop identity');
    return { ok: false, error: 'shopify_server_error' };
  }

  if (savedShop === shopDomain) return { ok: true, shop: authorizedShop };

  try {
    const requestedShop = await fetchShopifyShopIdentity(savedShop, accessToken);
    if (!isSameShopifyStore(authorizedShop, requestedShop)) {
      logger.error(
        { shop: shopDomain, savedShop, authorizedShopId: authorizedShop.id, requestedShopId: requestedShop.id },
        '[Shopify OAuth] Shop domain mismatch — possible CSRF attempt',
      );
      return { ok: false, error: 'shopify_shop_mismatch' };
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
    return { ok: false, error: 'shopify_shop_mismatch' };
  }

  return { ok: true, shop: authorizedShop };
}

async function registerShopifyWebhooks({
  accessToken,
  integrationId,
  orgId,
  shop,
}: {
  accessToken: string;
  integrationId: string;
  orgId: string;
  shop: string;
}): Promise<void> {
  let gatewayUrl: string | null = null;
  try {
    gatewayUrl = getGatewayBaseUrl();
  } catch (error) {
    logger.warn({ err: error, shop }, '[Shopify OAuth] Gateway URL invalid — skipping webhook registration');
  }

  if (!gatewayUrl) {
    logger.warn({ shop }, '[Shopify OAuth] Gateway URL not set — skipping webhook registration');
    return;
  }

  await Promise.allSettled(
    SHOPIFY_WEBHOOK_TOPICS.map(async (topic) => {
      try {
        await shopifyRestJson(
          { shop, accessToken },
          'webhooks.json',
          {
            method: 'POST',
            maxRetries: 0,
            body: { webhook: { topic, address: `${gatewayUrl}/webhooks/shopify`, format: 'json' } },
          }
        );
        logger.info({ topic, shop }, '[Shopify OAuth] Webhook registered');
      } catch (err) {
        const detail = err instanceof ShopifyRequestError ? err.payload ?? {} : err;
        logger.warn({ topic, shop, err: detail }, '[Shopify OAuth] Webhook registration failed');
        void recordProviderSendFailure('shopify', 'webhook_registration', orgId, {
          counterClient: getRedis(),
          integrationId,
          detail: `Shopify webhook registration failed for ${topic}`,
          extra: { topic, shop },
        });
      }
    })
  );
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
