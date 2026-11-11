import {
  db,
  INTEGRATION_REAUTH_SENTINEL,
  isIntegrationReauthorizationRequired,
} from "@shopkeeper/db";
import logger from "../logger.js";
import { ShopifyRequestError, type ShopifyContext } from "./client.js";
import { isSimulatedShopifyIntegration } from "./integration-health.js";
import {
  requestShopifyToken,
  type ShopifyAppCredentials,
  type ShopifyIssuedToken,
  type ShopifyTokenResult,
} from "./tokens.js";

export {
  normalizeShopifyOAuthScopes,
  requestShopifyToken,
  type ShopifyAppCredentials,
  type ShopifyIssuedToken,
  type ShopifyTokenResult,
} from "./tokens.js";

/**
 * The one way to a Shopify context.
 *
 * Shopify's expiring offline tokens last an hour and come with a refresh token
 * that rotates on every refresh. Getting a new token and refreshing one each
 * retire the other's result, so only one of them may be in flight for a store:
 * every refresh, migration and new grant runs under `withShopifyTokenLock`.
 *
 * On the integration row, `accessToken` and `refreshToken` are stored as
 * issued and `tokenExpiresAt` is the access token's end. A non-expiring token
 * (installs from before expiring tokens, and the simulator) has neither a
 * refresh token nor an expiry. `tokenExpiresAt = 0` marks a grant the merchant
 * must reconnect, as on every integration.
 */

/** The integration columns `shopifyContextFor` reads. */
export const SHOPIFY_ACCESS_SELECT = {
  id: true,
  externalAccountId: true,
  accessToken: true,
  refreshToken: true,
  tokenExpiresAt: true,
} as const;

export interface ShopifyAccessRow {
  id: string;
  externalAccountId: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}

/** An expiring token is refreshed this long before its end, so a context built now outlives its requests. */
export const SHOPIFY_TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;

// pg_advisory_xact_lock's first key keeps these locks apart from any other; the second is the shop.
const SHOPIFY_TOKEN_LOCK = 1_397_247_824;
// A holder makes a few Shopify calls, each under its own deadline.
const LOCK_TRANSACTION = { maxWait: 10_000, timeout: 60_000 };

export type ShopifyTokenTransaction = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Runs `work` while no other process refreshes or replaces this store's token.
 * Store a token issued inside `work` before it returns.
 */
