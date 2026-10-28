import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockClerkSession } from "@/test-fixtures/clerk-session";
import { ChannelType, db } from "@shopkeeper/db";
import {
  cleanupTestData,
  createTestIntegration,
  createTestOrg,
} from "@shopkeeper/db/test-helpers";
import {
  SHOPIFY_SIMULATOR_TOKEN,
} from "@/lib/integrations/shopify-simulator";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

import { POST } from "./route";

let org: Awaited<ReturnType<typeof createTestOrg>> | null;

beforeEach(async () => {
  org = await createTestOrg();
  vi.stubEnv("SHOPIFY_ONBOARDING_SIMULATOR_ENABLED", "true");
  mockClerkSession({
    userId: "usr_shopify_simulator",
    orgId: org.clerkOrgId,
  });
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
      externalAccountId: `demo-${org!.id}.shopkeeper.test`,
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
      externalAccountId: `demo-${org!.id}.shopkeeper.test`,
      accessToken: SHOPIFY_SIMULATOR_TOKEN,
      metadata: { simulated: true },
    });
  });

  it("allows two workspaces to connect independent demo integrations", async () => {
    const other = await createTestOrg();
    try {
      expect((await POST()).status).toBe(201);
      mockClerkSession({ userId: "usr_other_simulator", orgId: other.clerkOrgId });
      expect((await POST()).status).toBe(201);
      const rows = await db.integration.findMany({ where: { organizationId: { in: [org!.id, other.id] }, platform: ChannelType.shopify } });
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map(row => row.externalAccountId)).size).toBe(2);
    } finally { await cleanupTestData(other.id); }
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
