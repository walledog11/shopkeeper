import type { IntegrationFailureCategory } from '@shopkeeper/analytics';
import { ChannelType } from '@shopkeeper/db';
import logger from '@/lib/server/logger';
import type { OAuthCallbackCompletionResult } from '@/app/api/integrations/_lib/oauth-callback-runner';
import { upsertRaceSafeIntegration } from '@/app/api/integrations/_lib/integration-upsert';
import type { TikTokShopOAuthCallbackConfig } from '@/lib/tiktok-shop/config';
import {
  exchangeTikTokShopOAuthCode,
  TikTokShopProviderError,
  type TikTokShopTokenResult,
} from '@/lib/tiktok-shop/client';

type TikTokShopOAuthError = 'tiktok_shop_missing_shop' | 'tiktok_shop_token_failed';

export async function completeTikTokShopOAuth(input: {
  code: string;
  config: TikTokShopOAuthCallbackConfig;
  organizationId: string;
}): Promise<OAuthCallbackCompletionResult<TikTokShopOAuthError>> {
  let tokenResult: TikTokShopTokenResult;
  try {
    tokenResult = await exchangeTikTokShopOAuthCode(input.config, input.code);
  } catch (error) {
    if (!(error instanceof TikTokShopProviderError)) throw error;
    logger.error(
      {
        category: error.category,
        providerStatus: error.providerStatus,
      },
      '[TikTok Shop OAuth] Token exchange failed',
    );
    return {
      ok: false,
      error: 'tiktok_shop_token_failed',
      failureCategory: providerFailureCategory(error),
    };
  }

  const externalAccountId = resolveTikTokShopExternalAccountId(tokenResult);
  if (!externalAccountId) {
    logger.error('[TikTok Shop OAuth] Token response did not include a shop or seller id');
    return {
      ok: false,
      error: 'tiktok_shop_missing_shop',
      failureCategory: 'validation_failed',
    };
  }

  const integration = await upsertRaceSafeIntegration({
    organizationId: input.organizationId,
    platform: ChannelType.tiktok,
    externalAccountId,
    data: {
      accessToken: tokenResult.accessToken,
      refreshToken: tokenResult.refreshToken,
      tokenExpiresAt: tokenResult.tokenExpiresAt,
      fromEmail: tokenResult.displayName ?? externalAccountId,
      metadata: {
        provider: 'tiktok_shop',
        shopId: tokenResult.shopId,
        sellerId: tokenResult.sellerId,
        openId: tokenResult.openId,
        region: tokenResult.region,
        scopes: tokenResult.scopes,
        connectedAt: new Date().toISOString(),
      },
    },
  });

  logger.info(
    { externalAccountId, orgId: input.organizationId },
    '[TikTok Shop OAuth] Integration saved',
  );
  return { ok: true, integrationId: integration.id };
}

function providerFailureCategory(
  error: TikTokShopProviderError,
): IntegrationFailureCategory {
  if (error.category === 'rate_limited') return 'rate_limited';
  if (error.category === 'provider_unavailable') return 'provider_unavailable';
  if (error.category === 'malformed_response') return 'unknown';
  return 'invalid_credentials';
}

export function resolveTikTokShopExternalAccountId(
  tokenResult: TikTokShopTokenResult,
): string | null {
  return tokenResult.shopId ?? tokenResult.sellerId ?? tokenResult.openId;
}
