import crypto from 'node:crypto';
import type { IntegrationFailureCategory } from '@shopkeeper/analytics';
import { shopifyRestJson, ShopifyRequestError } from '@shopkeeper/agent/shopify';
import { db, Prisma } from '@shopkeeper/db';
import type { Prisma as PrismaTypes } from '@prisma/client';
import logger from '@/lib/server/logger';
import { timingSafeIncludes } from '@/lib/security/timing-safe';
import {
  isSameShopifyStore,
  normalizeShopifyShopDomain,
  parseShopifyShopIdentity,
} from '@/lib/shopify/oauth';
import {
  fetchProviderWithDeadline,
  isProviderRequestTimeoutError,
} from '@/lib/server/provider-fetch';
import type { OAuthCallbackCompletionResult } from '@/app/api/integrations/_lib/oauth-callback-runner';

type ShopifyOAuthError =
  | 'shopify_hmac_invalid'
  | 'shopify_invalid_callback'
  | 'shopify_server_error'
  | 'shopify_shop_mismatch'
  | 'shopify_store_in_use'
  | 'shopify_token_failed';

type CompleteShopifyOAuthResult = OAuthCallbackCompletionResult<ShopifyOAuthError>;

type TokenExchangeResult =
  | { ok: true; accessToken: string; oauthScopes?: string[] }
  | {
    ok: false;
    error: 'shopify_server_error' | 'shopify_token_failed';
    failureCategory: IntegrationFailureCategory;
  };

interface CompleteShopifyOAuthArgs {
  clientId: string;
  clientSecret: string;
  organizationId: string;
  savedShop: string | null | undefined;
  searchParams: URLSearchParams;
}

class ShopifyStoreInUseError extends Error {
  constructor(readonly shop: string) {
    super(`Shopify store ${shop} is already connected to another workspace`);
    this.name = 'ShopifyStoreInUseError';
  }
}

export async function completeShopifyOAuth({
  clientId,
  clientSecret,
  organizationId,
  savedShop,
  searchParams,
}: CompleteShopifyOAuthArgs): Promise<CompleteShopifyOAuthResult> {
  const code = searchParams.get('code');
  const shop = searchParams.get('shop');
  const hmac = searchParams.get('hmac');
  const shopDomain = normalizeShopifyShopDomain(shop);

  if (!code || !shopDomain || !savedShop || !hmac) {
    return failure('shopify_invalid_callback', 'invalid_callback');
  }

  if (!isValidShopifyHmac(searchParams, clientSecret, hmac)) {
    logger.error('[Shopify OAuth] HMAC verification failed');
    return failure('shopify_hmac_invalid', 'invalid_callback');
  }

  const tokenResult = await exchangeShopifyAccessToken({
    clientId,
    clientSecret,
    code,
    shopDomain,
  });
  if (!tokenResult.ok) {
    return failure(tokenResult.error, tokenResult.failureCategory);
  }

  const shopIdentityResult = await resolveShopifyAuthorizedShop({
    accessToken: tokenResult.accessToken,
    savedShop,
    shopDomain,
  });
  if (!shopIdentityResult.ok) {
    return failure(
      shopIdentityResult.error,
      shopIdentityResult.failureCategory,
    );
  }

  const canonicalShopDomain = shopIdentityResult.shop.myshopifyDomain;
  const shopName = shopIdentityResult.shop.name;

  try {
    const integration = await claimShopifyIntegration({
      accessToken: tokenResult.accessToken,
      canonicalShopDomain,
      oauthScopes: tokenResult.oauthScopes,
      organizationId,
      shopName,
    });
    logger.info(
      { shopName, shop: canonicalShopDomain, orgId: organizationId },
      '[Shopify OAuth] Integration saved',
    );
    return { ok: true, integrationId: integration.id };
  } catch (error) {
    if (error instanceof ShopifyStoreInUseError) {
      logger.warn(
        { shop: canonicalShopDomain, orgId: organizationId },
        '[Shopify OAuth] Store already connected to another workspace — rejecting',
      );
      return failure('shopify_store_in_use', 'validation_failed');
    }
    throw error;
  }
}

function failure(
  error: ShopifyOAuthError,
  failureCategory: IntegrationFailureCategory,
): CompleteShopifyOAuthResult {
  return { ok: false, error, failureCategory };
}

