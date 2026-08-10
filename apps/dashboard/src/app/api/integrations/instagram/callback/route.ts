import { NextResponse } from 'next/server';
import logger from '@/lib/server/logger';
import { getInstagramOAuthCallbackConfig } from '@/lib/env';
import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';
import { oauthCompleteResponse } from '@/app/api/integrations/_lib/oauth-callback';
import { runOAuthCallback } from '@/app/api/integrations/_lib/oauth-callback-runner';
import { completeInstagramOAuth } from './complete-instagram-oauth';

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
  return runOAuthCallback({
    request,
    descriptor: {
      analyticsPlatform: 'ig_dm',
      appUrl,
      invalidCallbackError: 'invalid_callback',
      logPrefix: 'IG OAuth',
      provider: 'instagram',
      serverError: 'server_error',
      stateMismatchError: 'state_mismatch',
    },
    complete: ({ code, organizationId }) => completeInstagramOAuth({
      appId,
      appSecret,
      code,
      organizationId,
      redirectUri,
    }),
  });
}
