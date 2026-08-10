import { NextResponse } from 'next/server';
import { createPostRedirectResponse } from '@/lib/server/post-redirect-response';
import { readEnv } from '@/lib/env/helpers';
import { GMAIL_EMAIL_OAUTH } from '@/app/api/integrations/_lib/email-oauth-providers';
import { oauthCompleteResponse } from '@/app/api/integrations/_lib/oauth-callback';
import { runOAuthCallback } from '@/app/api/integrations/_lib/oauth-callback-runner';
import { completeGmailOAuth } from './complete-gmail-oauth';

export async function GET(request: Request) {
  return createPostRedirectResponse(request, 'Finishing Gmail connection');
}

export async function POST(request: Request) {
  const appUrl = readEnv('APP_URL');
  const clientId = readEnv(GMAIL_EMAIL_OAUTH.clientIdEnv);
  const clientSecret = readEnv(GMAIL_EMAIL_OAUTH.clientSecretEnv);
  if (!appUrl) {
    return NextResponse.json({ error: 'OAuth callback is not configured' }, { status: 500 });
  }
  if (!clientId || !clientSecret) {
    return oauthCompleteResponse(appUrl, {
      outcome: { status: 'failed', provider: 'gmail', error: 'provider_unavailable' },
    });
  }

  const redirectUri = `${appUrl}/api/integrations/gmail/callback`;
  return runOAuthCallback({
    request,
    descriptor: {
      analyticsPlatform: 'email',
      appUrl,
      invalidCallbackError: 'invalid_callback',
      logPrefix: 'Gmail OAuth',
      provider: 'gmail',
      serverError: 'server_error',
      stateMismatchError: 'state_mismatch',
    },
    complete: ({ code, organizationId }) => completeGmailOAuth({
      clientId,
      clientSecret,
      code,
      config: GMAIL_EMAIL_OAUTH,
      organizationId,
      redirectUri,
    }),
  });
}
