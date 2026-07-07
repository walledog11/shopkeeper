import type {
  TikTokShopApiConfig,
  TikTokShopHttpMethod,
  TikTokShopOAuthAuthorizeConfig,
  TikTokShopOAuthCallbackConfig,
} from "./config";

export type TikTokShopProviderErrorCategory =
  | "expired_token"
  | "missing_integration"
  | "policy_window"
  | "rate_limited"
  | "provider_unavailable"
  | "provider_rejected";

export class TikTokShopProviderError extends Error {
  readonly category: TikTokShopProviderErrorCategory;
  readonly providerStatus?: number;
  readonly providerBody?: unknown;

  constructor(
    message: string,
    options: {
      category: TikTokShopProviderErrorCategory;
      providerStatus?: number;
      providerBody?: unknown;
    },
  ) {
    super(message);
    this.name = "TikTokShopProviderError";
    this.category = options.category;
    this.providerStatus = options.providerStatus;
    this.providerBody = options.providerBody;
  }
}

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

export function buildTikTokShopAuthorizeUrl(
  config: TikTokShopOAuthAuthorizeConfig,
  state: string,
): URL {
  const authUrl = new URL(config.authorizeUrl);
  authUrl.searchParams.set("app_key", config.appKey);
  authUrl.searchParams.set("client_key", config.appKey);
  authUrl.searchParams.set("redirect_uri", config.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);
  if (config.scopes.length > 0) {
    authUrl.searchParams.set("scope", config.scopes.join(","));
  }
  return authUrl;
}

export async function exchangeTikTokShopOAuthCode(
  config: TikTokShopOAuthCallbackConfig,
  code: string,
): Promise<TikTokShopTokenResult> {
  return requestToken(config.tokenUrl, config.tokenMethod, {
    app_key: config.appKey,
    app_secret: config.appSecret,
    auth_code: code,
    code,
    grant_type: "authorized_code",
    redirect_uri: config.redirectUri,
  });
}

