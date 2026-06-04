import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import logger from '@/lib/server/logger';
import { upsertExclusiveEmailIntegration } from './email-integration';
import type { EmailOAuthProviderConfig } from './email-oauth-providers';
import {
  createOAuthSessionCookies,
  requireAuthenticatedOAuthSession,
  validateOAuthCallbackSession,
} from './oauth-session';

interface OAuthTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

function callbackPath(config: EmailOAuthProviderConfig): string {
  return `/api/integrations/${config.provider}/callback`;
}

function logPrefix(config: EmailOAuthProviderConfig): string {
  return `${config.displayName} OAuth`;
}

export async function createEmailOAuthAuthorizationResponse(
  request: Request,
  config: EmailOAuthProviderConfig,
): Promise<Response> {
  const session = await requireAuthenticatedOAuthSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientId = process.env[config.clientIdEnv];
  const appUrl = process.env.APP_URL;
  if (!clientId || !appUrl) {
    return NextResponse.json(
      { error: `${config.clientIdEnv} or APP_URL is not configured` },
      { status: 500 },
    );
  }

  const { state } = await createOAuthSessionCookies(request, { prefix: config.provider }, session);
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

  return NextResponse.redirect(authorizationUrl.toString());
}

export async function completeEmailOAuth(
  request: Request,
  config: EmailOAuthProviderConfig,
): Promise<Response> {
  const appUrl = process.env.APP_URL;
  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];
  const prefix = logPrefix(config);

  if (!appUrl || !clientId || !clientSecret) {
    return NextResponse.json({ error: 'OAuth callback is not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const oauthError = searchParams.get('error');

  if (oauthError) {
    logger.warn({ error: oauthError }, `[${prefix}] User denied access`);
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=access_denied`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=invalid_callback`);
  }

  const callbackSession = await validateOAuthCallbackSession({
    appUrl,
    logPrefix: prefix,
    prefix: config.provider,
    state,
  });
  if (!callbackSession.ok) return callbackSession.response;
  const { clerkOrgId, returnTo } = callbackSession.session;

  try {
    const tokenResponse = await fetch(config.tokenUrl, {
      cache: 'no-store',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${appUrl}${callbackPath(config)}`,
      }).toString(),
    });
    const tokenData = await tokenResponse.json() as OAuthTokenResponse;

    if (!tokenData.access_token || !tokenData.refresh_token || !tokenData.expires_in) {
      logger.error({ tokenData }, `[${prefix}] Token exchange failed`);
      return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=token_exchange_failed`);
    }

    const userinfoResponse = await fetch(config.userinfoUrl, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userinfo = await userinfoResponse.json() as unknown;
    const userEmail = config.extractEmail(userinfo);
    if (!userEmail) {
      logger.error({ userinfo }, `[${prefix}] userinfo missing email`);
      return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=no_email`);
    }

    if (!clerkOrgId) {
      logger.error(`[${prefix}] Missing org cookie , session likely interrupted`);
      return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=server_error`);
    }
    const org = await db.organization.findUnique({ where: { clerkOrgId } });
    if (!org) {
      logger.error({ clerkOrgId }, `[${prefix}] Org not found`);
      return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=server_error`);
    }

    await upsertExclusiveEmailIntegration({
      organizationId: org.id,
      externalAccountId: userEmail,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
      provider: config.provider,
    });

    logger.info({ userEmail, orgId: org.id }, `[${prefix}] Integration saved`);
    const successUrl = returnTo
      ? `${appUrl}${returnTo}`
      : `${appUrl}/dashboard/integrations?connected=${config.provider}`;
    return NextResponse.redirect(successUrl);
  } catch (error) {
    logger.error({ err: error }, `[${prefix}] Unexpected error`);
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=server_error`);
  }
}