export function isValidShopifyHmac(
  searchParams: URLSearchParams,
  clientSecret: string,
  hmac: string,
): boolean {
  const params: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    if (key !== 'hmac') params[key] = value;
  });
  const message = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  const digest = crypto.createHmac('sha256', clientSecret).update(message).digest('hex');
  return timingSafeIncludes([digest], hmac);
}

export async function exchangeShopifyAccessToken({
  clientId,
  clientSecret,
  code,
  shopDomain,
}: {
  clientId: string;
  clientSecret: string;
  code: string;
  shopDomain: string;
}): Promise<TokenExchangeResult> {
  let response: Response;
  try {
    response = await fetchProviderWithDeadline(
      `https://${shopDomain}/admin/oauth/access_token`,
      {
        cache: 'no-store',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
      },
      { provider: 'shopify', operation: 'OAuth token exchange' },
    );
  } catch (error) {
    if (isProviderRequestTimeoutError(error)) {
      logger.error({ err: error }, '[Shopify OAuth] Token exchange unavailable');
      return {
        ok: false,
        error: 'shopify_server_error',
        failureCategory: 'provider_unavailable',
      };
    }
    throw error;
  }

  if (!response.ok) {
    const detail = await readResponseDetail(response);
    logger.error(
      { status: response.status, error: detail },
      '[Shopify OAuth] Token exchange failed',
    );
    if (response.status === 429) {
      return { ok: false, error: 'shopify_server_error', failureCategory: 'rate_limited' };
    }
    if (response.status >= 500) {
      return {
        ok: false,
        error: 'shopify_server_error',
        failureCategory: 'provider_unavailable',
      };
    }
    if (response.status >= 400 && response.status < 500) {
      return {
        ok: false,
        error: 'shopify_token_failed',
        failureCategory: 'invalid_credentials',
      };
    }
    return { ok: false, error: 'shopify_server_error', failureCategory: 'unknown' };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!isRecord(payload) || typeof payload.access_token !== 'string' || !payload.access_token) {
    logger.error(
      { status: response.status },
      '[Shopify OAuth] Token exchange returned a malformed success response',
    );
    return { ok: false, error: 'shopify_server_error', failureCategory: 'unknown' };
  }

  return {
    ok: true,
    accessToken: payload.access_token,
    oauthScopes: normalizeShopifyOAuthScopes(payload.scope),
  };
}