export async function refreshTikTokShopAccessToken(
  config: TikTokShopApiConfig,
  refreshToken: string,
): Promise<TikTokShopTokenResult> {
  return requestToken(config.refreshTokenUrl, config.refreshTokenMethod, {
    app_key: config.appKey,
    app_secret: config.appSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

export async function sendTikTokShopTextMessage({
  accessToken,
  config,
  conversationId,
  recipientId,
  text,
}: {
  accessToken: string;
  config: TikTokShopApiConfig;
  conversationId: string;
  recipientId?: string | null;
  text: string;
}): Promise<{ providerMessageId: string | null; raw: unknown }> {
  const url = new URL(config.sendMessagePath, `${config.apiBaseUrl}/`);
  url.searchParams.set("app_key", config.appKey);

  const res = await fetch(url.toString(), {
    cache: "no-store",
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "x-tts-access-token": accessToken,
    },
    body: JSON.stringify({
      conversation_id: conversationId,
      ...(recipientId ? { recipient_id: recipientId, buyer_id: recipientId } : {}),
      message_type: "TEXT",
      content: { text },
      text,
    }),
  });

  const body = await readJsonOrText(res);
  if (!res.ok || isProviderErrorBody(body)) {
    throw mapTikTokShopError(body, res.status);
  }

  const data = readObject(body, "data") ?? readObject(body, "result") ?? (isRecord(body) ? body : {});
  return {
    providerMessageId: readString(data, "message_id", "messageId", "provider_message_id"),
    raw: body,
  };
}

async function requestToken(
  tokenUrl: string,
  method: TikTokShopHttpMethod,
  params: Record<string, string>,
): Promise<TikTokShopTokenResult> {
  const url = new URL(tokenUrl);
  const init: RequestInit = {
    cache: "no-store",
    method,
    headers: { "Content-Type": "application/json" },
  };

  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  } else {
    init.body = JSON.stringify(params);
  }

  const res = await fetch(url.toString(), init);
  const body = await readJsonOrText(res);
  if (!res.ok || isProviderErrorBody(body)) {
    throw mapTikTokShopError(body, res.status);
  }

  return parseTokenResult(body);
}

function parseTokenResult(body: unknown): TikTokShopTokenResult {
  const data = readObject(body, "data") ?? readObject(body, "result") ?? (isRecord(body) ? body : {});
  const accessToken = readString(data, "access_token", "accessToken");
  if (!accessToken) {
    throw new TikTokShopProviderError("TikTok Shop token response did not include an access token", {
      category: "provider_rejected",
      providerBody: body,
    });
  }

  const expiresInSeconds = readNumber(data, "expires_in", "expiresIn");
  const expiresAtSeconds = readNumber(data, "access_token_expire_in", "accessTokenExpireIn", "expire_in");
  const shopId = readString(data, "shop_id", "shopId");
  const sellerId = readString(data, "seller_id", "sellerId", "seller_base_id");

  return {
    accessToken,
    refreshToken: readString(data, "refresh_token", "refreshToken"),
    tokenExpiresAt: resolveTokenExpiresAt(expiresInSeconds, expiresAtSeconds),
    shopId,
    sellerId,
    openId: readString(data, "open_id", "openId"),
    displayName: readString(data, "shop_name", "shopName", "seller_name", "sellerName", "name"),
    region: readString(data, "region", "shop_region", "shopRegion", "seller_base_region"),
    scopes: readStringList(data, "scope", "scopes", "granted_scopes", "grantedScopes"),
    raw: body,
  };
}

function resolveTokenExpiresAt(
  expiresInSeconds: number | null,
  expiresAtSeconds: number | null,
): Date | null {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (expiresAtSeconds && expiresAtSeconds > nowSeconds) {
    return new Date(expiresAtSeconds * 1000);
  }
  const durationSeconds = expiresInSeconds ?? expiresAtSeconds;
  if (!durationSeconds || durationSeconds <= 0) return null;
  return new Date(Date.now() + durationSeconds * 1000);
}

function isProviderErrorBody(body: unknown): boolean {
  if (!isRecord(body)) return false;
  const code = readString(body, "code", "error_code", "errorCode");
  const message = readString(body, "message", "error", "error_description", "errorDescription");
  if (!code && !message) return false;
  return !["0", "ok", "success"].includes(String(code ?? "").toLowerCase());
}

function mapTikTokShopError(body: unknown, status?: number): TikTokShopProviderError {
  const haystack = JSON.stringify(body ?? {}).toLowerCase();
  const category: TikTokShopProviderErrorCategory =
    status === 401 || haystack.includes("token") && (haystack.includes("expired") || haystack.includes("invalid"))
      ? "expired_token"
      : status === 429 || haystack.includes("rate") || haystack.includes("quota")
        ? "rate_limited"
        : haystack.includes("window") || haystack.includes("policy")
          ? "policy_window"
          : status && status >= 500
            ? "provider_unavailable"
            : "provider_rejected";
  const message =
    category === "expired_token"
      ? "TikTok Shop token expired"
      : category === "rate_limited"
        ? "TikTok Shop rate limit exceeded"
        : category === "policy_window"
          ? "TikTok Shop rejected the reply because it is outside the allowed response window"
          : category === "provider_unavailable"
            ? "TikTok Shop is temporarily unavailable"
            : "TikTok Shop rejected the request";

  return new TikTokShopProviderError(message, {
    category,
    providerStatus: status,
    providerBody: body,
  });
}

async function readJsonOrText(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readObject(value: unknown, ...keys: string[]): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  for (const key of keys) {
    const next = value[key];
    if (isRecord(next)) return next;
  }
  return null;
}

function readString(value: unknown, ...keys: string[]): string | null {
  if (!isRecord(value)) return null;
  for (const key of keys) {
    const next = value[key];
    if (typeof next === "string" && next.trim()) return next.trim();
    if (typeof next === "number" && Number.isFinite(next)) return String(next);
  }
  return null;
}

function readNumber(value: unknown, ...keys: string[]): number | null {
  if (!isRecord(value)) return null;
  for (const key of keys) {
    const next = value[key];
    if (typeof next === "number" && Number.isFinite(next)) return next;
    if (typeof next === "string" && next.trim()) {
      const parsed = Number(next);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function readStringList(value: unknown, ...keys: string[]): string[] {
  if (!isRecord(value)) return [];
  for (const key of keys) {
    const next = value[key];
    if (Array.isArray(next)) {
      return next
        .map(item => typeof item === "string" ? item.trim() : null)
        .filter((item): item is string => !!item);
    }
    if (typeof next === "string") {
      return next.split(/[,\s]+/).map(item => item.trim()).filter(Boolean);
    }
  }
  return [];
}
