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
  InstagramAccountInUseError,
  inspectInstagramConnection,
  persistInstagramConnection,
} from '@/app/api/integrations/_lib/instagram-connection';
import {
  integrationsResponse,
  oauthDestinationResponse,
  resolveOAuthOrganization,
} from '@/app/api/integrations/_lib/oauth-callback';
import {
  INSTAGRAM_REQUIRED_SCOPES,
  exchangeInstagramAuthorizationCode,
  exchangeInstagramLongLivedToken,
  fetchInstagramAccount,
  fetchInstagramMessageSubscription,
  subscribeInstagramMessages,
  unsubscribeInstagramMessages,
  type InstagramProviderError,
} from '@/lib/integrations/instagram-api-client';

const PROFESSIONAL_ACCOUNT_TYPES = new Set(['BUSINESS', 'CREATOR', 'MEDIA_CREATOR']);

type AnalyticsFailureCategory = Parameters<typeof captureIntegrationConnectionFailed>[0]['failureCategory'];
type InstagramOAuthError =
  | 'access_denied'
  | 'instagram_account_in_use'
  | 'invalid_callback'
  | 'long_lived_token_failed'
  | 'missing_instagram_permissions'
  | 'not_professional_account'
  | 'provider_unavailable'
  | 'server_error'
  | 'token_exchange_failed'
  | 'webhook_subscription_failed';

function providerFailureCategory(error: InstagramProviderError): AnalyticsFailureCategory {
  if (error.category === 'rate_limit') return 'rate_limited';
  if (error.category === 'transient_provider_failure') return 'provider_unavailable';
  if (error.category === 'authentication') return 'invalid_credentials';
  return 'validation_failed';
}

function logProviderError(step: string, error: InstagramProviderError): void {
  logger.error(
    {
      category: error.category,
      code: error.code,
      httpStatus: error.httpStatus,
      requestId: error.requestId,
      step,
      subcode: error.subcode,
    },
    `[IG OAuth] ${step} failed`,
  );
}

function isProfessionalAccount(accountType: string | null): accountType is string {
  return accountType !== null && PROFESSIONAL_ACCOUNT_TYPES.has(accountType.toUpperCase());
}

async function bestEffortUnsubscribe(input: {
  accessToken: string;
  accountId: string;
  reason: 'compensation' | 'replacement';
}): Promise<void> {
  const result = await unsubscribeInstagramMessages(input);
  if (!result.ok) {
    logger.warn(
      {
        accountId: input.accountId,
        category: result.error.category,
        code: result.error.code,
        httpStatus: result.error.httpStatus,
        reason: input.reason,
        requestId: result.error.requestId,
        subcode: result.error.subcode,
      },
      '[IG OAuth] Best-effort unsubscribe failed',
    );
  }
}

export async function GET(request: Request) {
  return createPostRedirectResponse(request, 'Finish Instagram connection');
}

