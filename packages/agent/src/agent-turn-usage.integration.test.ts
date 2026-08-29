import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@shopkeeper/db";
import {
  cleanupTestData,
  createTestCustomer,
  createTestOrg,
  createTestThread,
} from "@shopkeeper/db/test-helpers";
import { recordAgentTurnUsage } from "./agent-actions.js";
import { createModelUsageMetrics, recordModelUsage } from "./usage.js";

const orgIds: string[] = [];

afterEach(async () => {
  await Promise.all(orgIds.splice(0).map((orgId) => cleanupTestData(orgId)));
});

function response(usage: Record<string, unknown>) {
  return { usage };
}

describe("recordAgentTurnUsage", () => {
  it("persists a turn that executed no tool at all", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const turnId = randomUUID();

    // The case the log line was the only record of: budget exhausted before any
    // tool ran, so no AgentAction row is written.
    await recordAgentTurnUsage({
      turnId,
      orgId: org.id,
      threadId: null,
      purpose: "operator_turn",
      channelType: "sms_agent",
      outcome: "token_budget",
      durationMs: 8_120,
      usage: {
        modelCalls: 1,
        inputTokens: 400,
        outputTokens: 120,
        cacheCreationInputTokens: 15_000,
        cacheCreation1hInputTokens: 0,
        cacheReadInputTokens: 0,
        totalTokens: 15_520,
        budgetTokens: 19_270,
        firstCallBudgetTokens: 19_270,
      },
    });

    const row = await db.agentTurnUsage.findUnique({ where: { turnId } });
    expect(row?.outcome).toBe("token_budget");
    expect(row?.budgetTokens).toBe(19_270);
    expect(row?.firstCallBudgetTokens).toBe(19_270);
    expect(row?.organizationId).toBe(org.id);
  });

  it("keeps the turn id joinable to the thread it ran on", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, "usage@example.com");
    const thread = await createTestThread(org.id, customer.id, "email");
    const turnId = randomUUID();

    await recordAgentTurnUsage({
      turnId,
      orgId: org.id,
      threadId: thread.id,
      purpose: "agent_run",
      channelType: "email",
      outcome: "end_turn",
      durationMs: 1_400,
      usage: createModelUsageMetrics(),
    });

    const rows = await db.agentTurnUsage.findMany({ where: { threadId: thread.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].turnId).toBe(turnId);
  });
});

describe("firstCallBudgetTokens", () => {
  // The whole point of carrying it separately: these two turns spend the same
  // total, and only one of them is a runaway loop.
  it("separates a cold opening from a loop that climbed", async () => {
    const cold = createModelUsageMetrics();
    recordModelUsage(cold, response({
      input_tokens: 200,
      output_tokens: 100,
      cache_creation_input_tokens: 15_000,
      cache_read_input_tokens: 0,
    }));

    const looped = createModelUsageMetrics();
    for (let i = 0; i < 5; i += 1) {
      recordModelUsage(looped, response({
        input_tokens: 3_000,
        output_tokens: 800,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      }));
    }

    expect(cold.firstCallBudgetTokens).toBe(cold.budgetTokens);
    expect(looped.firstCallBudgetTokens).toBe(3_800);
    expect(looped.budgetTokens).toBe(19_000);
    expect(looped.firstCallBudgetTokens).toBeLessThan(looped.budgetTokens / 4);
  });

  it("excludes a stable 1h cache write from the first call's budget", async () => {
    const metrics = createModelUsageMetrics();
    recordModelUsage(metrics, response({
      input_tokens: 200,
      output_tokens: 100,
      cache_creation_input_tokens: 15_000,
      cache_creation: { ephemeral_1h_input_tokens: 15_000 },
      cache_read_input_tokens: 0,
    }));

    // 300, not 300 + 1.25 * 15_000 — this is what a2ff32b8 was meant to buy.
    expect(metrics.firstCallBudgetTokens).toBe(300);
  });
});
