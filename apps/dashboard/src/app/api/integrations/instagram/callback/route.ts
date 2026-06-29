import { NextResponse } from 'next/server';
import logger from '@/lib/server/logger';
import { getMetaOAuthCallbackConfig } from '@/lib/env';
import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';
import {
  captureIntegrationConnectionCompleted,
  captureIntegrationConnectionFailed,
  captureOAuthIntegrationConnectionFailed,
} from '@/lib/server/product-analytics';
import { validateOAuthCallbackSession } from '@/app/api/integrations/_lib/oauth-session';
import { upsertRaceSafeIntegration } from '@/app/api/integrations/_lib/integration-upsert';
import {
  integrationsResponse,
  oauthDestinationResponse,
  resolveOAuthOrganization,
} from '@/app/api/integrations/_lib/oauth-callback';
import {
  exchangeLongLivedMetaToken,
  exchangeMetaOAuthCode,
  listMetaInstagramPages,
  subscribeMetaInstagramMessaging,
} from '@/app/api/integrations/_lib/meta-oauth-client';

export async function GET(request: Request) {
  return createPostRedirectResponse(request, 'Finish Instagram connection');
}

export async function POST(request: Request) {
  const oauthConfig = getMetaOAuthCallbackConfig();

  if (!oauthConfig) {
    return NextResponse.json({ error: 'OAuth callback is not configured' }, { status: 500 });
  }
  const { appId, appSecret, appUrl, redirectUri } = oauthConfig;

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error && !state) {
    logger.warn({ error }, '[IG OAuth] User denied access');
    return integrationsResponse(appUrl, { error: 'access_denied' });
  }

  if ((!code && !error) || !state) {
    return integrationsResponse(appUrl, { error: 'invalid_callback' });
  }

  const callbackSession = await validateOAuthCallbackSession({
    appUrl,
    logPrefix: 'IG OAuth',
    prefix: 'ig',
    state,
  });
  if (!callbackSession.ok) {
    await captureOAuthIntegrationConnectionFailed({
      ...callbackSession.analyticsContext,
      failureCategory: 'state_mismatch',
      platform: 'ig_dm',
    });
    return callbackSession.response;
  }
  const { attemptId, clerkOrgId, returnTo } = callbackSession.session;
  const orgResult = await resolveOAuthOrganization(clerkOrgId, 'IG OAuth');
  if (!orgResult.ok) return integrationsResponse(appUrl, { error: orgResult.error });
  const organizationId = orgResult.org.id;

  if (error) {
    logger.warn({ error }, '[IG OAuth] User denied access');
    await captureIntegrationConnectionFailed({
      attemptId,
      failureCategory: 'access_denied',
      organizationId,
      platform: 'ig_dm',
    });
    return integrationsResponse(appUrl, { error: 'access_denied' });
  }
  if (!code) {
    await captureIntegrationConnectionFailed({
      attemptId,
      failureCategory: 'invalid_callback',
      organizationId,
      platform: 'ig_dm',
    });
    return integrationsResponse(appUrl, { error: 'invalid_callback' });
  }

  try {
    // ---------------------------------------------------------------
    // Step 1: Exchange code for a short-lived user access token
    // ---------------------------------------------------------------
    const tokenResult = await exchangeMetaOAuthCode({
      appId,
      appSecret,
      code,
      redirectUri,
    });
    if (!tokenResult.accessToken) {
      logger.error(
        {
          status: tokenResult.status,
          errorType: tokenResult.error.type,
          errorCode: tokenResult.error.code,
        },
        '[IG OAuth] Token exchange failed',
      );
      await captureIntegrationConnectionFailed({
        attemptId,
        failureCategory: tokenResult.status === 429
          ? 'rate_limited'
          : tokenResult.status >= 500
            ? 'provider_unavailable'
            : 'invalid_credentials',
        organizationId,
        platform: 'ig_dm',
      });
      return integrationsResponse(appUrl, { error: 'token_exchange_failed' });
    }
    const shortLivedToken = tokenResult.accessToken;

    // ---------------------------------------------------------------
    // Step 2: Upgrade to a long-lived user access token (60 days)
    // ---------------------------------------------------------------
    const userToken = await exchangeLongLivedMetaToken({
      appId,
      appSecret,
      shortLivedToken,
    }) ?? shortLivedToken;

    // ---------------------------------------------------------------
    // Step 3: Get pages the user manages with their linked IG accounts
    // Requires the user to have classic Page admin access (People with
    // Facebook access), not just Business Portfolio access.
    // ---------------------------------------------------------------
    const pages = await listMetaInstagramPages(userToken);
    logger.info(
      { pageCount: pages.length, pageNames: pages.map((page) => page.name) },
      '[IG OAuth] /me/accounts response',
    );

    const igPage = pages.find((page) => page.instagramBusinessAccount?.id);

    if (!igPage?.instagramBusinessAccount) {
      logger.error('[IG OAuth] No Instagram Business account found');
      await captureIntegrationConnectionFailed({
        attemptId,
        failureCategory: 'validation_failed',
        organizationId,
        platform: 'ig_dm',
      });
      return integrationsResponse(appUrl, { error: 'no_ig_account' });
    }

    const pageToken = igPage.accessToken;
    const pageId = igPage.id;
    const igAccountId = igPage.instagramBusinessAccount.id;
    const igUsername = igPage.instagramBusinessAccount.username || igAccountId;
    logger.info({ igUsername, igAccountId, pageId }, '[IG OAuth] Found Instagram account');

    // ---------------------------------------------------------------
    // Step 4: Subscribe to Instagram messaging webhooks
    // Must use the Facebook Page ID (not the IG account ID) per Meta docs.
    // ---------------------------------------------------------------
    const subscription = await subscribeMetaInstagramMessaging({
      pageId,
      pageToken,
    });
    if (!subscription.success) {
      logger.warn(
        { status: subscription.status, success: subscription.success },
        '[IG OAuth] Webhook subscription failed',
      );
    } else {
      logger.info('[IG OAuth] Webhook subscription succeeded');
    }

    // ---------------------------------------------------------------
    // Step 5: Save integration to database
    // externalAccountId = Instagram Business Account ID
    //   (matches entry[0].id in Meta webhook payloads)
    // accessToken = Page Access Token (used for sending messages)
    // fromEmail   = Instagram @username (displayed in the UI)
    // ---------------------------------------------------------------
    const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days
    const integrationData = { accessToken: pageToken, refreshToken: userToken, fromEmail: igUsername, tokenExpiresAt };
    const integration = await upsertRaceSafeIntegration({
      organizationId,
      platform: 'ig_dm',
      externalAccountId: igAccountId,
      data: integrationData,
    });
    await captureIntegrationConnectionCompleted({
      integrationId: integration.id,
      organizationId,
      platform: 'ig_dm',
    });

    logger.info({ igUsername, igAccountId, orgId: organizationId }, '[IG OAuth] Integration saved');
    return oauthDestinationResponse(appUrl, returnTo, 'instagram');

  } catch (err) {
    logger.error({ err }, '[IG OAuth] Unexpected error');
    await captureIntegrationConnectionFailed({
      attemptId,
      failureCategory: 'unknown',
      organizationId,
      platform: 'ig_dm',
    });
    return integrationsResponse(appUrl, { error: 'server_error' });
  }
}
