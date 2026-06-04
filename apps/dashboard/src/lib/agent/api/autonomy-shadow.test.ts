import { afterEach, describe, expect, it, vi } from "vitest";
import { ChannelType, db } from "@clerk/db";
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  cleanupTestData,
} from "@clerk/db/test-helpers";
import type { AgentPlan, OrgSettings, RawToolCall } from "@/types";
import {
  getAutonomyReadiness,
  recordShadowDecision,
  resolveShadowDecisionOnApproval,
} from "@/lib/agent/api/autonomy-shadow";

vi.mock("@/lib/server/logger", () => ({
  default: { info: vi.fn(), error: vi.fn() },
}));

const broadSettings = { autonomyTier: "broad" } as OrgSettings;

function refundCall(amount: number): RawToolCall {
  return { id: `refund-${amount}`, name: "create_refund", input: { order_id: "1", amount } };
}

function planWith(calls: RawToolCall[]): AgentPlan {
  return {
    instruction: "Refund the customer",
    steps: calls.map((c) => ({ id: c.id, tool: c.name, label: c.name, description: "", category: "action" as const, enabled: true })),
    rawToolCalls: calls,
  };
}

async function seedThread() {
  const org = await createTestOrg();
  const customer = await createTestCustomer(org.id, `cust_${org.id}`);
  const thread = await createTestThread(org.id, customer.id, ChannelType.email);
  return { orgId: org.id, threadId: thread.id };
}

let orgId: string | null = null;

afterEach(async () => {
  await cleanupTestData(orgId);
  orgId = null;
});

describe("autonomy shadow decisions", () => {
  it("records a pending counterfactual once per cached plan", async () => {
    const seed = await seedThread();
    orgId = seed.orgId;
    const plan = planWith([refundCall(40)]);

    await recordShadowDecision({ ...seed, settings: broadSettings, plan });
    await recordShadowDecision({ ...seed, settings: broadSettings, plan }); // dedupe

    const rows = await db.autonomyShadowDecision.findMany({ where: { organizationId: orgId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].humanDecision).toBe("pending");
    expect(rows[0].tier).toBe("broad");
    expect(rows[0].proposedTools).toEqual(["create_refund"]);
    expect(rows[0].wouldAutoExecute).toBe(true);
  });

  it("marks agreement when the human approves the same mutation set", async () => {
    const seed = await seedThread();
    orgId = seed.orgId;
    const calls = [refundCall(40)];
    await recordShadowDecision({ ...seed, settings: broadSettings, plan: planWith(calls) });

    await resolveShadowDecisionOnApproval({ ...seed, approvedToolCalls: calls });

    const row = await db.autonomyShadowDecision.findFirstOrThrow({ where: { organizationId: orgId } });
    expect(row.humanDecision).toBe("approved_unchanged");
    expect(row.agreement).toBe(true);
    expect(row.resolvedAt).not.toBeNull();
  });

  it("marks an edit when the human approves a different mutation set", async () => {
    const seed = await seedThread();
    orgId = seed.orgId;
    await recordShadowDecision({ ...seed, settings: broadSettings, plan: planWith([refundCall(40)]) });

    await resolveShadowDecisionOnApproval({ ...seed, approvedToolCalls: [refundCall(25)] });

    const row = await db.autonomyShadowDecision.findFirstOrThrow({ where: { organizationId: orgId } });
    expect(row.humanDecision).toBe("edited");
    expect(row.agreement).toBe(false);
  });

  it("marks the dangerous rejection when the human executes no mutation", async () => {
    const seed = await seedThread();
    orgId = seed.orgId;
    await recordShadowDecision({ ...seed, settings: broadSettings, plan: planWith([refundCall(40)]) });

    const replyOnly: RawToolCall = { id: "r1", name: "send_reply", input: { text: "hi" } };
    await resolveShadowDecisionOnApproval({ ...seed, approvedToolCalls: [replyOnly] });

    const row = await db.autonomyShadowDecision.findFirstOrThrow({ where: { organizationId: orgId } });
    expect(row.humanDecision).toBe("rejected");
    expect(row.agreement).toBe(false);
  });

  it("aggregates readiness with agreement rate and the dangerous-cell count", async () => {
    const seed = await seedThread();
    orgId = seed.orgId;

    await recordShadowDecision({ ...seed, settings: broadSettings, plan: planWith([refundCall(40)]) });
    await resolveShadowDecisionOnApproval({ ...seed, approvedToolCalls: [refundCall(40)] });

    await recordShadowDecision({ ...seed, settings: broadSettings, plan: planWith([refundCall(90)]) });
    await resolveShadowDecisionOnApproval({
      ...seed,
      approvedToolCalls: [{ id: "r1", name: "send_reply", input: { text: "hi" } }],
    });

    // A still-pending one.
    await recordShadowDecision({ ...seed, settings: broadSettings, plan: planWith([refundCall(120)]) });

    const readiness = await getAutonomyReadiness({ orgId });
    expect(readiness.resolved).toBe(2);
    expect(readiness.agreements).toBe(1);
    expect(readiness.agreementRate).toBe(0.5);
    expect(readiness.dangerousRejections).toBe(1);
    expect(readiness.pending).toBe(1);
    expect(readiness.byTier).toEqual([
      { tier: "broad", resolved: 2, agreements: 1, agreementRate: 0.5, dangerousRejections: 1 },
    ]);
    expect(readiness.byTool[0]).toMatchObject({ tool: "create_refund", resolved: 2 });
  });
});
