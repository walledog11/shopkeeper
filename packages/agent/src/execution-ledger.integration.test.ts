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
import { BadRequestError, ConflictError } from "./errors.js";
import { buildAgentPlanCacheRecord } from "./plan-cache.js";
import { hashInstruction, hashPlan } from "./agent-actions.js";
import { executeCurrentCachedHomePlan, type PlanExecutionDeps } from "./plan-execution.js";
import { resolveAgentSettings } from "./settings.js";
import type { AgentContext } from "./agent-context.js";
import type { AgentPlan } from "./types.js";
import {
  claimPlanExecution,
  claimCurrentPlanExecution,
  claimStoredPlanExecution,
  completePlanExecution,
  observePlanExecution,
  type PlanExecutionIdentity,
} from "./execution-ledger.js";

const orgIds: string[] = [];

async function seedIdentity(): Promise<PlanExecutionIdentity> {
  const org = await createTestOrg();
  orgIds.push(org.id);
  const customer = await createTestCustomer(org.id, `${randomUUID()}@test.com`);
  const thread = await createTestThread(org.id, customer.id, "email");
  const message = await createTestMessage(thread.id, "Please refund order #1001");
  return {
    orgId: org.id,
    planId: randomUUID(),
    threadId: thread.id,
    sourceMessageId: message.id,
    planHash: "a".repeat(64),
    instructionHash: "b".repeat(64),
    mode: "human_approved",
  };
}

afterEach(async () => {
  await Promise.all(orgIds.splice(0).map((orgId) => cleanupTestData(orgId)));
});

