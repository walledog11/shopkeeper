import type { IntegrationFailureCategory } from '@shopkeeper/analytics';
import { NextResponse } from 'next/server';
import logger from '@/lib/server/logger';
import { getInstagramOAuthCallbackConfig } from '@/lib/env';
import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';
import {
  captureIntegrationConnectionCompleted,
  captureIntegrationConnectionFailed,
  captureOAuthIntegrationConnectionFailed,
} from '@/lib/server/product-analytics';
import { validateOAuthCallbackSession } from '@/app/api/integrations/_lib/oauth-session';
import {
  oauthCompleteResponse,
  resolveOAuthOrganization,
} from '@/app/api/integrations/_lib/oauth-callback';
import {
  completeInstagramOAuth,
  type InstagramOAuthError,
} from './complete-instagram-oauth';

type CallbackError = InstagramOAuthError | 'access_denied' | 'server_error';

export async function GET(request: Request) {
  const url = new URL(request.url);
  logger.info(
    { callbackUrl: `${url.origin}${url.pathname}` },
    '[IG OAuth] Authorization callback received',
  );
  return createPostRedirectResponse(request, 'Finish Instagram connection');
}

export async function POST(request: Request) {
  const oauthConfig = getInstagramOAuthCallbackConfig();
  if (!oauthConfig) {
    if (process.env.APP_URL) {
      return oauthCompleteResponse(process.env.APP_URL, {
        outcome: { status: 'failed', provider: 'instagram', error: 'provider_unavailable' },
      });
    }
    return NextResponse.json({ error: 'OAuth callback is not configured' }, { status: 500 });
  }
  const { appId, appSecret, appUrl, redirectUri } = oauthConfig;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const providerError = searchParams.get('error');

  const callbackSession = await validateOAuthCallbackSession({
    appUrl,
    logPrefix: 'IG OAuth',
    provider: 'instagram',
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

  const { attemptId, clerkOrgId, mode, returnTo } = callbackSession.session;
  const orgResult = await resolveOAuthOrganization(clerkOrgId, 'IG OAuth');
  if (!orgResult.ok) {
    return oauthCompleteResponse(appUrl, {
      outcome: { status: 'failed', provider: 'instagram', error: orgResult.error },
      mode,
      returnTo,
    });
  }
  const organizationId = orgResult.org.id;
  const fail = async (error: CallbackError, failureCategory: IntegrationFailureCategory) => {
    await captureIntegrationConnectionFailed({
      attemptId,
      failureCategory,
      organizationId,
      platform: 'ig_dm',
    });
    return oauthCompleteResponse(appUrl, {
      outcome: { status: 'failed', provider: 'instagram', error },
      mode,
      returnTo,
    });
  };

  if (providerError) {
    logger.warn({ providerError }, '[IG OAuth] User denied access');
    return fail('access_denied', 'access_denied');
  }
  if (!code) return fail('invalid_callback', 'invalid_callback');

  try {
    const result = await completeInstagramOAuth({
      appId,
      appSecret,
      code,
      organizationId,
      redirectUri,
    });
    if (!result.ok) return fail(result.error, result.failureCategory);

    await captureIntegrationConnectionCompleted({
      integrationId: result.integrationId,
      organizationId,
      platform: 'ig_dm',
    });
    logger.info(
      {
        accountId: result.accountId,
        integrationId: result.integrationId,
        organizationId,
        username: result.username,
      },
      '[IG OAuth] Instagram Login integration is ready',
    );
    return oauthCompleteResponse(appUrl, {
      outcome: { status: 'connected', provider: 'instagram' },
      mode,
      returnTo,
    });
  } catch (error) {
    logger.error(
      { errorClass: error instanceof Error ? error.name : 'UnknownError' },
      '[IG OAuth] Unexpected error',
    );
    return fail('server_error', 'unknown');
  }
}
