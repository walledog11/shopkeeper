import { after, NextResponse } from 'next/server';
import logger from '@/lib/server/logger';
import { isGmailNativeInboundEnabled } from '@/lib/env';
import { readEnv } from '@/lib/env/helpers';
import { resolveGmailAccountType } from '@shopkeeper/email/providers';
import {
  captureIntegrationConnectionFailed,
  captureOAuthIntegrationConnectionFailed,
} from '@/lib/server/product-analytics';
import { upsertEmailIntegration } from './email-integration';
import type { EmailOAuthProviderConfig } from './email-oauth-providers';
import {
  oauthCompleteResponse,
  oauthPageRedirect,
  resolveOAuthOrganization,
} from './oauth-callback';
import {
  createOAuthSessionCookies,
  requireAuthenticatedOAuthSession,
  validateOAuthCallbackSession,
} from './oauth-session';
import { registerGmailWatch } from './gmail-watch';

interface OAuthTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

function normalizeOAuthScopes(scope: string | undefined): string[] | undefined {
  if (!scope) return undefined;
  const scopes = [...new Set(scope.split(/\s+/).map((value) => value.trim()).filter(Boolean))];
  return scopes.length > 0 ? scopes : undefined;
}

function callbackPath(config: EmailOAuthProviderConfig): string {
  return `/api/integrations/${config.provider}/callback`;
}

function logPrefix(config: EmailOAuthProviderConfig): string {
  return `${config.displayName} OAuth`;
}

function emailOAuthCompleteResponse(
  appUrl: string,
  config: EmailOAuthProviderConfig,
  params: {
    connected?: string;
    error?: string;
    returnTo?: string | null;
  },
): Response {
  return oauthCompleteResponse(appUrl, {
    ...params,
    integration: config.provider,
  });
}

function scheduleGmailWatchRegistration(integrationId: string, prefix: string): void {
  const register = () => registerGmailWatch(integrationId);

  try {
    after(register);
  } catch (error) {
    logger.debug(
      { err: error, integrationId },
      `[${prefix}] after() unavailable; registering Gmail watch in background`,
    );
    void register();
  }
}

export async function createEmailOAuthAuthorizationResponse(
  request: Request,
  config: EmailOAuthProviderConfig,
): Promise<Response> {
  const session = await requireAuthenticatedOAuthSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientId = readEnv(config.clientIdEnv);
  const appUrl = readEnv('APP_URL');
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

  return oauthPageRedirect(authorizationUrl.toString());
}

export async function completeEmailOAuth(
  request: Request,
  config: EmailOAuthProviderConfig,
): Promise<Response> {
  const appUrl = readEnv('APP_URL');
  const clientId = readEnv(config.clientIdEnv);
  const clientSecret = readEnv(config.clientSecretEnv);
  const prefix = logPrefix(config);

  if (!appUrl || !clientId || !clientSecret) {
    return NextResponse.json({ error: 'OAuth callback is not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const oauthError = searchParams.get('error');

  if (oauthError && !state) {
    logger.warn({ error: oauthError }, `[${prefix}] User denied access`);
    return emailOAuthCompleteResponse(appUrl, config, { error: 'access_denied' });
  }
  if ((!code && !oauthError) || !state) {
    return emailOAuthCompleteResponse(appUrl, config, { error: 'invalid_callback' });
  }

  const callbackSession = await validateOAuthCallbackSession({
    appUrl,
    logPrefix: prefix,
    prefix: config.provider,
    state,
  });
  if (!callbackSession.ok) {
    await captureOAuthIntegrationConnectionFailed({
      ...callbackSession.analyticsContext,
      failureCategory: 'state_mismatch',
      platform: 'email',
    });
    return callbackSession.response;
  }
  const { attemptId, clerkOrgId, returnTo } = callbackSession.session;

  const orgResult = await resolveOAuthOrganization(clerkOrgId, prefix);
  if (!orgResult.ok) return emailOAuthCompleteResponse(appUrl, config, { error: orgResult.error, returnTo });
  const organizationId = orgResult.org.id;

  if (oauthError) {
    logger.warn({ error: oauthError }, `[${prefix}] User denied access`);
    await captureIntegrationConnectionFailed({
      attemptId,
      failureCategory: 'access_denied',
      organizationId,
      platform: 'email',
    });
    return emailOAuthCompleteResponse(appUrl, config, { error: 'access_denied', returnTo });
  }
  if (!code) {
    await captureIntegrationConnectionFailed({
      attemptId,
      failureCategory: 'invalid_callback',
      organizationId,
      platform: 'email',
    });
    return emailOAuthCompleteResponse(appUrl, config, { error: 'invalid_callback', returnTo });
  }

  try {
    const gmailNativeInboundEnabled = config.provider === 'gmail'
      && isGmailNativeInboundEnabled();
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
      logger.error({ status: tokenResponse.status }, `[${prefix}] Token exchange failed`);
      await captureIntegrationConnectionFailed({
        attemptId,
        failureCategory: tokenResponse.status === 429
          ? 'rate_limited'
          : tokenResponse.status >= 500
            ? 'provider_unavailable'
            : 'invalid_credentials',
        organizationId,
        platform: 'email',
      });
      return emailOAuthCompleteResponse(appUrl, config, { error: 'token_exchange_failed', returnTo });
    }

    const userinfoResponse = await fetch(config.userinfoUrl, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userinfo = await userinfoResponse.json() as unknown;
    const userEmail = config.extractEmail(userinfo);
    if (!userEmail) {
      logger.error(`[${prefix}] userinfo missing email`);
      await captureIntegrationConnectionFailed({
        attemptId,
        failureCategory: 'validation_failed',
        organizationId,
        platform: 'email',
      });
      return emailOAuthCompleteResponse(appUrl, config, { error: 'no_email', returnTo });
    }

    const hostedDomain = config.provider === 'gmail'
      && typeof userinfo === 'object'
      && userinfo !== null
      && 'hd' in userinfo
      && typeof (userinfo as { hd?: unknown }).hd === 'string'
      ? (userinfo as { hd: string }).hd
      : null;
    const gmailAccountType = config.provider === 'gmail'
      ? resolveGmailAccountType(userEmail, hostedDomain)
      : undefined;

    const integrationId = await upsertEmailIntegration({
      organizationId,
      externalAccountId: userEmail,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
      provider: config.provider,
      ...(gmailNativeInboundEnabled ? { inboundMode: 'hybrid' as const } : {}),
      oauthScopes: normalizeOAuthScopes(tokenData.scope),
      ...(gmailAccountType ? {
        gmailMetadata: {
          accountType: gmailAccountType,
          ...(hostedDomain ? { hostedDomain } : {}),
        },
      } : {}),
    });
    if (gmailNativeInboundEnabled) {
      scheduleGmailWatchRegistration(integrationId, prefix);
    }

    logger.info({ userEmail, orgId: organizationId }, `[${prefix}] Integration saved`);
    return emailOAuthCompleteResponse(appUrl, config, { connected: config.provider, returnTo });
  } catch (error) {
    logger.error({ err: error }, `[${prefix}] Unexpected error`);
    await captureIntegrationConnectionFailed({
      attemptId,
      failureCategory: 'unknown',
      organizationId,
      platform: 'email',
    });
    return emailOAuthCompleteResponse(appUrl, config, { error: 'server_error', returnTo });
  }
}
