import { NextResponse } from 'next/server';
import logger from '@/lib/server/logger';
import { getShopifyOAuthCallbackConfig } from '@/lib/env';
import {
  captureIntegrationConnectionCompleted,
  captureIntegrationConnectionFailed,
  captureOAuthIntegrationConnectionFailed,
} from '@/lib/server/product-analytics';
import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';
import { validateOAuthCallbackSession } from '@/app/api/integrations/_lib/oauth-session';
import {
  oauthCompleteResponse,
  resolveOAuthOrganization,
} from '@/app/api/integrations/_lib/oauth-callback';
import { completeShopifyOAuth } from './complete-shopify-oauth';

export async function GET(request: Request) {
  return createPostRedirectResponse(request, 'Finish Shopify connection');
}

export async function POST(request: Request) {
  const oauthConfig = getShopifyOAuthCallbackConfig();

  if (!oauthConfig) {
    if (process.env.APP_URL) {
      return oauthCompleteResponse(process.env.APP_URL, {
        outcome: { status: 'failed', provider: 'shopify', error: 'shopify_server_error' },
      });
    }
    return NextResponse.json({ error: 'OAuth callback is not configured' }, { status: 500 });
  }
  const { appUrl, clientId, clientSecret } = oauthConfig;
  const { searchParams } = new URL(request.url);
  const state = searchParams.get('state');

  const callbackSession = await validateOAuthCallbackSession({
    appUrl,
    extraCookieKeys: ['shop'],
    logPrefix: 'Shopify OAuth',
    provider: 'shopify',
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
    mode,
    returnTo,
    extra: { shop: savedShop },
  } = callbackSession.session;

  const fail = async (
    error: 'shopify_hmac_invalid'
      | 'shopify_invalid_callback'
      | 'shopify_server_error'
      | 'shopify_shop_mismatch'
      | 'shopify_store_in_use'
      | 'shopify_token_failed',
    failureCategory: Parameters<typeof captureIntegrationConnectionFailed>[0]['failureCategory'],
    organizationId?: string,
  ) => {
    if (organizationId) {
      await captureIntegrationConnectionFailed({
        attemptId,
        failureCategory,
        organizationId,
        platform: 'shopify',
      });
    }
    return oauthCompleteResponse(appUrl, {
      outcome: { status: 'failed', provider: 'shopify', error },
      mode,
      returnTo,
    });
  };

  const orgResult = await resolveOAuthOrganization(clerkOrgId, 'Shopify OAuth');
  if (!orgResult.ok) return fail('shopify_server_error', 'unknown');
  const organizationId = orgResult.org.id;

  try {
    const result = await completeShopifyOAuth({
      clientId,
      clientSecret,
      organizationId,
      savedShop,
      searchParams,
    });
    if (!result.ok) return fail(result.error, result.failureCategory, organizationId);

    await captureIntegrationConnectionCompleted({
      integrationId: result.integrationId,
      organizationId: result.organizationId,
      platform: 'shopify',
    });
    return oauthCompleteResponse(appUrl, {
      outcome: { status: 'connected', provider: 'shopify' },
      mode,
      returnTo,
    });
  } catch (error) {
    logger.error({ err: error }, '[Shopify OAuth] Unexpected error');
    return fail('shopify_server_error', 'unknown', organizationId);
  }
}
