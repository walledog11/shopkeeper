import type { IntegrationFailureCategory } from '@shopkeeper/analytics';
import logger from '@/lib/server/logger';
import type { OAuthCallbackCompletionResult } from '@/app/api/integrations/_lib/oauth-callback-runner';
import {
  InstagramAccountInUseError,
  inspectInstagramConnection,
  persistInstagramConnection,
} from '@/app/api/integrations/_lib/instagram-connection';
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

export type InstagramOAuthError =
  | 'instagram_account_in_use'
  | 'invalid_callback'
  | 'long_lived_token_failed'
  | 'missing_instagram_permissions'
  | 'not_professional_account'
  | 'provider_unavailable'
  | 'token_exchange_failed'
  | 'webhook_subscription_failed';

export type CompleteInstagramOAuthResult = OAuthCallbackCompletionResult<InstagramOAuthError>;

interface CompleteInstagramOAuthInput {
  appId: string;
  appSecret: string;
  code: string;
  organizationId: string;
  redirectUri: string;
}

function failure(
  error: InstagramOAuthError,
  failureCategory: IntegrationFailureCategory,
): CompleteInstagramOAuthResult {
  return { ok: false, error, failureCategory };
}

function providerFailureCategory(error: InstagramProviderError): IntegrationFailureCategory {
  if (error.category === 'rate_limit') return 'rate_limited';
  if (error.category === 'transient_provider_failure') return 'provider_unavailable';
  if (error.category === 'authentication') return 'invalid_credentials';
  return 'validation_failed';
}

function tokenProviderFailureCategory(
  error: InstagramProviderError,
): IntegrationFailureCategory {
  if (error.category === 'rate_limit') return 'rate_limited';
  if (error.category === 'transient_provider_failure') return 'provider_unavailable';
  if (error.httpStatus >= 400 && error.httpStatus < 500) return 'invalid_credentials';
  return providerFailureCategory(error);
}

function logProviderError(step: string, error: InstagramProviderError): void {
  logger.error(
    {
      category: error.category,
      code: error.code,
      httpStatus: error.httpStatus,
      providerMessage: error.message.slice(0, 500),
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
  if (result.ok) return;

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

export async function completeInstagramOAuth(
  input: CompleteInstagramOAuthInput,
): Promise<CompleteInstagramOAuthResult> {
  const shortTokenResult = await exchangeInstagramAuthorizationCode({
    appId: input.appId,
    appSecret: input.appSecret,
    code: input.code,
    redirectUri: input.redirectUri,
  });
  if (!shortTokenResult.ok) {
    logProviderError('Authorization-code exchange', shortTokenResult.error);
    return failure('token_exchange_failed', tokenProviderFailureCategory(shortTokenResult.error));
  }

  const grantedScopes = shortTokenResult.data.permissions;
  if (
    grantedScopes.length > 0
    && INSTAGRAM_REQUIRED_SCOPES.some((scope) => !grantedScopes.includes(scope))
  ) {
    logger.error({ grantedScopes }, '[IG OAuth] Required Instagram permissions were not granted');
    return failure('missing_instagram_permissions', 'validation_failed');
  }

  const longTokenResult = await exchangeInstagramLongLivedToken({
    appSecret: input.appSecret,
    shortLivedToken: shortTokenResult.data.accessToken,
  });
  if (!longTokenResult.ok) {
    logProviderError('Long-lived token exchange', longTokenResult.error);
    return failure('long_lived_token_failed', tokenProviderFailureCategory(longTokenResult.error));
  }
  const accessToken = longTokenResult.data.accessToken;

  const accountResult = await fetchInstagramAccount(accessToken);
  if (!accountResult.ok) {
    logProviderError('Account identity lookup', accountResult.error);
    return failure('provider_unavailable', providerFailureCategory(accountResult.error));
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
    return failure('invalid_callback', 'validation_failed');
  }
  if (!isProfessionalAccount(account.accountType)) {
    logger.error(
      { accountId: account.userId, accountType: account.accountType },
      '[IG OAuth] Instagram account is not a Professional account',
    );
    return failure('not_professional_account', 'validation_failed');
  }

  let connectionState;
  try {
    connectionState = await inspectInstagramConnection(input.organizationId, account.userId);
  } catch (error) {
    if (error instanceof InstagramAccountInUseError) {
      return failure('instagram_account_in_use', 'validation_failed');
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
    return failure(
      'webhook_subscription_failed',
      providerFailureCategory(subscriptionResult.error),
    );
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
    return failure('webhook_subscription_failed', 'validation_failed');
  }

  const subscriptionVerifiedAt = new Date();
  let persisted;
  try {
    persisted = await persistInstagramConnection({
      accessToken,
      accountId: account.userId,
      accountType: account.accountType,
      expiresAt: new Date(
        subscriptionVerifiedAt.getTime() + longTokenResult.data.expiresIn * 1_000,
      ),
      grantedScopes,
      organizationId: input.organizationId,
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
      return failure('instagram_account_in_use', 'validation_failed');
    }
    throw error;
  }

  if (persisted.replacedIntegration?.accessToken) {
    await bestEffortUnsubscribe({
      accountId: persisted.replacedIntegration.externalAccountId,
      accessToken: persisted.replacedIntegration.accessToken,
      reason: 'replacement',
    });
  }

  logger.info(
    {
      accountId: account.userId,
      integrationId: persisted.integration.id,
      organizationId: input.organizationId,
      username: account.username,
    },
    '[IG OAuth] Instagram Login integration is ready',
  );

  return {
    ok: true,
    integrationId: persisted.integration.id,
  };
}
