import { after } from 'next/server';
import { resolveGmailAccountType } from '@shopkeeper/email/providers';
import type { IntegrationFailureCategory } from '@shopkeeper/analytics';
import { isGmailNativeInboundEnabled } from '@/lib/env';
import logger from '@/lib/server/logger';
import { isRecord } from "@shopkeeper/agent/guards";
import {
  fetchProviderWithDeadline,
  isProviderRequestTimeoutError,
} from '@/lib/server/provider-fetch';
import type { OAuthCallbackCompletionResult } from '@/app/api/integrations/_lib/oauth-callback-runner';
import { upsertEmailIntegration } from '@/app/api/integrations/_lib/email-integration';
import type { EmailOAuthProviderConfig } from '@/app/api/integrations/_lib/email-oauth-providers';
import { registerGmailWatch } from '@/app/api/integrations/_lib/gmail-watch';

type GmailOAuthError = 'no_email' | 'provider_unavailable' | 'token_exchange_failed';

interface GmailToken {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  scopes?: string[];
}

type ProviderStepResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: GmailOAuthError;
      failureCategory: IntegrationFailureCategory;
    };

export async function completeGmailOAuth(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  config: EmailOAuthProviderConfig;
  organizationId: string;
  redirectUri: string;
}): Promise<OAuthCallbackCompletionResult<GmailOAuthError>> {
  const tokenResult = await exchangeGmailCode(input);
  if (!tokenResult.ok) return tokenResult;

  const userResult = await fetchGmailUser(input.config, tokenResult.data.accessToken);
  if (!userResult.ok) return userResult;

  const gmailNativeInboundEnabled = isGmailNativeInboundEnabled();
  const gmailAccountType = resolveGmailAccountType(
    userResult.data.email,
    userResult.data.hostedDomain,
  );
  const integrationId = await upsertEmailIntegration({
    organizationId: input.organizationId,
    externalAccountId: userResult.data.email,
    accessToken: tokenResult.data.accessToken,
    refreshToken: tokenResult.data.refreshToken,
    tokenExpiresAt: new Date(Date.now() + tokenResult.data.expiresIn * 1_000),
    provider: 'gmail',
    ...(gmailNativeInboundEnabled ? { inboundMode: 'hybrid' as const } : {}),
    oauthScopes: tokenResult.data.scopes,
    gmailMetadata: {
      accountType: gmailAccountType,
      ...(userResult.data.hostedDomain
        ? { hostedDomain: userResult.data.hostedDomain }
        : {}),
    },
  });

  if (gmailNativeInboundEnabled) scheduleGmailWatchRegistration(integrationId);
  logger.info(
    { userEmail: userResult.data.email, orgId: input.organizationId },
    '[Gmail OAuth] Integration saved',
  );
  return { ok: true, integrationId };
}

async function exchangeGmailCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  config: EmailOAuthProviderConfig;
  redirectUri: string;
}): Promise<ProviderStepResult<GmailToken>> {
  let response: Response;
  try {
    response = await fetchProviderWithDeadline(input.config.tokenUrl, {
      cache: 'no-store',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        code: input.code,
        grant_type: 'authorization_code',
        redirect_uri: input.redirectUri,
      }).toString(),
    }, {
      provider: 'gmail',
      operation: 'OAuth token exchange',
    });
  } catch (error) {
    if (isProviderRequestTimeoutError(error)) {
      logger.error('[Gmail OAuth] Token exchange timed out');
      return failure('provider_unavailable', 'provider_unavailable');
    }
    throw error;
  }

  if (!response.ok) {
    logger.error({ status: response.status }, '[Gmail OAuth] Token exchange failed');
    if (response.status === 429) return failure('token_exchange_failed', 'rate_limited');
    if (response.status >= 500) return failure('provider_unavailable', 'provider_unavailable');
    if (response.status >= 400) return failure('token_exchange_failed', 'invalid_credentials');
    return failure('token_exchange_failed', 'unknown');
  }

  const payload = await readJson(response);
  if (!isRecord(payload)) {
    logger.error('[Gmail OAuth] Token exchange returned malformed JSON');
    return failure('token_exchange_failed', 'unknown');
  }
  const accessToken = readNonEmptyString(payload.access_token);
  const refreshToken = readNonEmptyString(payload.refresh_token);
  const expiresIn = readPositiveNumber(payload.expires_in);
  if (!accessToken || !refreshToken || !expiresIn) {
    logger.error('[Gmail OAuth] Token exchange returned a malformed success response');
    return failure('token_exchange_failed', 'unknown');
  }

  return {
    ok: true,
    data: {
      accessToken,
      refreshToken,
      expiresIn,
      scopes: normalizeOAuthScopes(payload.scope),
    },
  };
}

async function fetchGmailUser(
  config: EmailOAuthProviderConfig,
  accessToken: string,
): Promise<ProviderStepResult<{ email: string; hostedDomain: string | null }>> {
  let response: Response;
  try {
    response = await fetchProviderWithDeadline(config.userinfoUrl, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${accessToken}` },
    }, {
      provider: 'gmail',
      operation: 'OAuth userinfo lookup',
    });
  } catch (error) {
    if (isProviderRequestTimeoutError(error)) {
      logger.error('[Gmail OAuth] Userinfo lookup timed out');
      return failure('provider_unavailable', 'provider_unavailable');
    }
    throw error;
  }

  if (!response.ok) {
    logger.error({ status: response.status }, '[Gmail OAuth] Userinfo lookup failed');
    if (response.status === 429) return failure('no_email', 'rate_limited');
    if (response.status >= 500) return failure('provider_unavailable', 'provider_unavailable');
    if (response.status >= 400) return failure('no_email', 'invalid_credentials');
    return failure('no_email', 'unknown');
  }

  const payload = await readJson(response);
  if (!isRecord(payload)) {
    logger.error('[Gmail OAuth] Userinfo lookup returned malformed JSON');
    return failure('no_email', 'unknown');
  }
  const email = config.extractEmail(payload);
  if (!email) {
    logger.error('[Gmail OAuth] userinfo missing email');
    return failure('no_email', 'validation_failed');
  }

  return {
    ok: true,
    data: {
      email,
      hostedDomain: readNonEmptyString(payload.hd),
    },
  };
}

function failure(
  error: GmailOAuthError,
  failureCategory: IntegrationFailureCategory,
): ProviderStepResult<never> {
  return { ok: false, error, failureCategory };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}


function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readPositiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeOAuthScopes(value: unknown): string[] | undefined {
  if (typeof value !== 'string') return undefined;
  const scopes = [...new Set(value.split(/\s+/).map((scope) => scope.trim()).filter(Boolean))];
  return scopes.length > 0 ? scopes : undefined;
}

function scheduleGmailWatchRegistration(integrationId: string): void {
  const register = () => registerGmailWatch(integrationId);
  try {
    after(register);
  } catch (error) {
    logger.debug(
      { err: error, integrationId },
      '[Gmail OAuth] after() unavailable; registering Gmail watch in background',
    );
    void register();
  }
}
