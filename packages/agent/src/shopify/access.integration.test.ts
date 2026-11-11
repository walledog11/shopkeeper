import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, INTEGRATION_REAUTH_SENTINEL } from "@shopkeeper/db";
import { cleanupTestData, createTestOrg } from "@shopkeeper/db/test-helpers";
import { migrateShopifyToken, SHOPIFY_ACCESS_SELECT, shopifyContextFor } from "./access.js";
import { shopifyRestJson } from "./client.js";

const HOUR_MS = 60 * 60_000;

let orgId: string | null = null;

async function shopifyIntegration(tokens: { accessToken: string; refreshToken?: string; expiresInMs?: number }) {
  const org = await createTestOrg();
  orgId = org.id;
  return db.integration.create({
    data: {
      organizationId: org.id,
      platform: "shopify",
      externalAccountId: `t${randomUUID().slice(0, 8)}.myshopify.com`,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? null,
      tokenExpiresAt: tokens.expiresInMs === undefined ? null : new Date(Date.now() + tokens.expiresInMs),
    },
    select: SHOPIFY_ACCESS_SELECT,
  });
}

function stored(id: string) {
  return db.integration.findUniqueOrThrow({ where: { id }, select: SHOPIFY_ACCESS_SELECT });
}

/** Shopify's token endpoint and Admin API: `token` answers token requests, `admin` API calls by the token sent. */
function stubShopify(handlers: {
  token?: (body: URLSearchParams) => Response | Promise<Response>;
  admin?: (accessToken: string) => Response;
}) {
  const tokenRequests: URLSearchParams[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
    if (String(url).endsWith("/admin/oauth/access_token")) {
      const body = new URLSearchParams(String(init?.body));
      tokenRequests.push(body);
      return handlers.token!(body);
    }
    const headers = init?.headers as Record<string, string>;
    return handlers.admin!(headers["X-Shopify-Access-Token"]!);
  }));
  return tokenRequests;
}

describe("shopifyContextFor", () => {
  beforeEach(() => {
    vi.stubEnv("SHOPIFY_CLIENT_ID", "client-id");
    vi.stubEnv("SHOPIFY_CLIENT_SECRET", "client-secret");
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await cleanupTestData(orgId);
    orgId = null;
  });

  it("refreshes a token near its end once, however many callers ask at the same time", async () => {
    const integration = await shopifyIntegration({ accessToken: "access-1", refreshToken: "refresh-1", expiresInMs: 60_000 });
    const tokenRequests = stubShopify({
      token: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return Response.json({ access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600 });
      },
    });

    const contexts = await Promise.all([1, 2, 3].map(() => shopifyContextFor(integration)));

    // A second refresh with refresh-1 would retire the pair the first one stored.
    expect(tokenRequests).toHaveLength(1);
    expect(Object.fromEntries(tokenRequests[0]!)).toMatchObject({ grant_type: "refresh_token", refresh_token: "refresh-1" });
    expect(contexts.map((ctx) => ctx?.accessToken)).toEqual(["access-2", "access-2", "access-2"]);
    const row = await stored(integration.id);
    expect(row).toMatchObject({ accessToken: "access-2", refreshToken: "refresh-2" });
    expect(row.tokenExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 55 * 60_000);
  });

  it("marks the store for reconnect when Shopify refuses the refresh token", async () => {
    const integration = await shopifyIntegration({ accessToken: "access-1", refreshToken: "refresh-1", expiresInMs: -60_000 });
    stubShopify({ token: () => Response.json({ error: "invalid_request" }, { status: 401 }) });

    await expect(shopifyContextFor(integration)).resolves.toBeNull();
    expect((await stored(integration.id)).tokenExpiresAt).toEqual(INTEGRATION_REAUTH_SENTINEL);
  });

  it("keeps the grant when a refresh fails for any other reason, and reports the request as unavailable", async () => {
    const integration = await shopifyIntegration({ accessToken: "access-1", refreshToken: "refresh-1", expiresInMs: -60_000 });
    stubShopify({
      token: () => new Response("unavailable", { status: 503 }),
      admin: () => Response.json({ errors: "[API] Invalid API key or access token" }, { status: 401 }),
    });

    const ctx = await shopifyContextFor(integration);
    expect(ctx?.accessToken).toBe("access-1");
    // No status: callers that mark a grant dead on a 401 leave this one alone.
    await expect(shopifyRestJson(ctx!, "shop.json")).rejects.toMatchObject({ status: undefined, rejectedBeforeExecution: true });
    expect(await stored(integration.id)).toMatchObject({ refreshToken: "refresh-1", tokenExpiresAt: integration.tokenExpiresAt });
  });

  it("resends a request refused with a non-expiring token that was swapped meanwhile", async () => {
    const integration = await shopifyIntegration({ accessToken: "legacy-1" });
    const ctx = await shopifyContextFor(integration);
    await db.integration.update({
      where: { id: integration.id },
      data: { accessToken: "access-2", refreshToken: "refresh-2", tokenExpiresAt: new Date(Date.now() + HOUR_MS) },
    });
    stubShopify({
      admin: (token) => token === "access-2"
        ? Response.json({ shop: { id: 1 } })
        : Response.json({ errors: "[API] Invalid API key or access token" }, { status: 401 }),
    });

    await expect(shopifyRestJson(ctx!, "shop.json")).resolves.toEqual({ shop: { id: 1 } });
  });
});

describe("migrateShopifyToken", () => {
  beforeEach(() => {
    vi.stubEnv("SHOPIFY_CLIENT_ID", "client-id");
    vi.stubEnv("SHOPIFY_CLIENT_SECRET", "client-secret");
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await cleanupTestData(orgId);
    orgId = null;
  });

  it("swaps a non-expiring token for an expiring pair", async () => {
    const integration = await shopifyIntegration({ accessToken: "legacy-1" });
    const tokenRequests = stubShopify({
      token: () => Response.json({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600 }),
    });

    await expect(migrateShopifyToken({ id: integration.id, shop: integration.externalAccountId })).resolves.toBe("migrated");
    expect(Object.fromEntries(tokenRequests[0]!)).toMatchObject({
      subject_token: "legacy-1",
      subject_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
      expiring: "1",
    });
    expect(await stored(integration.id)).toMatchObject({ accessToken: "access-1", refreshToken: "refresh-1" });
  });
});
