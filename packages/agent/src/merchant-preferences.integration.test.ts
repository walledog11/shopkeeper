import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@shopkeeper/db";
import { cleanupTestData, createTestOrg } from "@shopkeeper/db/test-helpers";
import { buildContext } from "./context.js";
import { captureObservedMerchantPreferenceProposal } from "./merchant-preference-capture.js";
import { loadActiveMerchantPreferences } from "./merchant-preferences.js";

const orgIds: string[] = [];

const sink = {
  escalateToHuman: async () => ({ status: "success" as const, message: "ok" }),
  askOperator: async () => ({ status: "success" as const, message: "ok" }),
  addInternalNote: async () => ({ status: "success" as const, message: "ok" }),
  sendReply: async () => ({ status: "success" as const, message: "ok" }),
  sendEmail: async () => ({ status: "success" as const, message: "ok" }),
  updateThreadStatus: async () => ({ status: "success" as const, message: "ok" }),
  updateThreadTag: async () => ({ status: "success" as const, message: "ok" }),
};

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(orgIds.splice(0).map((orgId) => cleanupTestData(orgId)));
});

describe("merchant preference memory", () => {
  it("loads only active preferences for planning", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);

    await db.merchantPreference.createMany({
      data: [
        {
          id: randomUUID(),
          organizationId: org.id,
          category: "compensation",
          guidance: "Active compensation preference",
          source: "explicit",
          status: "active",
          confirmedAt: new Date(),
        },
        {
          id: randomUUID(),
          organizationId: org.id,
          category: "returns",
          guidance: "Proposed return preference",
          source: "observed",
          status: "proposed",
          proposedRationale: "Merchant approved three no-receipt returns.",
          observedAt: new Date(),
        },
      ],
    });

    const active = await loadActiveMerchantPreferences(org.id);
    expect(active).toHaveLength(1);
    expect(active[0]?.guidance).toBe("Active compensation preference");
  });

  it("injects active preferences into built agent context", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await db.customer.create({
      data: {
        organizationId: org.id,
        platformId: `${randomUUID()}@test.com`,
        name: "Pat",
      },
    });
    const thread = await db.thread.create({
      data: {
        organizationId: org.id,
        customerId: customer.id,
        channelType: "email",
        status: "open",
      },
    });

    await db.merchantPreference.create({
      data: {
        id: randomUUID(),
        organizationId: org.id,
        category: "policy",
        guidance: "Honor student discounts on request.",
        source: "explicit",
        status: "active",
        confirmedAt: new Date(),
      },
    });

    const ctx = await buildContext(thread.id, org.id, sink);
    expect(ctx.merchantPreferences).toEqual([
      expect.objectContaining({
        category: "policy",
        guidance: "Honor student discounts on request.",
      }),
    ]);
  });

  it("captures observed plan-revision guidance as a proposed preference when enabled", async () => {
    vi.stubEnv("MERCHANT_PREFERENCE_OBSERVED_PROPOSALS", "true");
    const org = await createTestOrg();
    orgIds.push(org.id);

    const guidance = "Always offer store credit instead of refunds for minor defects under $20.";
    const captured = await captureObservedMerchantPreferenceProposal({
      organizationId: org.id,
      guidance,
      hasPendingQuestion: false,
    });
    expect(captured).toBe(true);

    const proposed = await db.merchantPreference.findMany({
      where: { organizationId: org.id, status: "proposed" },
    });
    expect(proposed).toHaveLength(1);
    expect(proposed[0]?.guidance).toBe(guidance);
    expect(proposed[0]?.source).toBe("observed");
    expect(await loadActiveMerchantPreferences(org.id)).toHaveLength(0);
  });
});
