import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@shopkeeper/db";
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from "@shopkeeper/db/test-helpers";
import { hashInstruction, hashPlan } from "./agent-actions.js";
import { buildAgentPlanCacheRecord, commitThreadPlanCacheIfCurrent } from "./plan-cache.js";
import {
  captureCommittedPlanOutcome,
  recordManualMerchantReplyForThread,
  recordRequestEpisodeDismissed,
  recordRequestEpisodeExecution,
  recordRequestEpisodeMerchantInputAnswered,
  resolveManualReplySourceMessageId,
} from "./request-outcome.js";
import { queryRequestOutcomeReport } from "./request-outcome-report.js";
import { resolveAgentSettings } from "./settings.js";
import type { AgentPlan } from "./types.js";

const orgIds: string[] = [];

function quickReplyPlan(instruction: string): AgentPlan {
  return {
    instruction,
    steps: [{ tool: "send_reply", description: "Reply", input: { text: "Thanks!" } }],
    rawToolCalls: [{
      type: "tool_use",
      id: "toolu_reply",
      name: "send_reply",
      input: { text: "Thanks!" },
    }],
    validation: { status: "valid", issues: [] },
    routingEvidence: { classifierState: "not_applicable", codes: [] },
  };
}

afterEach(async () => {
  await Promise.all(orgIds.splice(0).map((orgId) => cleanupTestData(orgId)));
});

