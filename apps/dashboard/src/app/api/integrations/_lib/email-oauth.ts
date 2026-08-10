import { NextResponse } from 'next/server';
import { readEnv } from '@/lib/env/helpers';
import type { EmailOAuthProviderConfig } from './email-oauth-providers';
import { oauthProviderRedirect } from './oauth-callback';
import {
  createOAuthSessionCookies,
  requireAuthenticatedOAuthSession,
} from './oauth-session';

function callbackPath(config: EmailOAuthProviderConfig): string {
  return `/api/integrations/${config.provider}/callback`;
}

export async function createEmailOAuthAuthorizationResponse(
  request: Request,
  config: EmailOAuthProviderConfig,
): Promise<Response> {
  const sessionResult = await requireAuthenticatedOAuthSession();
  if (!sessionResult.ok) return sessionResult.response;
  const session = sessionResult.session;

  const clientId = readEnv(config.clientIdEnv);
  const appUrl = readEnv('APP_URL');
  if (!clientId || !appUrl) {
    return NextResponse.json(
      { error: `${config.clientIdEnv} or APP_URL is not configured` },
      { status: 500 },
    );
  }

  const { state } = await createOAuthSessionCookies(
    request,
    { provider: config.provider },
    session,
  );
  const authorizationUrl = new URL(config.authorizationUrl);
  authorizationUrl.searchParams.set('client_id', clientId);
  authorizationUrl.searchParams.set('redirect_uri', `${appUrl}${callbackPath(config)}`);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('scope', config.scopes.join(' '));
  authorizationUrl.searchParams.set('prompt', 'consent');
  authorizationUrl.searchParams.set('state', state);

  for (const [key, value] of Object.entries(config.authorizationParams)) {
    authorizationUrl.searchParams.set(key, value);
  }

  return oauthProviderRedirect(authorizationUrl);
}
