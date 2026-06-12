import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChannelType, db } from "@shopkeeper/db";
import {
  cleanupTestData,
  createTestCustomer,
  createTestOrg,
  createTestThread,
} from "@shopkeeper/db/test-helpers";
import {
  decodeAgentActionCursor,
  getAgentActionReportStatsForOrgInRange,
  iterateAgentActionLogEntries,
  listAgentActionLogEntries,
  streamAgentActionLogCsv,
} from "@/lib/agent/api/action-log";
import { recordAgentActionsBatch } from "@shopkeeper/agent/agent-actions";
import type { ActionEntry } from "@shopkeeper/agent/context";

let org: Awaited<ReturnType<typeof createTestOrg>> | null = null;

beforeEach(() => {
  org = null;
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  org = null;
});

async function seedTurn(params: {
  orgId: string;
  threadId?: string | null;
  customerId?: string | null;
  instruction: string;
  summary: string;
  actions: ActionEntry[];
  mode?: "human_approved" | "auto_executed" | "read_only";
}) {
  await recordAgentActionsBatch({
    orgId: params.orgId,
    threadId: params.threadId ?? null,
    customerId: params.customerId ?? null,
    mode: params.mode ?? "human_approved",
    actions: params.actions,
    instruction: params.instruction,
    summary: params.summary,
  });
}

async function readStreamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) out += decoder.decode(value);
  }
  return out;
}