async function readResponseDetail(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export function normalizeShopifyOAuthScopes(value: unknown): string[] | undefined {
  if (typeof value !== 'string') return undefined;
  return [...new Set(
    value
      .split(',')
      .map((scope) => scope.trim().toLowerCase())
      .filter(Boolean),
  )].sort();
}

export function mergeShopifyOAuthScopes(
  existingMetadata: unknown,
  oauthScopes: readonly string[] | undefined,
): PrismaTypes.InputJsonObject | undefined {
  if (oauthScopes === undefined) {
    return isJsonObject(existingMetadata)
      ? existingMetadata as PrismaTypes.InputJsonObject
      : undefined;
  }
  const existing = isJsonObject(existingMetadata) ? existingMetadata : {};
  return {
    ...existing,
    oauthScopes: [...oauthScopes],
  } as PrismaTypes.InputJsonObject;
}

function isJsonObject(value: unknown): value is Record<string, PrismaTypes.InputJsonValue> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function resolveShopifyAuthorizedShop({
  accessToken,
  savedShop,
  shopDomain,
}: {
  accessToken: string;
  savedShop: string;
  shopDomain: string;
}): Promise<
  | { ok: true; shop: Awaited<ReturnType<typeof fetchShopifyShopIdentity>> }
  | {
    ok: false;
    error: 'shopify_server_error' | 'shopify_shop_mismatch';
    failureCategory: IntegrationFailureCategory;
  }
> {
  let authorizedShop: Awaited<ReturnType<typeof fetchShopifyShopIdentity>>;
  try {
    authorizedShop = await fetchShopifyShopIdentity(shopDomain, accessToken);
  } catch (error) {
    logger.error(
      { err: error, shop: shopDomain },
      '[Shopify OAuth] Failed to fetch authorized shop identity',
    );
    return {
      ok: false,
      error: 'shopify_server_error',
      failureCategory: classifyProviderFailure(error),
    };
  }

  if (savedShop === shopDomain) return { ok: true, shop: authorizedShop };

  try {
    const requestedShop = await fetchShopifyShopIdentity(savedShop, accessToken);
    if (!isSameShopifyStore(authorizedShop, requestedShop)) {
      logger.error(
        {
          shop: shopDomain,
          savedShop,
          authorizedShopId: authorizedShop.id,
          requestedShopId: requestedShop.id,
        },
        '[Shopify OAuth] Shop domain mismatch — possible CSRF attempt',
      );
      return {
        ok: false,
        error: 'shopify_shop_mismatch',
        failureCategory: 'validation_failed',
      };
    }
    logger.info(
      { shop: shopDomain, savedShop, canonicalShop: authorizedShop.myshopifyDomain },
      '[Shopify OAuth] Accepted myshopify domain alias',
    );
  } catch (error) {
    logger.error(
      { err: error, shop: shopDomain, savedShop },
      '[Shopify OAuth] Shop domain mismatch — possible CSRF attempt',
    );
    return {
      ok: false,
      error: 'shopify_shop_mismatch',
      failureCategory: 'validation_failed',
    };
  }

  return { ok: true, shop: authorizedShop };
}

function classifyProviderFailure(error: unknown): IntegrationFailureCategory {
  if (isProviderRequestTimeoutError(error)) return 'provider_unavailable';
  if (error instanceof ShopifyRequestError) {
    if (error.status === 429) return 'rate_limited';
    if (typeof error.status === 'number' && error.status >= 500) return 'provider_unavailable';
  }
  return 'provider_unavailable';
}

type ShopifyIntegrationWrite = {
  accessToken: string;
  canonicalShopDomain: string;
  oauthScopes: readonly string[] | undefined;
  organizationId: string;
  shopName: string;
};

async function claimShopifyIntegration(args: ShopifyIntegrationWrite) {
  try {
    return await claimShopifyIntegrationOnce(args);
  } catch (error) {
    if (!isIntegrationP2002(error)) throw error;

    const canonical = await findCanonicalShopifyIntegration(args.canonicalShopDomain);
    if (!canonical) throw error;
    if (canonical.organizationId !== args.organizationId) {
      throw new ShopifyStoreInUseError(args.canonicalShopDomain);
    }
    return updateShopifyIntegration(canonical, args);
  }
}

async function claimShopifyIntegrationOnce(args: ShopifyIntegrationWrite) {
  const canonical = await findCanonicalShopifyIntegration(args.canonicalShopDomain);
  if (canonical) {
    if (canonical.organizationId !== args.organizationId) {
      throw new ShopifyStoreInUseError(args.canonicalShopDomain);
    }
    return updateShopifyIntegration(canonical, args);
  }

  return db.integration.create({
    data: {
      organizationId: args.organizationId,
      platform: 'shopify',
      externalAccountId: args.canonicalShopDomain,
      accessToken: args.accessToken,
      fromEmail: args.shopName,
      tokenExpiresAt: null,
      ...(args.oauthScopes !== undefined && {
        metadata: mergeShopifyOAuthScopes(undefined, args.oauthScopes),
      }),
    },
  });
}

async function findCanonicalShopifyIntegration(canonicalShopDomain: string) {
  return db.integration.findFirst({
    where: {
      platform: 'shopify',
      externalAccountId: canonicalShopDomain,
    },
  });
}

async function updateShopifyIntegration(
  integration: NonNullable<Awaited<ReturnType<typeof findCanonicalShopifyIntegration>>>,
  args: ShopifyIntegrationWrite,
) {
  const metadata = mergeShopifyOAuthScopes(integration.metadata, args.oauthScopes);
  return db.integration.update({
    where: { id: integration.id },
    data: {
      accessToken: args.accessToken,
      fromEmail: args.shopName,
      tokenExpiresAt: null,
      ...(metadata !== undefined && { metadata }),
    },
  });
}

function isIntegrationP2002(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && error.code === 'P2002'
    && (error.meta?.modelName === undefined || error.meta.modelName === 'Integration');
}

async function fetchShopifyShopIdentity(shop: string, accessToken: string) {
  const shopData = await shopifyRestJson<{
    shop?: { id?: number | string; name?: string; myshopify_domain?: string };
  }>(
    { shop, accessToken },
    'shop.json',
    { maxRetries: 0 },
  );
  const identity = parseShopifyShopIdentity(shopData, shop);
  if (!identity) throw new Error(`Shopify shop identity missing for ${shop}`);
  return identity;
}
