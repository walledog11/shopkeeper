import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChannelType, db } from "@shopkeeper/db";
import {
  cleanupTestData,
  createTestCustomer,
  createTestIntegration,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from "@shopkeeper/db/test-helpers";
import { emptyIntents, emptyRequestFacts } from "./classifier-signals.js";
import { buildContext, type ThreadSink } from "./context.js";
import { appendInitialPlanningSignals } from "./planner-read-tools.js";
import { buildPlanSignals } from "./plan-signals.js";
import { executeToolWithStatus } from "./tools/executor.js";
import type { ProducedPlanSignalCode } from "./types.js";

// The database is real; a single load is faulted with spyOn so the tier it sits
// in can be observed. There is no other way to see the difference between the
// three tiers, and the difference is the whole contract: today a knowledge-base
// query that rejects takes the turn down with it, while a merchant-preference
// query that rejects does not, and nothing in the code says which is intended.

const orgIds: string[] = [];

const sink: ThreadSink = {
  escalateToHuman: async () => ({ status: "ok", message: "ok" }),
  askOperator: async () => ({ status: "ok", message: "ok" }),
  addInternalNote: async () => ({ status: "ok", message: "ok" }),
  sendReply: async () => ({ status: "ok", message: "ok" }),
  sendEmail: async () => ({ status: "ok", message: "ok" }),
  updateThreadStatus: async () => ({ status: "ok", message: "ok" }),
  updateThreadTag: async () => ({ status: "ok", message: "ok" }),
};

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(orgIds.splice(0).map((orgId) => cleanupTestData(orgId)));
});

async function supportThread(options: { withIntegration?: boolean } = {}) {
  const org = await createTestOrg();
  orgIds.push(org.id);
  if (options.withIntegration !== false) {
    await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      externalAccountId: `tier-${randomUUID()}.myshopify.com`,
      accessToken: "shpat_test",
    });
  }
  const customer = await createTestCustomer(org.id, `${randomUUID()}@test.com`);
  const thread = await createTestThread(org.id, customer.id, ChannelType.email);
  await createTestMessage(thread.id, "Please send #1001 to 5 New Street instead.");
  const knowledgeBase = await db.knowledgeBase.create({
    data: { organizationId: org.id, name: "Policies" },
  });
  await db.kbArticle.create({
    data: {
      organizationId: org.id,
      knowledgeBaseId: knowledgeBase.id,
      title: "Address changes",
      body: "Addresses can be changed before fulfilment.",
      tags: [],
    },
  });
  return { org, customer, thread };
}