describe("action-log reader (AgentAction-sourced)", () => {
  it("groups AgentAction rows into one ActionLogEntry per turn", async () => {
    org = await createTestOrg();
    const customer = await createTestCustomer(org.id, "ada@example.com", { name: "Ada" });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    await seedTurn({
      orgId: org.id,
      threadId: thread.id,
      customerId: customer.id,
      instruction: "Refund the broken mug",
      summary: "Refunded $25 and closed the ticket.",
      actions: [
        { tool: "create_refund", result: "Refunded $25.00.", durationMs: 120, status: "success" },
        { tool: "update_thread_status", result: "Status set to closed.", durationMs: 30, status: "success" },
      ],
    });

    const { entries, nextCursor } = await listAgentActionLogEntries({ orgId: org.id });
    expect(nextCursor).toBeNull();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      threadId: thread.id,
      customerHandle: "Ada",
      instruction: "Refund the broken mug",
      summary: "Refunded $25 and closed the ticket.",
      mode: "human_approved",
    });
    expect(entries[0].actions.map((a) => a.tool)).toEqual(["create_refund", "update_thread_status"]);
  });

  it("keeps threadless order-operation actions in the read model", async () => {
    org = await createTestOrg();

    await seedTurn({
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

    const { entries, nextCursor } = await listAgentActionLogEntries({ orgId: org.id });
    expect(nextCursor).toBeNull();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      threadId: null,
      channelType: null,
      threadTag: null,
      customerHandle: null,
      instruction: "order-risk-review:998877",
      summary: "Flagged order #1001 for review: billing/shipping country mismatch.",
      mode: "auto_executed",
    });
    expect(entries[0].actions).toHaveLength(1);
    expect(entries[0].actions[0]).toMatchObject({
      tool: "flag_order",
      result: "Order flagged for human review: billing/shipping country mismatch.",
      status: "success",
    });
  });

  it("paginates turns with the (executedAt, turnId) cursor", async () => {
    org = await createTestOrg();
    const customer = await createTestCustomer(org.id, "ada@example.com", { name: "Ada" });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    for (let i = 0; i < 3; i += 1) {
      await seedTurn({
        orgId: org.id,
        threadId: thread.id,
        customerId: customer.id,
        instruction: `Turn ${i}`,
        summary: `Summary ${i}`,
        actions: [{ tool: "send_reply", result: `Reply ${i} sent.`, status: "success" }],
      });
    }

    const first = await listAgentActionLogEntries({ orgId: org.id, pageSize: 2 });
    expect(first.entries).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await listAgentActionLogEntries({
      orgId: org.id,
      pageSize: 2,
      cursor: decodeAgentActionCursor(first.nextCursor!),
    });
    expect(second.entries).toHaveLength(1);
    expect(second.nextCursor).toBeNull();

    const seenIds = new Set([...first.entries, ...second.entries].map((e) => e.id));
    expect(seenIds.size).toBe(3);
  });

  it("does not duplicate multi-action turns on cursor pages", async () => {
    org = await createTestOrg();
    const customer = await createTestCustomer(org.id, "ada@example.com", { name: "Ada" });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    await seedTurn({
      orgId: org.id,
      threadId: thread.id,
      customerId: customer.id,
      instruction: "Older single-action turn",
      summary: "Replied.",
      actions: [{ tool: "send_reply", result: "Reply sent.", status: "success" }],
    });

    await seedTurn({
      orgId: org.id,
      threadId: thread.id,
      customerId: customer.id,
      instruction: "Latest multi-action turn",
      summary: "Refunded and replied.",
      actions: [
        { tool: "create_refund", result: "Refunded $10.00.", status: "success" },
        { tool: "send_reply", result: "Reply sent.", status: "success" },
      ],
    });

    const first = await listAgentActionLogEntries({ orgId: org.id, pageSize: 1 });
    expect(first.entries).toHaveLength(1);
    expect(first.entries[0].instruction).toBe("Latest multi-action turn");
    expect(first.nextCursor).not.toBeNull();

    const second = await listAgentActionLogEntries({
      orgId: org.id,
      pageSize: 1,
      cursor: decodeAgentActionCursor(first.nextCursor!),
    });

    expect(second.entries).toHaveLength(1);
    expect(second.entries[0].instruction).toBe("Older single-action turn");
    expect(second.entries[0].id).not.toBe(first.entries[0].id);
  });

  it("applies tool/status filters at the turn level but still returns the full action breakdown", async () => {
    org = await createTestOrg();
    const customer = await createTestCustomer(org.id, "ada@example.com", { name: "Ada" });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    await seedTurn({
      orgId: org.id,
      threadId: thread.id,
      customerId: customer.id,
      instruction: "Refund + reply",
      summary: "Did both.",
      actions: [
        { tool: "create_refund", result: "Refunded $10.00.", status: "success" },
        { tool: "send_reply", result: "Reply sent.", status: "success" },
      ],
    });

    await seedTurn({
      orgId: org.id,
      threadId: thread.id,
      customerId: customer.id,
      instruction: "Just a reply",
      summary: "Replied.",
      actions: [{ tool: "send_reply", result: "Reply sent.", status: "success" }],
    });

    const refundOnly = await listAgentActionLogEntries({
      orgId: org.id,
      filters: { tools: ["create_refund"] },
    });
    expect(refundOnly.entries).toHaveLength(1);
    expect(refundOnly.entries[0].actions.map((a) => a.tool)).toEqual(["create_refund", "send_reply"]);
  });

  it("attention filter keeps escalations, flags, and failures; excludeOperator drops operator turns", async () => {
    org = await createTestOrg();
    const customer = await createTestCustomer(org.id, "ada@example.com", { name: "Ada" });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    const operatorThread = await createTestThread(org.id, customer.id, ChannelType.sms_agent);

    await seedTurn({
      orgId: org.id,
      threadId: thread.id,
      customerId: customer.id,
      instruction: "Escalate this",
      summary: "Escalated.",
      actions: [{ tool: "escalate_to_human", result: "Escalated.", status: "escalated" }],
    });
    await seedTurn({
      orgId: org.id,
      threadId: thread.id,
      customerId: customer.id,
      instruction: "Refund over limit",
      summary: "Blocked.",
      actions: [{ tool: "create_refund", result: "Refund exceeds limit.", status: "policy_block" }],
    });
    await seedTurn({
      orgId: org.id,
      threadId: null,
      customerId: null,
      instruction: "order-risk-review: gid://shopify/Order/1",
      summary: "Order #PG1 flagged for review.",
      mode: "auto_executed",
      actions: [{ tool: "flag_order", result: "Flagged.", status: "success" }],
    });
    await seedTurn({
      orgId: org.id,
      threadId: thread.id,
      customerId: customer.id,
      instruction: "Just a reply",
      summary: "Replied.",
      actions: [{ tool: "send_reply", result: "Reply sent.", status: "success" }],
    });
    await seedTurn({
      orgId: org.id,
      threadId: operatorThread.id,
      customerId: customer.id,
      instruction: "Cancel order 1001",
      summary: "Cancelled via Telegram.",
      actions: [{ tool: "cancel_order", result: "Cancelled.", status: "success" }],
    });

    const attention = await listAgentActionLogEntries({
      orgId: org.id,
      filters: { attention: true },
    });
    expect(attention.entries.map((entry) => entry.instruction).sort()).toEqual([
      "Escalate this",
      "Refund over limit",
      "order-risk-review: gid://shopify/Order/1",
    ]);

    const nonOperator = await listAgentActionLogEntries({
      orgId: org.id,
      filters: { excludeOperator: true },
    });
    expect(nonOperator.entries).toHaveLength(4);
    expect(nonOperator.entries.every((entry) => entry.channelType !== "sms_agent")).toBe(true);
  });

  it("streamAgentActionLogCsv emits a header row plus one row per turn", async () => {
    org = await createTestOrg();
    const customer = await createTestCustomer(org.id, "ada@example.com", { name: "Ada" });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    await seedTurn({
      orgId: org.id,
      threadId: thread.id,
      customerId: customer.id,
      instruction: "Refund the order",
      summary: "Refunded.",
      actions: [{ tool: "create_refund", result: "Refunded $25.00.", status: "success" }],
    });

    const text = await readStreamToString(streamAgentActionLogCsv({ orgId: org.id }));
    const lines = text.trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("timestamp,customer,channel,thread_tag,thread_id,mode,instruction,summary,actions,action_results");
    expect(lines[1]).toContain('"Ada"');
    expect(lines[1]).toContain("Refunded $25.00.");
    expect(lines[1]).toContain('"human_approved"');
  });

  it("getAgentActionReportStatsForOrgInRange aggregates report metrics in the database", async () => {
    org = await createTestOrg();
    const customer = await createTestCustomer(org.id, "ada@example.com", { name: "Ada" });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    await seedTurn({
      orgId: org.id,
      threadId: thread.id,
      customerId: customer.id,
      instruction: "Refund + reply",
      summary: "Both done.",
      actions: [
        { tool: "create_refund", result: "Refunded.", status: "success" },
        { tool: "send_reply", result: "Reply sent.", status: "success" },
      ],
    });
    await seedTurn({
      orgId: org.id,
      threadId: null,
      customerId: null,
      mode: "auto_executed",
      instruction: "order-risk-review:998877",
      summary: "Flagged order.",
      actions: [{ tool: "flag_order", result: "Flagged.", status: "success", category: "action" }],
    });

    const now = new Date();
    const stats = await getAgentActionReportStatsForOrgInRange(
      org.id,
      new Date(now.getTime() - 60 * 60 * 1000),
      new Date(now.getTime() + 60 * 60 * 1000),
    );
    expect(stats.totalRuns).toBe(2);
    expect(stats.toolCounts).toMatchObject({
      create_refund: 1,
      send_reply: 1,
      flag_order: 1,
    });
    expect(stats.topTools.map((tool) => tool.tool).sort()).toEqual(["create_refund", "flag_order", "send_reply"]);
  });

  it("iterateAgentActionLogEntries yields every turn across multiple batches", async () => {
    org = await createTestOrg();
    const customer = await createTestCustomer(org.id, "ada@example.com", { name: "Ada" });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    for (let i = 0; i < 5; i += 1) {
      await seedTurn({
        orgId: org.id,
        threadId: thread.id,
        customerId: customer.id,
        instruction: `Turn ${i}`,
        summary: `Summary ${i}`,
        actions: [{ tool: "send_reply", result: `Reply ${i}.`, status: "success" }],
      });
    }

    const collected: string[] = [];
    for await (const entry of iterateAgentActionLogEntries({ orgId: org.id, batchSize: 2 })) {
      collected.push(entry.instruction ?? "");
    }
    expect(collected.sort()).toEqual(["Turn 0", "Turn 1", "Turn 2", "Turn 3", "Turn 4"]);
  });

  it("ignores AgentAction rows from other orgs", async () => {
    org = await createTestOrg();
    const otherOrg = await createTestOrg();
    try {
      const customer = await createTestCustomer(org.id, "ada@example.com", { name: "Ada" });
      const thread = await createTestThread(org.id, customer.id, ChannelType.email);
      const otherCustomer = await createTestCustomer(otherOrg.id, "bob@example.com", { name: "Bob" });
      const otherThread = await createTestThread(otherOrg.id, otherCustomer.id, ChannelType.email);

      await seedTurn({
        orgId: org.id,
        threadId: thread.id,
        customerId: customer.id,
        instruction: "Mine",
        summary: "ok",
        actions: [{ tool: "send_reply", result: "Reply sent.", status: "success" }],
      });
      await seedTurn({
        orgId: otherOrg.id,
        threadId: otherThread.id,
        customerId: otherCustomer.id,
        instruction: "Theirs",
        summary: "ok",
        actions: [{ tool: "send_reply", result: "Reply sent.", status: "success" }],
      });

      const mine = await listAgentActionLogEntries({ orgId: org.id });
      expect(mine.entries).toHaveLength(1);
      expect(mine.entries[0].instruction).toBe("Mine");
    } finally {
      await db.organization.delete({ where: { id: otherOrg.id } }).catch(() => undefined);
    }
  });
});
