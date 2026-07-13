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
import {
  buildAgentPlanCacheRecord,
  commitThreadPlanCacheIfCurrent,
  readAgentPlanCache,
} from "./plan-cache.js";
import { resolveAgentSettings } from "./settings.js";
import type { AgentPlan } from "./types.js";

const orgIds: string[] = [];

const plan: AgentPlan = {
  instruction: "Handle this",
  steps: [{
    id: "send_1",
    tool: "send_reply",
    label: "Reply",
    description: "Reply to the customer",
    category: "communication",
    enabled: true,
  }],
  rawToolCalls: [{ id: "send_1", name: "send_reply", input: { text: "Hello" } }],
};

afterEach(async () => {
  await Promise.all(orgIds.splice(0).map((orgId) => cleanupTestData(orgId)));
});

describe("conditional plan cache commit", () => {
  it("rejects a stale source message and commits the newest source", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, `${randomUUID()}@test.com`);
    const thread = await createTestThread(org.id, customer.id, "email");
    const oldMessage = await createTestMessage(thread.id, "First request");
    const newMessage = await createTestMessage(thread.id, "Updated request");
    await db.message.update({
      where: { id: newMessage.id },
      data: { sentAt: new Date(oldMessage.sentAt.getTime() + 1_000) },
    });
    const settings = resolveAgentSettings(null);
    const oldCache = buildAgentPlanCacheRecord({
      instruction: "First request",
      lastCustomerMessageId: oldMessage.id,
      settings,
      plan,
    });
    const newCache = buildAgentPlanCacheRecord({
      instruction: "Updated request",
      lastCustomerMessageId: newMessage.id,
      settings,
      plan,
    });

    await expect(commitThreadPlanCacheIfCurrent({
      orgId: org.id,
      threadId: thread.id,
      sourceMessageId: oldMessage.id,
      cache: oldCache,
    })).resolves.toBe(false);
    await expect(commitThreadPlanCacheIfCurrent({
      orgId: org.id,
      threadId: thread.id,
      sourceMessageId: newMessage.id,
      cache: newCache,
    })).resolves.toBe(true);

    const updated = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(updated.cachedPlanMessageId).toBe(newMessage.id);
    expect(readAgentPlanCache(updated.cachedPlan)?.planId).toBe(newCache.planId);
  });

  it("rejects a plan when an agent reply has already handled the source", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, `${randomUUID()}@test.com`);
    const thread = await createTestThread(org.id, customer.id, "email");
    const customerMessage = await createTestMessage(thread.id, "Question");
    const agentMessage = await createTestMessage(thread.id, "Answered", "agent");
    await db.message.update({
      where: { id: agentMessage.id },
      data: { sentAt: new Date(customerMessage.sentAt.getTime() + 1_000) },
    });
    const cache = buildAgentPlanCacheRecord({
      instruction: "Question",
      lastCustomerMessageId: customerMessage.id,
      settings: resolveAgentSettings(null),
      plan,
    });

    await expect(commitThreadPlanCacheIfCurrent({
      orgId: org.id,
      threadId: thread.id,
      sourceMessageId: customerMessage.id,
      cache,
    })).resolves.toBe(false);
  });
});
