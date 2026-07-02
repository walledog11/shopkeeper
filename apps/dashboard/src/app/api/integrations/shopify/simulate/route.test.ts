import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelType, db } from "@shopkeeper/db";
import {
  cleanupTestData,
  createTestIntegration,
  createTestOrg,
} from "@shopkeeper/db/test-helpers";
import {
  SHOPIFY_SIMULATOR_DOMAIN,
  SHOPIFY_SIMULATOR_TOKEN,
} from "@/lib/integrations/shopify-simulator";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { POST } from "./route";

let org: Awaited<ReturnType<typeof createTestOrg>> | null;

beforeEach(async () => {
  org = await createTestOrg();
  vi.stubEnv("SHOPIFY_ONBOARDING_SIMULATOR_ENABLED", "true");
  vi.mocked(auth).mockResolvedValue({
    userId: "usr_shopify_simulator",
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await cleanupTestData(org?.id);
  org = null;
  vi.clearAllMocks();
});

describe("POST /api/integrations/shopify/simulate", () => {
  it("replaces Shopify rows with one persistent simulated integration", async () => {
    await createTestIntegration(org!.id, {
      platform: ChannelType.shopify,
      externalAccountId: "incomplete.myshopify.com",
    });

    const response = await POST();

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      externalAccountId: SHOPIFY_SIMULATOR_DOMAIN,
      metadata: { simulated: true },
      connectionState: "active",
    });

    const integrations = await db.integration.findMany({
      where: {
        organizationId: org!.id,
        platform: ChannelType.shopify,
      },
    });
    expect(integrations).toHaveLength(1);
    expect(integrations[0]).toMatchObject({
      externalAccountId: SHOPIFY_SIMULATOR_DOMAIN,
      accessToken: SHOPIFY_SIMULATOR_TOKEN,
      metadata: { simulated: true },
    });
  });

  it("is unavailable in production even when the flag is set", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await POST();

    expect(response.status).toBe(404);
    await expect(db.integration.count({
      where: {
        organizationId: org!.id,
        platform: ChannelType.shopify,
      },
    })).resolves.toBe(0);
  });
});
