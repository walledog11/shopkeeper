import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChannelType, db } from "@shopkeeper/db";
import {
  cleanupTestData,
  createTestCustomer,
  createTestOrg,
  createTestThread,
} from "@shopkeeper/db/test-helpers";
import {
  hashInstruction,
  hashPlan,
  recordAgentActionsBatch,
} from "@shopkeeper/agent/agent-actions";
import type { ActionEntry } from "@shopkeeper/agent/context";
import type { AgentPlan } from "@/types";

const refundPlan: AgentPlan = {
  instruction: "Refund $20 to Ada",
  steps: [
    {
      id: "refund_1",
      tool: "create_refund",
      label: "Issue refund",
      description: "Refund $20",
      category: "action",
      enabled: true,
    },
  ],
  rawToolCalls: [
    { id: "refund_1", name: "create_refund", input: { order_id: "gid://shopify/Order/1", amount: "20.00" } },
  ],
};

let org: Awaited<ReturnType<typeof createTestOrg>> | null = null;

beforeEach(() => {
  org = null;
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  org = null;
});

describe("agent-actions writer", () => {
  it("hashPlan and hashInstruction return stable 64-char hex SHA-256 digests", () => {
    const planHash = hashPlan(refundPlan);
    expect(planHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPlan(refundPlan)).toBe(planHash);
    expect(hashPlan({
      ...refundPlan,
      rawToolCalls: [{
        id: "refund_1",
        name: "create_refund",
        input: { amount: "20.00", order_id: "gid://shopify/Order/1" },
      }],
    })).toBe(planHash);

    const instructionHash = hashInstruction(refundPlan.instruction);
    expect(instructionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInstruction(refundPlan.instruction)).toBe(instructionHash);
    expect(hashInstruction("different")).not.toBe(instructionHash);
  });

  it("records a single AgentAction row with all fields populated", async () => {
    org = await createTestOrg();
    const customer = await createTestCustomer(org.id, "ada@example.com", { name: "Ada" });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const approvedAt = new Date("2026-05-25T12:00:00.000Z");
    const planHash = hashPlan(refundPlan);
    const instructionHash = hashInstruction(refundPlan.instruction);
    const action: ActionEntry = {
      tool: "create_refund",
      result: "Refund of $20.00 issued successfully.",
      input: { order_id: "gid://shopify/Order/1", amount: "20.00" },
      durationMs: 421,
      status: "success",
      category: "action",
    };

    await recordAgentActionsBatch({
      orgId: org.id,
      threadId: thread.id,
      customerId: customer.id,
      actions: [action],
      mode: "human_approved",
      approval: {
        approverId: "user_123:Ada Operator",
        approvedAt,
        approvedPlanHash: planHash,
        instructionHash,
      },
    });

    const rows = await db.agentAction.findMany({ where: { organizationId: org.id } });
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toMatchObject({
      organizationId: org.id,
      threadId: thread.id,
      customerId: customer.id,
      tool: "create_refund",
      category: "action",
      output: "Refund of $20.00 issued successfully.",
      status: "success",
      errorDetail: null,
      mode: "human_approved",
      approverId: "user_123:Ada Operator",
      approvedPlanHash: planHash,
      instructionHash,
      durationMs: 421,
    });
    expect(row.input).toEqual({ order_id: "gid://shopify/Order/1", amount: "20.00" });
    expect(row.approvedAt?.toISOString()).toBe(approvedAt.toISOString());
    expect(row.executedAt).toBeInstanceOf(Date);
  });

  it("batches inserts, backfills category and errorDetail, and defaults a missing status", async () => {
    org = await createTestOrg();
    const customer = await createTestCustomer(org.id, "ada@example.com", { name: "Ada" });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const actions: ActionEntry[] = [
      {
        tool: "get_shopify_orders",
        result: JSON.stringify([{ id: "1" }]),
        input: { customer_id: "cust_1" },
        durationMs: 88,
      },
      {
        tool: "create_refund",
        result: "Error: refund amount exceeds policy cap.",
        input: { order_id: "gid://shopify/Order/2", amount: "999.00" },
        durationMs: 12,
        status: "error",
      },
    ];

    await recordAgentActionsBatch({
      orgId: org.id,
      threadId: thread.id,
      customerId: customer.id,
      actions,
      mode: "auto_executed",
    });

    const rows = await db.agentAction.findMany({
      where: { organizationId: org.id },
      orderBy: { tool: "asc" },
    });
    expect(rows).toHaveLength(2);

    const [refund, orders] = rows;
    expect(refund).toMatchObject({
      tool: "create_refund",
      category: "action",
      status: "error",
      mode: "auto_executed",
      errorDetail: "Error: refund amount exceeds policy cap.",
      approverId: null,
      approvedAt: null,
      approvedPlanHash: null,
      instructionHash: null,
      durationMs: 12,
    });
    expect(orders).toMatchObject({
      tool: "get_shopify_orders",
      category: "read",
      status: "success",
      mode: "auto_executed",
      errorDetail: null,
      durationMs: 88,
    });
  });

  it("recordAgentActionsBatch is a no-op for an empty actions array", async () => {
    org = await createTestOrg();
    await recordAgentActionsBatch({
      orgId: org.id,
      actions: [],
      mode: "read_only",
    });
    const rows = await db.agentAction.findMany({ where: { organizationId: org.id } });
    expect(rows).toHaveLength(0);
  });
});
