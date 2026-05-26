import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChannelType, db } from "@clerk/db";
import {
  cleanupTestData,
  createTestCustomer,
  createTestOrg,
  createTestThread,
} from "@clerk/db/test-helpers";
import {
  decodeAgentActionCursor,
  iterateAgentActionLogEntries,
  listAgentActionLogEntries,
  listAgentTurnsForOrgInRange,
  streamAgentActionLogCsv,
} from "@/lib/agent/api/action-log";
import { recordAgentActionsBatch } from "@/lib/agent/api/agent-actions";
import type { ActionEntry } from "@/lib/agent/types";

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
  threadId: string;
  customerId: string;
  instruction: string;
  summary: string;
  actions: ActionEntry[];
  mode?: "human_approved" | "auto_executed" | "read_only";
}) {
  await recordAgentActionsBatch({
    orgId: params.orgId,
    threadId: params.threadId,
    customerId: params.customerId,
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

  it("listAgentTurnsForOrgInRange reconstructs turns for the reports page", async () => {
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

    const now = new Date();
    const turns = await listAgentTurnsForOrgInRange(
      org.id,
      new Date(now.getTime() - 60 * 60 * 1000),
      new Date(now.getTime() + 60 * 60 * 1000),
    );
    expect(turns).toHaveLength(1);
    expect(turns[0].actions.map((a) => a.tool).sort()).toEqual(["create_refund", "send_reply"]);
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
