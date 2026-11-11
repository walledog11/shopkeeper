import { isRecord } from "@shopkeeper/shared/guards";

/**
 * Shopify's token endpoint, for every grant the app uses. Bodies are form
 * fields, as Shopify documents them for each grant.
 */
const TOKEN_REQUEST_TIMEOUT_MS = 10_000;

const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
const OFFLINE_ACCESS_TOKEN_TYPE = "urn:shopify:params:oauth:token-type:offline-access-token";

export interface ShopifyAppCredentials {
  clientId: string;
  clientSecret: string;
}

export type ShopifyTokenGrant =
  /** The OAuth callback's authorization code. */
  | { code: string }
  /** The ID token Shopify admin hands the embedded app home (token exchange). */
  | { idToken: string }
  /** A non-expiring offline token, swapped for an expiring one. Shopify retires it when the swap succeeds. */
  | { offlineToken: string }
  /** The current refresh token of an expiring offline token. */
  | { refreshToken: string };

export interface ShopifyIssuedToken {
  accessToken: string;
  /** Null for a non-expiring token. */
  expiresAt: Date | null;
  /** Set exactly when `expiresAt` is: an expiring token is only usable with its refresh token. */
  refreshToken: string | null;
  /** The granted scopes, when Shopify reported them. */
  scopes: string[] | undefined;
}

export type ShopifyTokenResult =
  | { ok: true; token: ShopifyIssuedToken }
  /**
   * `status` is null when no response arrived (timeout or network). `error` is
   * the OAuth error code Shopify sent, if any.
   */
  | { ok: false; status: number | null; error: string | null };

function grantFields(grant: ShopifyTokenGrant): Record<string, string> {
  if ("code" in grant) return { code: grant.code, expiring: "1" };
  if ("refreshToken" in grant) return { grant_type: "refresh_token", refresh_token: grant.refreshToken };
  return {
    grant_type: TOKEN_EXCHANGE_GRANT,
    requested_token_type: OFFLINE_ACCESS_TOKEN_TYPE,
    expiring: "1",
    ...("idToken" in grant
      ? { subject_token: grant.idToken, subject_token_type: "urn:ietf:params:oauth:token-type:id_token" }
      : { subject_token: grant.offlineToken, subject_token_type: OFFLINE_ACCESS_TOKEN_TYPE }),
  };
}

export function normalizeShopifyOAuthScopes(value: unknown): string[] | undefined {
  if (typeof value !== "string") return undefined;
  return [...new Set(
    value
      .split(",")
      .map((scope) => scope.trim().toLowerCase())
      .filter(Boolean),
  )].sort();
}

function positiveSeconds(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function parseIssuedToken(payload: unknown, now: number): ShopifyIssuedToken | null {
  if (!isRecord(payload) || typeof payload.access_token !== "string" || !payload.access_token) return null;
  const expiresIn = positiveSeconds(payload.expires_in);
  const refreshToken = typeof payload.refresh_token === "string" && payload.refresh_token
    ? payload.refresh_token
    : null;
  // A token that expires without a refresh token could not be kept alive.
  if ((expiresIn === null) !== (refreshToken === null)) return null;
  return {
    accessToken: payload.access_token,
    expiresAt: expiresIn === null ? null : new Date(now + expiresIn * 1000),
    refreshToken,
    scopes: normalizeShopifyOAuthScopes(payload.scope),
  };
}

export async function requestShopifyToken(
  shop: string,
  grant: ShopifyTokenGrant,
  credentials: ShopifyAppCredentials,
): Promise<ShopifyTokenResult> {
  let response: Response;
  try {
    response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        ...grantFields(grant),
      }).toString(),
      signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: null, error: null };
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: isRecord(payload) && typeof payload.error === "string" ? payload.error : null,
    };
  }
  const token = parseIssuedToken(payload, Date.now());
  return token
    ? { ok: true, token }
    : { ok: false, status: response.status, error: "malformed_token_response" };
}
