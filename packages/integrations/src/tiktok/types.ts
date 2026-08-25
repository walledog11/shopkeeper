export type TikTokShopHttpMethod = 'GET' | 'POST';

export type TikTokShopSignatureEncoding = 'hex' | 'base64';

export interface TikTokShopOAuthAuthorizeConfig {
  appKey: string;
  appUrl: string;
  authorizeUrl: string;
  redirectUri: string;
  scopes: string[];
}

export interface TikTokShopOAuthCallbackConfig extends TikTokShopOAuthAuthorizeConfig {
  appSecret: string;
  tokenMethod: TikTokShopHttpMethod;
  tokenUrl: string;
}

export interface TikTokShopTokenRefreshConfig {
  appKey: string;
  appSecret: string;
  refreshTokenMethod: TikTokShopHttpMethod;
  refreshTokenUrl: string;
}

export interface TikTokShopApiConfig extends TikTokShopTokenRefreshConfig {
  apiBaseUrl: string;
  sendMessagePath: string;
}

export interface TikTokShopWebhookConfig {
  secret: string | null;
  signatureAlgorithm: string;
  signatureEncoding: TikTokShopSignatureEncoding;
  signaturePrefix: string | null;
}

export type TikTokShopProviderErrorCategory =
  | 'expired_token'
  | 'missing_integration'
  | 'outcome_unknown'
  | 'policy_window'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'malformed_response'
  | 'provider_rejected';

export interface TikTokShopTokenResult {
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  shopId: string | null;
  sellerId: string | null;
  openId: string | null;
  displayName: string | null;
  region: string | null;
  scopes: string[];
  raw: unknown;
}

export interface NormalizedTikTokShopMessage {
  accountId: string;
  attachments: string[];
  buyerId: string | null;
  conversationId: string;
  customerName: string | null;
  eventType: string | null;
  isEcho: boolean;
  messageId: string | null;
  orderId: string | null;
  productId: string | null;
  text: string;
}