describe("plan execution ledger", () => {
  it("records repeated shadow observations without claiming the plan", async () => {
    const identity = await seedIdentity();

    await observePlanExecution(identity);
    const second = await observePlanExecution(identity);

    expect(second.status).toBe("pending");
    expect(second.observationCount).toBe(2);
    expect(second.claimToken).toBeNull();
  });

  it("allows exactly one concurrent claimant", async () => {
    const identity = await seedIdentity();
    const results = await Promise.all(Array.from({ length: 8 }, () => (
      claimPlanExecution(identity)
    )));

    expect(results.filter((result) => result.claimed)).toHaveLength(1);
    expect(new Set(results.map((result) => result.execution.id)).size).toBe(1);
    expect(results.every((result) => result.execution.status === "claimed")).toBe(true);
  });

  it("rejects a stale cached plan inside the claim transaction", async () => {
    const identity = await seedIdentity();
    const settings = resolveAgentSettings(null);
    const plan: AgentPlan = {
      instruction: "Handle this",
      steps: [{
        id: "send_1",
        tool: "send_reply",
        label: "Reply",
        description: "Reply",
        category: "communication",
        enabled: true,
      }],
      rawToolCalls: [{ id: "send_1", name: "send_reply", input: { text: "Hello" } }],
    };
    const cache = buildAgentPlanCacheRecord({
      instruction: "Handle this",
      lastCustomerMessageId: identity.sourceMessageId!,
      settings,
      plan,
    });
    identity.planId = cache.planId!;
    identity.planHash = hashPlan(plan);
    identity.instructionHash = hashInstruction("Handle this");
    await db.thread.update({
      where: { id: identity.threadId! },
      data: { cachedPlanMessageId: identity.sourceMessageId, cachedPlan: cache as object },
    });
    const newer = await createTestMessage(identity.threadId!, "Updated request");
    await db.message.update({
      where: { id: newer.id },
      data: { sentAt: new Date(Date.now() + 60_000) },
    });

    await expect(claimCurrentPlanExecution(identity)).rejects.toBeInstanceOf(ConflictError);
    const execution = await db.planExecution.findUniqueOrThrow({
      where: { organizationId_planId: { organizationId: identity.orgId, planId: identity.planId } },
    });
    expect(execution.status).toBe("failed");
    expect(execution.lastError).toBe("stale_plan");
  });

  it("requires the active claim token for terminal transitions", async () => {
    const identity = await seedIdentity();
    const claim = await claimPlanExecution(identity);
    expect(claim.claimed).toBe(true);
    expect(claim.claimToken).not.toBeNull();

    await expect(completePlanExecution({
      executionId: claim.execution.id,
      claimToken: randomUUID(),
      status: "committed",
    })).rejects.toBeInstanceOf(ConflictError);

    const completed = await completePlanExecution({
      executionId: claim.execution.id,
      claimToken: claim.claimToken!,
      status: "committed",
    });
    expect(completed.status).toBe("committed");
    expect(completed.completedAt).not.toBeNull();
  });

  it("rejects reuse of a plan id with different hashes", async () => {
    const identity = await seedIdentity();
    await observePlanExecution(identity);

    await expect(observePlanExecution({
      ...identity,
      planHash: "c".repeat(64),
    })).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects thread or source-message ids owned by another tenant", async () => {
    const identity = await seedIdentity();
    const other = await seedIdentity();

    await expect(observePlanExecution({
      ...identity,
      threadId: other.threadId,
    })).rejects.toBeInstanceOf(BadRequestError);

    await expect(observePlanExecution({
      ...identity,
      planId: randomUUID(),
      sourceMessageId: other.sourceMessageId,
    })).rejects.toBeInstanceOf(BadRequestError);
  });

  it("rejects a source message from another thread in the same tenant", async () => {
    const identity = await seedIdentity();
    const customer = await createTestCustomer(identity.orgId, `${randomUUID()}@test.com`);
    const otherThread = await createTestThread(identity.orgId, customer.id, "email");
    const otherMessage = await createTestMessage(otherThread.id, "Unrelated request");

    await expect(observePlanExecution({
      ...identity,
      sourceMessageId: otherMessage.id,
    })).rejects.toBeInstanceOf(BadRequestError);
  });

  it("claims a host-specific stored plan exactly once and rejects replacement", async () => {
    const identity = await seedIdentity();
    const instruction = "Create an order";
    const storedPlan: AgentPlan = {
      instruction,
      steps: [{
        id: "create_1",
        tool: "create_shopify_order",
        label: "Create order",
        description: "Create an order",
        category: "action",
        enabled: true,
      }],
      rawToolCalls: [{
        id: "create_1",
        name: "create_shopify_order",
        input: { email: "ada@example.com", line_items: [] },
      }],
    };
    identity.planHash = hashPlan(storedPlan);
    identity.instructionHash = hashInstruction(instruction);
    identity.sourceMessageId = null;
    await db.thread.update({
      where: { id: identity.threadId! },
      data: {
        cachedPlan: {
          kind: "dashboard_pending_approval",
          planId: identity.planId,
          instruction,
          plan: storedPlan,
        },
      },
    });

    const claims = await Promise.all([
      claimStoredPlanExecution(identity),
      claimStoredPlanExecution(identity),
    ]);
    expect(claims.filter((claim) => claim.claimed)).toHaveLength(1);

    const replacement = { ...identity, planId: randomUUID() };
    await expect(claimStoredPlanExecution(replacement)).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows AgentAction rows to link to the durable execution intent", async () => {
    const identity = await seedIdentity();
    const observed = await observePlanExecution(identity);

    const action = await db.agentAction.create({
      data: {
        turnId: randomUUID(),
        executionId: observed.id,
        organizationId: identity.orgId,
        threadId: identity.threadId,
        tool: "create_refund",
        category: "action",
        input: { amount: "12.00" },
        status: "success",
        mode: "human_approved",
        durationMs: 10,
      },
      include: { execution: true },
    });

    expect(action.execution?.planId).toBe(identity.planId);
  });

  it("allows only one cross-runtime approved execution to reach the provider seam", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, `${randomUUID()}@test.com`);
    const thread = await createTestThread(org.id, customer.id, "email");
    const message = await createTestMessage(thread.id, "Please reply");
    const settings = resolveAgentSettings(null);
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
    const cache = buildAgentPlanCacheRecord({
      instruction: "Handle this",
      lastCustomerMessageId: message.id,
      settings,
      plan,
    });
    await db.thread.update({
      where: { id: thread.id },
      data: { cachedPlanMessageId: message.id, cachedPlan: cache as object },
    });

    let providerCalls = 0;
    let releaseProvider!: () => void;
    const providerBlocked = new Promise<void>((resolve) => { releaseProvider = resolve; });
    let providerEntered!: () => void;
    const enteredProvider = new Promise<void>((resolve) => { providerEntered = resolve; });
    const deps: PlanExecutionDeps = {
      lock: {
        acquire: async () => ({ release: async () => {} }),
      },
      buildContext: async () => ({}) as AgentContext,
      runAgent: async () => {
        providerCalls += 1;
        providerEntered();
        await providerBlocked;
        return {
          summary: "Sent",
          actionsPerformed: [{ tool: "send_reply", result: "Sent", status: "success" }],
        };
      },
      shadow: {
        recordShadowDecision: async () => {},
        resolveShadowDecisionOnApproval: async () => {},
      },
    };
    const execute = () => executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      allowedKinds: ["quick_reply", "needs_review"],
      failureRoute: "test",
    }, deps);

    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      allowedKinds: ["quick_reply", "needs_review"],
      failureRoute: "test",
      approvedToolCalls: [plan.rawToolCalls[0]!, plan.rawToolCalls[0]!],
    }, deps)).rejects.toBeInstanceOf(BadRequestError);
    expect(providerCalls).toBe(0);

    const first = execute();
    await enteredProvider;
    const second = execute();
    const secondResult = await Promise.allSettled([second]);
    releaseProvider();
    await first;

    expect(providerCalls).toBe(1);
    expect(secondResult[0]?.status).toBe("rejected");
    expect((secondResult[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    const execution = await db.planExecution.findUniqueOrThrow({
      where: { organizationId_planId: { organizationId: org.id, planId: cache.planId! } },
    });
    expect(execution.status).toBe("committed");
  });
});
