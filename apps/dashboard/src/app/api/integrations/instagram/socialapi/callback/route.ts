import { NextResponse } from 'next/server';
import { getDashboardAppUrl } from '@/lib/env';
import logger from '@/lib/server/logger';
import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';
import { runOAuthCallback } from '@/app/api/integrations/_lib/oauth-callback-runner';
import { completeSocialApiOAuth } from './complete-socialapi-oauth';

export async function GET(request: Request) {
  const url = new URL(request.url);
  logger.info(
    { callbackUrl: `${url.origin}${url.pathname}` },
    '[SocialAPI OAuth] Authorization callback received',
  );
  return createPostRedirectResponse(request, 'Finish Instagram connection');
}

export async function POST(request: Request) {
  let appUrl: string;
  try {
    appUrl = getDashboardAppUrl();
  } catch {
    return NextResponse.json({ error: 'OAuth callback is not configured' }, { status: 500 });
  }

  return runOAuthCallback({
    request,
    descriptor: {
      analyticsPlatform: 'ig_dm',
      appUrl,
      invalidCallbackError: 'invalid_callback',
      logPrefix: 'SocialAPI OAuth',
      provider: 'instagram',
      serverError: 'server_error',
      // SocialAPI owns `state`; ours rides the redirect URI it echoes back.
      stateParam: 'attempt',
      extraSessionFields: ['socialApiState', 'socialApiBrandId'],
      stateMismatchError: 'state_mismatch',
    },
    complete: ({ code, organizationId, searchParams, session }) => completeSocialApiOAuth({
      appUrl,
      attemptState: session.attemptId,
      code,
      organizationId,
      providerState: searchParams.get('state'),
      savedBrandId: session.extra.socialApiBrandId,
      savedProviderState: session.extra.socialApiState,
    }),
  });
}