export async function POST(request: Request) {
  const oauthConfig = getInstagramOAuthCallbackConfig();
  if (!oauthConfig) {
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
  const fail = async (
    error: InstagramOAuthError,
    failureCategory: AnalyticsFailureCategory,
  ) => {
    await captureIntegrationConnectionFailed({
      attemptId,
      failureCategory,
      organizationId,
      platform: 'ig_dm',
    });
    return integrationsResponse(appUrl, { error });
  };

  if (providerError) {
    logger.warn({ providerError }, '[IG OAuth] User denied access');
    return fail('access_denied', 'access_denied');
  }
  if (!code) return fail('invalid_callback', 'invalid_callback');

  try {
    const shortTokenResult = await exchangeInstagramAuthorizationCode({
      appId,
      appSecret,
      code,
      redirectUri,
    });
    if (!shortTokenResult.ok) {
      logProviderError('Authorization-code exchange', shortTokenResult.error);
      return fail('token_exchange_failed', providerFailureCategory(shortTokenResult.error));
    }

    const grantedScopes = shortTokenResult.data.permissions;
    if (
      grantedScopes.length > 0
      && INSTAGRAM_REQUIRED_SCOPES.some((scope) => !grantedScopes.includes(scope))
    ) {
      logger.error(
        { grantedScopes },
        '[IG OAuth] Required Instagram permissions were not granted',
      );
      return fail('missing_instagram_permissions', 'validation_failed');
    }

    const longTokenResult = await exchangeInstagramLongLivedToken({
      appSecret,
      shortLivedToken: shortTokenResult.data.accessToken,
    });
    if (!longTokenResult.ok) {
      logProviderError('Long-lived token exchange', longTokenResult.error);
      return fail('long_lived_token_failed', providerFailureCategory(longTokenResult.error));
    }
    const accessToken = longTokenResult.data.accessToken;

    const accountResult = await fetchInstagramAccount(accessToken);
    if (!accountResult.ok) {
      logProviderError('Account identity lookup', accountResult.error);
      return fail('provider_unavailable', providerFailureCategory(accountResult.error));
    }
    const account = accountResult.data;
    if (
      shortTokenResult.data.userId !== null
      && account.userId !== shortTokenResult.data.userId
    ) {
      logger.error(
        { accountUserId: account.userId, tokenUserId: shortTokenResult.data.userId },
        '[IG OAuth] Token and account identity did not match',
      );
      return fail('invalid_callback', 'validation_failed');
    }
    if (!isProfessionalAccount(account.accountType)) {
      logger.error(
        { accountId: account.userId, accountType: account.accountType },
        '[IG OAuth] Instagram account is not a Professional account',
      );
      return fail('not_professional_account', 'validation_failed');
    }

    let connectionState;
    try {
      connectionState = await inspectInstagramConnection(organizationId, account.userId);
    } catch (error) {
      if (error instanceof InstagramAccountInUseError) {
        return fail('instagram_account_in_use', 'validation_failed');
      }
      throw error;
    }
    const replacingOrCreating = connectionState.existingForOrganization?.externalAccountId
      !== account.userId;

    const subscriptionResult = await subscribeInstagramMessages({
      accountId: account.userId,
      accessToken,
    });
    if (!subscriptionResult.ok) {
      logProviderError('Webhook subscription', subscriptionResult.error);
      return fail('webhook_subscription_failed', providerFailureCategory(subscriptionResult.error));
    }

    const verifiedSubscription = await fetchInstagramMessageSubscription({
      accountId: account.userId,
      accessToken,
    });
    if (!verifiedSubscription.ok || !verifiedSubscription.data.messagesActive) {
      if (!verifiedSubscription.ok) {
        logProviderError('Webhook subscription verification', verifiedSubscription.error);
      } else {
        logger.error(
          { accountId: account.userId, fields: verifiedSubscription.data.fields },
          '[IG OAuth] messages subscription was not active after subscribe',
        );
      }
      if (replacingOrCreating) {
        await bestEffortUnsubscribe({
          accountId: account.userId,
          accessToken,
          reason: 'compensation',
        });
      }
      return fail('webhook_subscription_failed', 'validation_failed');
    }

    const subscriptionVerifiedAt = new Date();
    let persisted;
    try {
      persisted = await persistInstagramConnection({
        accessToken,
        accountId: account.userId,
        accountType: account.accountType,
        expiresAt: new Date(Date.now() + longTokenResult.data.expiresIn * 1000),
        grantedScopes,
        organizationId,
        permissionsVerified: grantedScopes.length > 0,
        subscriptionVerifiedAt,
        username: account.username,
      });
    } catch (error) {
      if (replacingOrCreating) {
        await bestEffortUnsubscribe({
          accountId: account.userId,
          accessToken,
          reason: 'compensation',
        });
      }
      if (error instanceof InstagramAccountInUseError) {
        return fail('instagram_account_in_use', 'validation_failed');
      }
      throw error;
    }

    await captureIntegrationConnectionCompleted({
      integrationId: persisted.integration.id,
      organizationId,
      platform: 'ig_dm',
    });

    logger.info(
      {
        accountId: account.userId,
        integrationId: persisted.integration.id,
        organizationId,
        username: account.username,
      },
      '[IG OAuth] Instagram Login integration is ready',
    );

    if (persisted.replacedIntegration?.accessToken) {
      await bestEffortUnsubscribe({
        accountId: persisted.replacedIntegration.externalAccountId,
        accessToken: persisted.replacedIntegration.accessToken,
        reason: 'replacement',
      });
    }

    return oauthDestinationResponse(appUrl, returnTo, 'instagram');
  } catch (error) {
    logger.error(
      { errorClass: error instanceof Error ? error.name : 'UnknownError' },
      '[IG OAuth] Unexpected error',
    );
    return fail('server_error', 'unknown');
  }
}