export async function withShopifyTokenLock<T>(
  shop: string,
  work: (tx: ShopifyTokenTransaction) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SHOPIFY_TOKEN_LOCK}::int, hashtext(${shop}))`;
    return work(tx);
  }, LOCK_TRANSACTION);
}

/** The app's client credentials, which every token request presents. */
export function shopifyAppCredentials(): ShopifyAppCredentials | null {
  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** The integration columns an issued token is stored in. */
export function shopifyTokenColumns(token: ShopifyIssuedToken) {
  return {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    tokenExpiresAt: token.expiresAt,
  };
}

function isTransientFailure(result: Extract<ShopifyTokenResult, { ok: false }>): boolean {
  return result.status === null || result.status === 429 || result.status >= 500;
}

function describeFailure(request: string, result: Extract<ShopifyTokenResult, { ok: false }>): string {
  const status = result.status === null ? "no response" : String(result.status);
  return `Shopify token ${request} failed (${status}${result.error ? `, ${result.error}` : ""})`;
}

function remainingMs(expiresAt: Date | null): number {
  return expiresAt ? expiresAt.getTime() - Date.now() : 0;
}

type Renewal =
  | { kind: "ok"; accessToken: string }
  /** No usable grant: the merchant has to reconnect. */
  | { kind: "refused" }
  | { kind: "unavailable"; reason: string };

/**
 * A token to use in place of `staleToken`. Unless `force`, a token still more
 * than the margin from its end is kept; `force` means Shopify refused
 * `staleToken`, so only a different, unexpired token will do.
 */
async function renewShopifyToken(
  integration: { id: string; shop: string },
  staleToken: string,
  force: boolean,
): Promise<Renewal> {
  try {
    return await withShopifyTokenLock(integration.shop, async (tx): Promise<Renewal> => {
      const row = await tx.integration.findUnique({
        where: { id: integration.id },
        select: { ...SHOPIFY_ACCESS_SELECT, lifecycleStatus: true },
      });
      if (!row || row.lifecycleStatus !== "active" || !row.accessToken) return { kind: "refused" };
      if (isIntegrationReauthorizationRequired(row.tokenExpiresAt)) return { kind: "refused" };
      // A non-expiring token is never refreshed. When Shopify refused it, only a
      // different one (swapped for an expiring token, or reconnected) will do.
      if (!row.refreshToken) {
        return force && row.accessToken === staleToken
          ? { kind: "refused" }
          : { kind: "ok", accessToken: row.accessToken };
      }

      const left = remainingMs(row.tokenExpiresAt);
      // Another process refreshed since this one read the row.
      if (row.accessToken !== staleToken && left > 0) return { kind: "ok", accessToken: row.accessToken };
      if (!force && left > SHOPIFY_TOKEN_REFRESH_MARGIN_MS) return { kind: "ok", accessToken: row.accessToken };

      const credentials = shopifyAppCredentials();
      if (!credentials) {
        logger.error({ integrationId: row.id }, "[shopify:access] SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET are not set; cannot refresh");
        return { kind: "unavailable", reason: "Shopify app credentials are not configured" };
      }
      const result = await requestShopifyToken(row.externalAccountId, { refreshToken: row.refreshToken }, credentials);
      if (result.ok) {
        await tx.integration.update({ where: { id: row.id }, data: shopifyTokenColumns(result.token) });
        return { kind: "ok", accessToken: result.token.accessToken };
      }
      // Shopify answers 401 for every refresh token it no longer accepts, and
      // says not to tell the cases apart: the merchant has to open the app again.
      if (result.status === 401) {
        await tx.integration.update({
          where: { id: row.id },
          data: { tokenExpiresAt: INTEGRATION_REAUTH_SENTINEL },
        });
        logger.warn(
          { integrationId: row.id, shop: row.externalAccountId },
          "[shopify:access] Refresh refused; the store must be reconnected",
        );
        return { kind: "refused" };
      }
      const reason = describeFailure("refresh", result);
      const log = isTransientFailure(result) ? logger.warn : logger.error;
      log({ integrationId: row.id, shop: row.externalAccountId, status: result.status, error: result.error }, `[shopify:access] ${reason}`);
      return { kind: "unavailable", reason };
    });
  } catch (error) {
    logger.warn({ err: error, integrationId: integration.id }, "[shopify:access] Refresh could not run");
    return { kind: "unavailable", reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * A context with a token valid now, or null when the integration has no usable
 * grant (none stored, or marked for reconnect). An expiring token near its end
 * is refreshed first; if Shopify refuses the token anyway, the client renews it
 * once and resends the request.
 */
export async function shopifyContextFor(integration: ShopifyAccessRow): Promise<ShopifyContext | null> {
  const { accessToken, externalAccountId: shop } = integration;
  if (!accessToken || !shop) return null;
  if (isIntegrationReauthorizationRequired(integration.tokenExpiresAt)) return null;

  const target = { id: integration.id, shop };
  let current = accessToken;
  if (integration.refreshToken && remainingMs(integration.tokenExpiresAt) <= SHOPIFY_TOKEN_REFRESH_MARGIN_MS) {
    const renewal = await renewShopifyToken(target, current, false);
    if (renewal.kind === "refused") return null;
    if (renewal.kind === "ok") current = renewal.accessToken;
    // Unavailable: go on with the stored token. If Shopify refuses it, the first
    // request renews again and fails as unavailable, never as a dead grant.
  }

  return {
    shop,
    accessToken: current,
    renewAccessToken: async (refused) => {
      const renewal = await renewShopifyToken(target, refused, true);
      if (renewal.kind === "ok") return renewal.accessToken;
      if (renewal.kind === "refused") return null;
      throw new ShopifyRequestError("Shopify access could not be renewed.", {
        payload: renewal.reason,
        rejectedBeforeExecution: true,
      });
    },
  };
}

export type ShopifyTokenMigration = "migrated" | "skipped" | "refused" | "unavailable";

/**
 * Swaps a non-expiring offline token for an expiring one. Shopify invalidates
 * the old token once the swap succeeds; an answer lost on the way is recovered
 * by asking again with the same token, which returns the same pair.
 */
export async function migrateShopifyToken(integration: { id: string; shop: string }): Promise<ShopifyTokenMigration> {
  const credentials = shopifyAppCredentials();
  if (!credentials) return "unavailable";

  return withShopifyTokenLock(integration.shop, async (tx): Promise<ShopifyTokenMigration> => {
    const row = await tx.integration.findUnique({
      where: { id: integration.id },
      select: { ...SHOPIFY_ACCESS_SELECT, lifecycleStatus: true, metadata: true },
    });
    if (
      !row
      || row.lifecycleStatus !== "active"
      || !row.accessToken
      || row.refreshToken
      || row.tokenExpiresAt !== null
      || isSimulatedShopifyIntegration(row.metadata)
    ) {
      return "skipped";
    }

    const grant = { offlineToken: row.accessToken };
    let result = await requestShopifyToken(row.externalAccountId, grant, credentials);
    if (!result.ok && isTransientFailure(result)) {
      result = await requestShopifyToken(row.externalAccountId, grant, credentials);
    }
    if (result.ok) {
      await tx.integration.update({ where: { id: row.id }, data: shopifyTokenColumns(result.token) });
      if (result.token.refreshToken) return "migrated";
      logger.error({ integrationId: row.id }, "[shopify:access] Token exchange returned a non-expiring token");
      return "unavailable";
    }
    if (result.status === 400 && result.error === "invalid_subject_token") {
      await tx.integration.update({
        where: { id: row.id },
        data: { tokenExpiresAt: INTEGRATION_REAUTH_SENTINEL },
      });
      logger.warn(
        { integrationId: row.id, shop: row.externalAccountId },
        "[shopify:access] Shopify no longer accepts the non-expiring token; the store must be reconnected",
      );
      return "refused";
    }
    logger.warn(
      { integrationId: row.id, status: result.status, error: result.error },
      `[shopify:access] ${describeFailure("migration", result)}`,
    );
    return "unavailable";
  });
}

/**
 * Refreshes an expiring token that nothing has used for a while: Shopify's
 * refresh token lapses after 90 days without one.
 */
export async function keepShopifyTokenAlive(integration: { id: string; shop: string; accessToken: string }): Promise<Renewal["kind"]> {
  return (await renewShopifyToken(integration, integration.accessToken, true)).kind;
}
