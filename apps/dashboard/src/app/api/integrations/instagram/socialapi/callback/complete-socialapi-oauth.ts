import type { IntegrationFailureCategory } from '@shopkeeper/analytics';
import {
  createSocialApiClient,
  type SocialApiError,
} from '@shopkeeper/integrations/socialapi';
import logger from '@/lib/server/logger';
import { getSocialApiConnectConfig } from '@/lib/socialapi/config';
import type { OAuthCallbackCompletionResult } from '@/app/api/integrations/_lib/oauth-callback-runner';
import { InstagramAccountInUseError } from '@/app/api/integrations/_lib/instagram-connection';
import { persistSocialApiConnection } from '@/app/api/integrations/_lib/socialapi-connection';
import { socialApiRedirectUri } from '@/app/api/integrations/instagram/auth/socialapi-connect';

export type SocialApiOAuthError =
  | 'instagram_account_in_use'
  | 'instagram_account_not_ready'
  | 'instagram_not_available'
  | 'invalid_callback'
  | 'provider_unavailable'
  | 'state_mismatch'
  | 'token_exchange_failed';

export type CompleteSocialApiOAuthResult = OAuthCallbackCompletionResult<SocialApiOAuthError>;

export interface CompleteSocialApiOAuthInput {
  appUrl: string;
  attemptState: string;
  code: string;
  organizationId: string;
  providerState: string | null;
  savedBrandId: string | undefined;
  savedProviderState: string | undefined;
}

function failure(
  error: SocialApiOAuthError,
  failureCategory: IntegrationFailureCategory,
): CompleteSocialApiOAuthResult {
  return { ok: false, error, failureCategory };
}

function providerFailureCategory(error: SocialApiError): IntegrationFailureCategory {
  if (error.category === 'rate_limit') return 'rate_limited';
  if (error.category === 'transient_provider_failure') return 'provider_unavailable';
  if (error.category === 'authentication' || error.category === 'permission') {
    return 'invalid_credentials';
  }
  return 'validation_failed';
}

function logProviderError(step: string, error: SocialApiError): void {
  logger.error(
    {
      category: error.category,
      code: error.code,
      httpStatus: error.httpStatus,
      providerMessage: error.message.slice(0, 500),
      requestId: error.requestId,
      step,
    },
    `[SocialAPI OAuth] ${step} failed`,
  );
}

export async function completeSocialApiOAuth(
  input: CompleteSocialApiOAuthInput,
): Promise<CompleteSocialApiOAuthResult> {
  // The brand is re-read from configuration rather than from the callback: the
  // sealed cookie only proves it has not changed under a flow already in the air.
  const socialApi = getSocialApiConnectConfig();
  if (!socialApi) {
    logger.error('[SocialAPI OAuth] Callback while SocialAPI is not configured');
    return failure('instagram_not_available', 'validation_failed');
  }
  if (input.savedBrandId && input.savedBrandId !== socialApi.brandId) {
    logger.error('[SocialAPI OAuth] SocialAPI brand changed during the connect attempt');
    return failure('instagram_not_available', 'validation_failed');
  }

  // SocialAPI issues the OAuth state, so this is the provider half of the
  // correlation. Our own half is the `attempt` parameter the runner already
  // matched against the sealed cookie before calling this.
  if (!input.savedProviderState || input.savedProviderState !== input.providerState) {
    logger.error('[SocialAPI OAuth] Provider state did not match the started attempt');
    return failure('state_mismatch', 'state_mismatch');
  }

  const api = createSocialApiClient({
    apiKey: socialApi.apiKey,
    baseUrl: socialApi.baseUrl,
  });

  const exchange = await api.exchangeInstagramCode({
    code: input.code,
    redirectUri: socialApiRedirectUri(input.appUrl, input.attemptState),
    state: input.savedProviderState,
  });
  if (!exchange.ok) {
    logProviderError('OAuth exchange', exchange.error);
    return failure('token_exchange_failed', providerFailureCategory(exchange.error));
  }

  // Ownership is verified against the configured brand rather than taken from the
  // exchange: a brand-scoped lookup proves this account landed in our brand and
  // not somewhere else in the vendor account.
  const account = await api.getInstagramAccount({
    accountId: exchange.data.accountId,
    brandId: socialApi.brandId,
  });
  if (!account.ok) {
    logProviderError('Account verification', account.error);
    return account.error.category === 'validation'
      ? failure('invalid_callback', 'validation_failed')
      : failure('provider_unavailable', providerFailureCategory(account.error));
  }

  // A connected account that is already asking to be reconnected cannot carry
  // DMs. Refusing here is what keeps a merchant from finishing an OAuth flow
  // and then receiving nothing — the failure this transport exists to avoid.
  if (account.data.status !== 'active' || account.data.reconnectReason !== null) {
    logger.error(
      { reconnectReason: account.data.reconnectReason, status: account.data.status },
      '[SocialAPI OAuth] Connected account is not ready to receive DMs',
    );
    return failure('instagram_account_not_ready', 'validation_failed');
  }

  let persisted;
  try {
    persisted = await persistSocialApiConnection({
      brandId: socialApi.brandId,
      connectedAt: new Date(),
      organizationId: input.organizationId,
      providerAccountId: account.data.id,
      username: account.data.username,
    });
  } catch (error) {
    if (error instanceof InstagramAccountInUseError) {
      return failure('instagram_account_in_use', 'validation_failed');
    }
    throw error;
  }

  logger.info(
    {
      integrationId: persisted.integration.id,
      organizationId: input.organizationId,
      replacedIntegrationId: persisted.replacedIntegrationId,
      username: account.data.username,
    },
    '[SocialAPI OAuth] SocialAPI Instagram integration is ready',
  );

  return { ok: true, integrationId: persisted.integration.id };
}
