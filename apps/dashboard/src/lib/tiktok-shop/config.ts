import { normalizeAbsoluteUrl, readEnv } from "@/lib/env/helpers";

export const TIKTOK_SHOP_OAUTH_COOKIE_PREFIX = "tiktok_shop";

export type TikTokShopHttpMethod = "GET" | "POST";

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

export interface TikTokShopApiConfig {
  apiBaseUrl: string;
  appKey: string;
  appSecret: string;
  refreshTokenMethod: TikTokShopHttpMethod;
  refreshTokenUrl: string;
  sendMessagePath: string;
}

function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const rawValue = readEnv(name);
  if (!rawValue) return fallback;

  const normalizedValue = rawValue.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalizedValue)) return true;
  if (["0", "false", "no", "off"].includes(normalizedValue)) return false;

  throw new Error(`[Dashboard] ${name} must be a boolean`);
}

function parseMethodEnv(name: string, fallback: TikTokShopHttpMethod): TikTokShopHttpMethod {
  const rawValue = readEnv(name);
  if (!rawValue) return fallback;

  const normalizedValue = rawValue.toUpperCase();
  if (normalizedValue === "GET" || normalizedValue === "POST") return normalizedValue;

  throw new Error(`[Dashboard] ${name} must be GET or POST`);
}

function readScopes(): string[] {
  return (readEnv("TIKTOK_SHOP_SCOPES") ?? "")
    .split(/[,\s]+/)
    .map(scope => scope.trim())
    .filter(Boolean);
}

function readRedirectUri(appUrl: string): string {
  const explicitRedirectUri = readEnv("TIKTOK_SHOP_REDIRECT_URI");
  if (explicitRedirectUri) {
    return normalizeAbsoluteUrl("TIKTOK_SHOP_REDIRECT_URI", explicitRedirectUri);
  }
  return `${appUrl}/api/integrations/tiktok-shop/callback`;
}

export function isTikTokShopEnabled(): boolean {
  return parseBooleanEnv("TIKTOK_SHOP_ENABLED", false);
}

export function getTikTokShopOAuthAuthorizeConfig(): TikTokShopOAuthAuthorizeConfig | null {
  if (!isTikTokShopEnabled()) return null;

  const appUrlRaw = readEnv("APP_URL");
  const appKey = readEnv("TIKTOK_SHOP_APP_KEY") ?? readEnv("TIKTOK_SHOP_CLIENT_KEY");
  const authorizeUrlRaw = readEnv("TIKTOK_SHOP_AUTH_URL") ?? readEnv("TIKTOK_SHOP_AUTHORIZE_URL");

  if (!appUrlRaw || !appKey || !authorizeUrlRaw) return null;

  const appUrl = normalizeAbsoluteUrl("APP_URL", appUrlRaw);
  return {
    appKey,
    appUrl,
    authorizeUrl: normalizeAbsoluteUrl("TIKTOK_SHOP_AUTH_URL", authorizeUrlRaw),
    redirectUri: readRedirectUri(appUrl),
    scopes: readScopes(),
  };
}

export function getTikTokShopOAuthCallbackConfig(): TikTokShopOAuthCallbackConfig | null {
  const authorizeConfig = getTikTokShopOAuthAuthorizeConfig();
  const appSecret = readEnv("TIKTOK_SHOP_APP_SECRET") ?? readEnv("TIKTOK_SHOP_CLIENT_SECRET");
  const tokenUrlRaw = readEnv("TIKTOK_SHOP_TOKEN_URL");

  if (!authorizeConfig || !appSecret || !tokenUrlRaw) return null;

  return {
    ...authorizeConfig,
    appSecret,
    tokenMethod: parseMethodEnv("TIKTOK_SHOP_TOKEN_METHOD", "POST"),
    tokenUrl: normalizeAbsoluteUrl("TIKTOK_SHOP_TOKEN_URL", tokenUrlRaw),
  };
}

export function getTikTokShopApiConfig(): TikTokShopApiConfig | null {
  if (!isTikTokShopEnabled()) return null;

  const appKey = readEnv("TIKTOK_SHOP_APP_KEY") ?? readEnv("TIKTOK_SHOP_CLIENT_KEY");
  const appSecret = readEnv("TIKTOK_SHOP_APP_SECRET") ?? readEnv("TIKTOK_SHOP_CLIENT_SECRET");
  const apiBaseUrlRaw = readEnv("TIKTOK_SHOP_API_BASE_URL");
  const sendMessagePath = readEnv("TIKTOK_SHOP_SEND_MESSAGE_PATH");
  const refreshTokenUrlRaw = readEnv("TIKTOK_SHOP_REFRESH_TOKEN_URL") ?? readEnv("TIKTOK_SHOP_TOKEN_URL");

  if (!appKey || !appSecret || !apiBaseUrlRaw || !sendMessagePath || !refreshTokenUrlRaw) return null;

  return {
    apiBaseUrl: normalizeAbsoluteUrl("TIKTOK_SHOP_API_BASE_URL", apiBaseUrlRaw),
    appKey,
    appSecret,
    refreshTokenMethod: parseMethodEnv("TIKTOK_SHOP_REFRESH_TOKEN_METHOD", parseMethodEnv("TIKTOK_SHOP_TOKEN_METHOD", "POST")),
    refreshTokenUrl: normalizeAbsoluteUrl("TIKTOK_SHOP_REFRESH_TOKEN_URL", refreshTokenUrlRaw),
    sendMessagePath,
  };
}

export function isTikTokShopOAuthConfigured(): boolean {
  return getTikTokShopOAuthAuthorizeConfig() !== null;
}