describe("context dependency tiers", () => {
  it("separates a completed support return from a later exchange using persisted message identities", async () => {
    const { org, thread } = await supportThread({ withIntegration: false });
    const original = await createTestMessage(thread.id, "Return order #1042.");
    const task = await db.agentTask.create({ data: {
      organizationId: org.id, threadId: thread.id,
      initiatingActorKind: "customer", initiatingActorKey: "customer:test",
      objective: "Return order #1042", runtimeVersion: 2, status: "completed",
      completedAt: new Date(), checkpointVersion: 1, checkpoint: {},
      modelCallLimit: 20, activeTimeMsLimit: 120_000, spendNanoUsdLimit: 1_000_000_000n,
    } });
    await db.planExecution.create({ data: {
      organizationId: org.id, threadId: thread.id, taskId: task.id,
      sourceMessageId: original.id, planId: randomUUID(),
      planHash: "a".repeat(64), instructionHash: "b".repeat(64), status: "committed",
      claimToken: randomUUID(), claimedAt: new Date(), completedAt: new Date(),
    } });
    const reply = await createTestMessage(thread.id, "Opened return #1042-R1.", "agent");
    await db.message.update({ where: { id: reply.id }, data: { agentTaskId: task.id } });
    const current = await createTestMessage(thread.id, "Exchange the regular wax on #1041 for the Sample.");

    const context = await buildContext(thread.id, org.id, sink, { runtimeVersion: 2 });
    expect(context.currentCustomerMessageIds).toEqual([current.id]);
    expect(context.recentMessages.find(message => message.id === reply.id))
      .toMatchObject({ task: { id: task.id, status: "completed" } });

    // A committed handoff without a customer reply is the same request boundary.
    await db.message.delete({ where: { id: reply.id } });
    const afterHandoff = await buildContext(thread.id, org.id, sink, { runtimeVersion: 2 });
    expect(afterHandoff.currentCustomerMessageIds).toEqual([current.id]);
  });

  it("retains the recorded state of earlier operator tasks in conversation history", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, `operator:${randomUUID()}`);
    const thread = await createTestThread(org.id, customer.id, ChannelType.operator);
    const task = await db.agentTask.create({ data: {
      organizationId: org.id, threadId: thread.id,
      initiatingActorKind: "member", initiatingActorKey: "member:test",
      objective: "Compare five orders", runtimeVersion: 2, status: "cancelled", cancelledAt: new Date(),
      checkpointVersion: 1, checkpoint: {},
      modelCallLimit: 20, activeTimeMsLimit: 120_000, spendNanoUsdLimit: 1_000_000_000n,
    } });
    const message = await createTestMessage(thread.id, "Compare five orders");
    await db.message.update({ where: { id: message.id }, data: { agentTaskId: task.id } });
    await createTestMessage(thread.id, "Check only order #1035");

    const context = await buildContext(thread.id, org.id, sink);
    expect(context.recentMessages.find((entry) => entry.contentText === "Compare five orders"))
      .toMatchObject({ task: { id: task.id, status: "cancelled" } });
    expect(context.recentMessages.find((entry) => entry.contentText === "Check only order #1035"))
      .not.toHaveProperty("task");
  });

  it("keeps the turn usable when the optional knowledge-base load fails, and names the gap", async () => {
    const { org, thread } = await supportThread();

    // The KB pre-fetch is the only $queryRaw in buildContext.
    vi.spyOn(db, "$queryRaw").mockRejectedValueOnce(new Error("relation does not exist"));
    const ctx = await buildContext(thread.id, org.id, sink);

    // Unrelated work continues: identity, messages and the Shopify grant that
    // authorizes an address change are all present.
    expect(ctx.kbArticles).toEqual([]);
    expect(ctx.customer.platformId).toContain("@test.com");
    expect(ctx.recentMessages).toHaveLength(1);
    expect(ctx.shopify).not.toBeNull();

    // And the merchant is told, so a reply written without documented policy is
    // not presented as though the policy had been read.
    expect(ctx.kbFetchFailed).toBe(true);
    const codes: ProducedPlanSignalCode[] = [];
    appendInitialPlanningSignals({ ctx, operatorMode: false, codes });
    expect(codes).toContain("kb_fetch_failed");
    expect(buildPlanSignals(codes, [{ name: "send_reply", input: {} }]))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "kb_fetch_failed", severity: "blocking" }),
      ]));
  });

  it("keeps the turn usable when the optional open-thread count fails", async () => {
    const { org, thread } = await supportThread();

    vi.spyOn(db.thread, "count").mockRejectedValueOnce(new Error("statement timeout"));
    const ctx = await buildContext(thread.id, org.id, sink);

    // The neutral answer: this thread and nothing else open.
    expect(ctx.openThreadCount).toBe(1);
    expect(ctx.kbArticles.length).toBeGreaterThan(0);
    expect(ctx.kbFetchFailed).toBeUndefined();
  });

  it("keeps the turn usable when the optional merchant-preference load fails", async () => {
    const { org, thread } = await supportThread();

    vi.spyOn(db.merchantPreference, "findMany").mockRejectedValueOnce(new Error("P2021"));
    const ctx = await buildContext(thread.id, org.id, sink);

    // The M5 regression: this load shipped ahead of its table and the rejection
    // escaped an uncaught Promise.all, leaving every inbound message unplanned.
    expect(ctx.merchantPreferences).toEqual([]);
    expect(ctx.recentMessages).toHaveLength(1);
  });

  it("refuses to build a turn when the Shopify policy evidence cannot be read", async () => {
    const { org, thread } = await supportThread();

    vi.spyOn(db.integration, "findFirst").mockRejectedValueOnce(new Error("connection reset"));

    // Not a context with shopify: null. A failed read of the grant is not
    // evidence that the store is disconnected, and every dependent write would
    // refuse itself for the wrong reason if it were treated as one.
    await expect(buildContext(thread.id, org.id, sink)).rejects.toThrow(/connection reset/);
  });

  it("blocks the dependent write when the store genuinely has no Shopify grant", async () => {
    const { org, thread } = await supportThread({ withIntegration: false });

    const ctx = await buildContext(thread.id, org.id, sink);
    expect(ctx.shopify).toBeNull();

    const result = await executeToolWithStatus(
      "update_shopify_order_address",
      {
        order_id: "1001",
        customer_id: "2002",
        address1: "5 New Street",
        city: "Leeds",
        province: "NY",
        zip: "10001",
        country: "United States",
      },
      ctx,
    );

    // The same absent evidence, reached honestly, refuses the write it gates —
    // which is the outcome the failed read above must not be able to fake.
    expect(result.status).toBe("error");
    expect(result.result).toContain("no Shopify integration connected");
  });

  it("defers the knowledge base on a status question and keeps it everywhere else", async () => {
    const { org, thread } = await supportThread();
    const message = await db.message.findFirst({
      where: { threadId: thread.id, senderType: "customer" },
    });
    await db.thread.update({
      where: { id: thread.id },
      data: {
        requestSourceMessageId: message!.id,
        classifierSignals: {
          version: 5,
          language: "en",
          intents: { ...emptyIntents(), order_status: true },
          requestFacts: emptyRequestFacts(),
        },
      },
    });

    vi.stubEnv("AGENT_CAPABILITY_DISCOVERY_MODE", "off");
    expect((await buildContext(thread.id, org.id, sink)).kbArticles).toEqual([]);

    // Status turns always defer KB retrieval to search_kb, including when a
    // retired compatibility setting is present.
    vi.stubEnv("AGENT_CAPABILITY_DISCOVERY_MODE", "discover");
    const deferred = await buildContext(thread.id, org.id, sink);
    expect(deferred.kbArticles).toEqual([]);
    // Deferred, not failed — the merchant is told about the second, never the first.
    expect(deferred.kbFetchFailed).toBeUndefined();

    // A status question with an explicit compensation request still needs store
    // policy, even when the classifier omitted the broader mutative flag.
    await db.thread.update({
      where: { id: thread.id },
      data: {
        classifierSignals: {
          version: 6,
          language: "en",
          intents: { ...emptyIntents(), order_status: true, compensation_request: true },
          requestFacts: emptyRequestFacts(),
        },
      },
    });
    expect((await buildContext(thread.id, org.id, sink)).kbArticles.length).toBeGreaterThan(0);
  });

  it("refuses to build a storefront turn when the verification evidence cannot be read", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, `shopify_chat:${randomUUID()}`);
    const thread = await createTestThread(org.id, customer.id, ChannelType.shopify_chat);
    await createTestMessage(thread.id, "Where is my order?");

    vi.spyOn(db.storefrontChatVerification, "findMany")
      .mockRejectedValueOnce(new Error("connection reset"));

    // Degrading to guest would be the safe direction and still wrong: a shopper
    // who proved control of their order would be answered as an anonymous one,
    // and nothing would say why.
    await expect(buildContext(thread.id, org.id, sink)).rejects.toThrow(/connection reset/);
  });
});