describe("request episode outcomes", () => {
  it("records planned, superseded, executed, and dismissed histories separately", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, `${randomUUID()}@test.com`);
    const thread = await createTestThread(org.id, customer.id, "email", { tag: "Order Status" });
    await db.thread.update({
      where: { id: thread.id },
      data: {
        requestDisposition: "informational",
        classifierSignals: {
          version: 5,
          language: "en",
          intents: { order_status: true },
          requestFacts: { ask: "order_status" },
        },
      },
    });
    const hydratedThread = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    const message = await createTestMessage(thread.id, "Where is order #1001?");
    const settings = resolveAgentSettings(null);
    const instruction = "Where is order #1001?";

    const firstPlan = quickReplyPlan(instruction);
    const firstCache = buildAgentPlanCacheRecord({
      instruction,
      lastCustomerMessageId: message.id,
      settings,
      plan: firstPlan,
    });
    await commitThreadPlanCacheIfCurrent({
      orgId: org.id,
      threadId: thread.id,
      sourceMessageId: message.id,
      cache: firstCache,
    });
    await captureCommittedPlanOutcome({
      orgId: org.id,
      thread: {
        id: hydratedThread.id,
        customerId: customer.id,
        channelType: hydratedThread.channelType,
        tag: hydratedThread.tag,
        requestDisposition: hydratedThread.requestDisposition,
        classifierSignals: hydratedThread.classifierSignals,
      },
      sourceMessageId: message.id,
      planId: firstCache.planId!,
      instruction,
      plan: firstPlan,
      settings,
    });

    const secondPlan = quickReplyPlan(instruction);
    const secondCache = buildAgentPlanCacheRecord({
      instruction,
      lastCustomerMessageId: message.id,
      settings,
      plan: secondPlan,
    });
    await commitThreadPlanCacheIfCurrent({
      orgId: org.id,
      threadId: thread.id,
      sourceMessageId: message.id,
      cache: secondCache,
    });
    await captureCommittedPlanOutcome({
      orgId: org.id,
      thread: {
        id: hydratedThread.id,
        customerId: customer.id,
        channelType: hydratedThread.channelType,
        tag: hydratedThread.tag,
        requestDisposition: hydratedThread.requestDisposition,
        classifierSignals: hydratedThread.classifierSignals,
      },
      sourceMessageId: message.id,
      planId: secondCache.planId!,
      instruction,
      plan: secondPlan,
      settings,
    });

    await recordRequestEpisodeExecution({
      orgId: org.id,
      planId: secondCache.planId!,
      executionStatus: "committed",
      executionIntent: "automatic",
      planVerdict: "quick_reply",
    });

    const rows = await db.requestEpisodeOutcome.findMany({
      where: { organizationId: org.id, sourceMessageId: message.id },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.terminalResolution).toBe("superseded");
    expect(rows[0]?.supersededByPlanId).toBe(secondCache.planId);
    expect(rows[1]?.terminalResolution).toBe("auto_resolved");
    expect(rows[1]?.replyProvenance).toBe("agent_automatic");
    expect(rows[1]?.requestTag).toBe("Order Status");
    expect(rows[1]?.requestAsk).toBe("order_status");
    expect(rows[1]?.planHash).toBe(hashPlan(secondPlan));
    expect(rows[1]?.instructionHash).toBe(hashInstruction(instruction));

    const report = await queryRequestOutcomeReport({
      orgId: org.id,
      from: new Date(Date.now() - 60_000),
      to: new Date(Date.now() + 60_000),
    });
    expect(report).toEqual([{
      requestTag: "Order Status",
      volume: 2,
      autoResolved: 1,
      merchantApproved: 0,
      merchantInput: 0,
      escalated: 0,
      failed: 0,
      invalidPlan: 0,
      namespaceMiss: 0,
    }]);
  });

  it("records namespace miss from the committed plan", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, `${randomUUID()}@test.com`);
    const thread = await createTestThread(org.id, customer.id, "email", { tag: "Policy" });
    const hydratedThread = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    const message = await createTestMessage(thread.id, "Can you change my email?");
    const settings = resolveAgentSettings(null);
    const instruction = "Can you change my email?";
    const plan: AgentPlan = {
      ...quickReplyPlan(instruction),
      namespaceMiss: true,
    };
    const cache = buildAgentPlanCacheRecord({
      instruction,
      lastCustomerMessageId: message.id,
      settings,
      plan,
    });
    await commitThreadPlanCacheIfCurrent({
      orgId: org.id,
      threadId: thread.id,
      sourceMessageId: message.id,
      cache,
    });
    await captureCommittedPlanOutcome({
      orgId: org.id,
      thread: {
        id: hydratedThread.id,
        customerId: customer.id,
        channelType: hydratedThread.channelType,
        tag: hydratedThread.tag,
        requestDisposition: hydratedThread.requestDisposition,
        classifierSignals: hydratedThread.classifierSignals,
      },
      sourceMessageId: message.id,
      planId: cache.planId!,
      instruction,
      plan,
      settings,
    });

    const row = await db.requestEpisodeOutcome.findUniqueOrThrow({
      where: {
        organizationId_planId: {
          organizationId: org.id,
          planId: cache.planId!,
        },
      },
    });
    expect(row.namespaceMiss).toBe(true);

    const report = await queryRequestOutcomeReport({
      orgId: org.id,
      from: new Date(Date.now() - 60_000),
      to: new Date(Date.now() + 60_000),
    });
    expect(report).toEqual([{
      requestTag: "Policy",
      volume: 1,
      autoResolved: 0,
      merchantApproved: 0,
      merchantInput: 0,
      escalated: 0,
      failed: 0,
      invalidPlan: 0,
      namespaceMiss: 1,
    }]);
  });

  it("records manual merchant replies on unresolved plan rows", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, `${randomUUID()}@test.com`);
    const thread = await createTestThread(org.id, customer.id, "email", { tag: "Support" });
    await db.thread.update({
      where: { id: thread.id },
      data: {
        requestSourceMessageId: null,
        classifierSignals: {
          version: 5,
          language: "en",
          intents: { policy_question: true },
          requestFacts: { ask: "policy_question" },
        },
      },
    });
    const hydratedThread = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    const message = await createTestMessage(thread.id, "Do you ship to Canada?");
    await db.thread.update({
      where: { id: thread.id },
      data: { requestSourceMessageId: message.id },
    });
    const settings = resolveAgentSettings(null);
    const instruction = "Do you ship to Canada?";
    const plan = quickReplyPlan(instruction);
    const cache = buildAgentPlanCacheRecord({
      instruction,
      lastCustomerMessageId: message.id,
      settings,
      plan,
    });
    await commitThreadPlanCacheIfCurrent({
      orgId: org.id,
      threadId: thread.id,
      sourceMessageId: message.id,
      cache,
    });
    await captureCommittedPlanOutcome({
      orgId: org.id,
      thread: {
        id: hydratedThread.id,
        customerId: customer.id,
        channelType: hydratedThread.channelType,
        tag: hydratedThread.tag,
        requestDisposition: hydratedThread.requestDisposition,
        classifierSignals: hydratedThread.classifierSignals,
      },
      sourceMessageId: message.id,
      planId: cache.planId!,
      instruction,
      plan,
      settings,
    });

    const outgoing = await createTestMessage(thread.id, "Yes, we ship to Canada.", "agent");
    await recordManualMerchantReplyForThread({
      orgId: org.id,
      threadId: thread.id,
      outgoingMessageId: outgoing.id,
    });

    const row = await db.requestEpisodeOutcome.findUniqueOrThrow({
      where: {
        organizationId_planId: {
          organizationId: org.id,
          planId: cache.planId!,
        },
      },
    });
    expect(row.replyProvenance).toBe("manual");
    expect(row.merchantTouched).toBe(true);
    expect(row.terminalResolution).toBe("merchant_approved");
    expect(row.terminalAt).not.toBeNull();
  });

  it("creates a manual-only episode row when no plan outcome exists", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, `${randomUUID()}@test.com`);
    const thread = await createTestThread(org.id, customer.id, "email", { tag: "General" });
    const message = await createTestMessage(thread.id, "Hello?");
    await db.thread.update({
      where: { id: thread.id },
      data: { requestSourceMessageId: message.id },
    });
    const outgoing = await createTestMessage(thread.id, "Hi there!", "agent");

    expect(await resolveManualReplySourceMessageId({
      orgId: org.id,
      threadId: thread.id,
      outgoingMessageId: outgoing.id,
    })).toBe(message.id);

    await recordManualMerchantReplyForThread({
      orgId: org.id,
      threadId: thread.id,
      outgoingMessageId: outgoing.id,
    });

    const rows = await db.requestEpisodeOutcome.findMany({
      where: { organizationId: org.id, sourceMessageId: message.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.planVerdict).toBe("manual");
    expect(rows[0]?.replyProvenance).toBe("manual");
    expect(rows[0]?.requestTag).toBe("General");
  });

  it("records merchant input answered on the asking plan", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, `${randomUUID()}@test.com`);
    const thread = await createTestThread(org.id, customer.id, "email");
    const message = await createTestMessage(thread.id, "Do you ship to Canada?");
    const askingPlanId = randomUUID();

    await db.requestEpisodeOutcome.create({
      data: {
        id: randomUUID(),
        organizationId: org.id,
        threadId: thread.id,
        customerId: customer.id,
        sourceMessageId: message.id,
        planId: askingPlanId,
        channelType: "email",
        planVerdict: "needs_merchant_input",
        planHash: "a".repeat(64),
        instructionHash: "b".repeat(64),
        merchantInputRequestedAt: new Date(),
      },
    });

    await recordRequestEpisodeMerchantInputAnswered({
      orgId: org.id,
      planId: askingPlanId,
    });

    const row = await db.requestEpisodeOutcome.findUniqueOrThrow({
      where: {
        organizationId_planId: {
          organizationId: org.id,
          planId: askingPlanId,
        },
      },
    });
    expect(row.merchantInputAnsweredAt).not.toBeNull();
    expect(row.merchantTouched).toBe(true);
  });

  it("records dismissed plans without touching executed siblings", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, `${randomUUID()}@test.com`);
    const thread = await createTestThread(org.id, customer.id, "email");
    const message = await createTestMessage(thread.id, "Please refund");
    const planId = randomUUID();

    await db.requestEpisodeOutcome.create({
      data: {
        id: randomUUID(),
        organizationId: org.id,
        threadId: thread.id,
        customerId: customer.id,
        sourceMessageId: message.id,
        planId,
        channelType: "email",
        planVerdict: "needs_review",
        planHash: "a".repeat(64),
        instructionHash: "b".repeat(64),
        approvalRequestedAt: new Date(),
      },
    });

    await recordRequestEpisodeDismissed({ orgId: org.id, planId });

    const row = await db.requestEpisodeOutcome.findUniqueOrThrow({
      where: {
        organizationId_planId: {
          organizationId: org.id,
          planId,
        },
      },
    });
    expect(row.terminalResolution).toBe("dismissed");
    expect(row.terminalAt).not.toBeNull();
  });
});
