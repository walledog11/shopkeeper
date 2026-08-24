import { afterEach, describe, expect, it, vi } from "vitest";
import { ChannelType, db } from "@shopkeeper/db";
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  cleanupTestData,
} from "@shopkeeper/db/test-helpers";
import type { AgentPlan, OrgSettings, RawToolCall } from "@/types";
import {
  recordShadowDecision,
  resolveShadowDecisionOnApproval,
} from "@/lib/agent/api/autonomy-shadow";

vi.mock("@/lib/server/logger", () => ({
  default: { info: vi.fn(), error: vi.fn() },
}));

const trustedSettings = { autonomyTier: "trusted" } as OrgSettings;

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

    await recordShadowDecision({ ...seed, settings: trustedSettings, plan });
    await recordShadowDecision({ ...seed, settings: trustedSettings, plan }); // dedupe

    const rows = await db.autonomyShadowDecision.findMany({ where: { organizationId: orgId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].humanDecision).toBe("pending");
    expect(rows[0].tier).toBe("trusted");
    expect(rows[0].proposedTools).toEqual(["create_refund"]);
    expect(rows[0].wouldAutoExecute).toBe(true);
  });

  it("marks agreement when the human approves the same mutation set", async () => {
    const seed = await seedThread();
    orgId = seed.orgId;
    const calls = [refundCall(40)];
    await recordShadowDecision({ ...seed, settings: trustedSettings, plan: planWith(calls) });

    await resolveShadowDecisionOnApproval({ ...seed, approvedToolCalls: calls });

    const row = await db.autonomyShadowDecision.findFirstOrThrow({ where: { organizationId: orgId } });
    expect(row.humanDecision).toBe("approved_unchanged");
    expect(row.agreement).toBe(true);
    expect(row.resolvedAt).not.toBeNull();
  });

  it("marks an edit when the human approves a different mutation set", async () => {
    const seed = await seedThread();
    orgId = seed.orgId;
    await recordShadowDecision({ ...seed, settings: trustedSettings, plan: planWith([refundCall(40)]) });

    await resolveShadowDecisionOnApproval({ ...seed, approvedToolCalls: [refundCall(25)] });

    const row = await db.autonomyShadowDecision.findFirstOrThrow({ where: { organizationId: orgId } });
    expect(row.humanDecision).toBe("edited");
    expect(row.agreement).toBe(false);
  });

  it("marks the dangerous rejection when the human executes no mutation", async () => {
    const seed = await seedThread();
    orgId = seed.orgId;
    await recordShadowDecision({ ...seed, settings: trustedSettings, plan: planWith([refundCall(40)]) });

    const replyOnly: RawToolCall = { id: "r1", name: "send_reply", input: { text: "hi" } };
    await resolveShadowDecisionOnApproval({ ...seed, approvedToolCalls: [replyOnly] });

    const row = await db.autonomyShadowDecision.findFirstOrThrow({ where: { organizationId: orgId } });
    expect(row.humanDecision).toBe("rejected");
    expect(row.agreement).toBe(false);
  });
});
