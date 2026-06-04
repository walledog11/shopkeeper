import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@clerk/db";
import { createTestOrg, cleanupTestData } from "@clerk/db/test-helpers";
import { recordAgentActionsBatch } from "@/lib/agent/api/agent-actions";

vi.mock("@/lib/server/logger", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// Track 4 finding, substantiated: the audit log is NOT thread-locked. The
// order-ops run records its flag action with threadId/customerId null and the
// row persists and is queryable. The only place that forced a thread was
// run.ts's call site (it passed ctx.thread.id / ctx.customer.id), not the schema
// or recordAgentActionsBatch (threadId/customerId are String? with onDelete: SetNull).

let orgId: string | null = null;

afterEach(async () => {
  await cleanupTestData(orgId);
  orgId = null;
});

describe("order-ops thread-less audit", () => {
  it("persists a flag action with no thread or customer", async () => {
    const org = await createTestOrg();
    orgId = org.id;

    await recordAgentActionsBatch({
      orgId: org.id,
      threadId: null,
      customerId: null,
      mode: "auto_executed",
      instruction: "order-risk-review:998877",
      summary: "Flagged order #1001 for review: billing/shipping country mismatch.",
      actions: [
        {
          tool: "flag_order",
          result: "Order flagged for human review: billing/shipping country mismatch.",
          input: { reason: "billing/shipping country mismatch" },
          durationMs: 5,
          status: "success",
          category: "action",
        },
      ],
    });

    const rows = await db.agentAction.findMany({ where: { organizationId: org.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].threadId).toBeNull();
    expect(rows[0].customerId).toBeNull();
    expect(rows[0].tool).toBe("flag_order");
    expect(rows[0].mode).toBe("auto_executed");
    expect(rows[0].category).toBe("action");
  });
});
