import {
  normalizeTikTokShopWebhookPayload,
  refreshTikTokShopAccessToken as refreshTikTokShopAccessTokenShared,
  verifyTikTokShopWebhookSignature,
  type NormalizedTikTokShopMessage,
  type TikTokShopTokenResult,
} from '@shopkeeper/integrations/tiktok';
import type { TikTokShopApiConfig } from '../config/runtime-config.js';

export {
  normalizeTikTokShopWebhookPayload,
  verifyTikTokShopWebhookSignature,
  type NormalizedTikTokShopMessage,
  type TikTokShopTokenResult,
};

export async function refreshTikTokShopAccessToken(
  config: TikTokShopApiConfig,
  refreshToken: string,
): Promise<TikTokShopTokenResult> {
  if (!config.appKey || !config.appSecret || !config.refreshTokenUrl) {
    throw new Error('TikTok Shop token refresh is not configured');
  }

  return refreshTikTokShopAccessTokenShared({
    appKey: config.appKey,
    appSecret: config.appSecret,
    refreshTokenMethod: config.refreshTokenMethod,
    refreshTokenUrl: config.refreshTokenUrl,
  }, refreshToken);
}
