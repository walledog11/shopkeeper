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
import {
  executeCurrentCachedHomePlan,
  maybeAutoExecuteCurrentCachedHomePlan,
  type PlanExecutionDeps,
} from "./plan-execution.js";
import { resolveAgentSettings } from "./settings.js";
import { ANY_MEMBER_ACTOR_KEY, acceptCustomerAgentRequest, claimAgentTask, settleAgentTaskClaim } from "./task-ledger.js";
import { deriveProposalCommunication } from "./proposal-communication.js";
import type { AgentContext } from "./agent-context.js";
import type { AgentPlan } from "./types.js";
import {
  claimPlanExecution,
  claimCurrentPlanExecution,
  completePlanExecution,
  observePlanExecution,
  type PlanExecutionIdentity,
} from "./execution-ledger.js";

const orgIds: string[] = [];

async function seedDurableTask(orgId: string, threadId: string, sourceMessageId: string, plan: AgentPlan, proposalId?: string) {
  const { request, task } = await acceptCustomerAgentRequest({
    organizationId: orgId, threadId, sourceMessageId, objective: plan.instruction,
    budget: { runtimeVersion: 2, modelCallLimit: 20, activeTimeMsLimit: 120000, spendNanoUsdLimit: 1000000000n },
  });
  const claim = await claimAgentTask({ organizationId: orgId, taskId: task.id, expectedRevision: task.revision });
  if (!claim) throw new Error("Could not claim the execution fixture");
  if (proposalId) {
    await db.orgMember.create({ data: { organizationId: orgId, clerkUserId: "usr_test" } });
    await settleAgentTaskClaim({
      organizationId: orgId, taskId: task.id, expectedRevision: task.revision, claimToken: claim.claimToken, requestId: request.id,
      settlement: {
        status: "waiting_approval",
        proposal: { proposalId, instruction: plan.instruction, rawToolCalls: plan.rawToolCalls, communication: plan.communication, sourceRequestIds: [request.id] },
        approver: { kind: "member", key: ANY_MEMBER_ACTOR_KEY },
      },
    });
  }
  return { requestId: request.id, taskId: task.id, runtimeVersion: task.runtimeVersion, expectedRevision: task.revision, claimToken: claim.claimToken };
}

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
  it("executes a clean quick reply even while mutative auto-execution is off", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, `${randomUUID()}@test.com`);
    const thread = await createTestThread(org.id, customer.id, "email");
    const message = await createTestMessage(thread.id, "Where is my order?");
    const settings = resolveAgentSettings({ autonomyTier: "guarded", autoExecuteMode: "off" });
    const plan: AgentPlan = {
      instruction: "Ask for the order number",
      steps: [{
        id: "send_1",
        tool: "send_reply",
        label: "Reply",
        description: "Ask for the order number",
        category: "communication",
        enabled: true,
      }],
      rawToolCalls: [{
        id: "send_1",
        name: "send_reply",
        input: { text: "Could you send your order number or checkout email?" },
      }],
    };
    const cache = buildAgentPlanCacheRecord({
      instruction: "Ask for the order number",
      lastCustomerMessageId: message.id,
      settings,
      plan,
    });
    await db.thread.update({
      where: { id: thread.id },
      data: { cachedPlanMessageId: message.id, cachedPlan: cache as object },
    });

    let sends = 0;
    const deps: PlanExecutionDeps = {
      lock: { acquire: async () => ({ release: async () => {} }) },
      buildContext: async () => ({}) as AgentContext,
      runAgent: async () => {
        sends += 1;
        return {
          summary: "Asked for order details",
          actionsPerformed: [{ tool: "send_reply", result: "Sent", status: "success" }],
        };
      },
    };

    const executed = await maybeAutoExecuteCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      failureRoute: "test",
      allowMutativeAutoExecute: false,
      durableTurn: await seedDurableTask(org.id, thread.id, message.id, plan),
    }, deps);

    expect(sends).toBe(1);
    expect(executed?.verdict.kind).toBe("quick_reply");
    const execution = await db.planExecution.findUniqueOrThrow({
      where: { organizationId_planId: { organizationId: org.id, planId: cache.planId! } },
    });
    expect(execution.mode).toBe("auto_executed");
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

  it("allows only one concurrent durable approval to reach the provider seam", async () => {
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
    plan.communication = deriveProposalCommunication(plan.rawToolCalls, thread) ?? undefined;
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
    await seedDurableTask(org.id, thread.id, message.id, plan, cache.planId ?? undefined);

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
    };
    const execute = () => executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approver: { clerkUserId: "usr_test" },
    }, deps);

    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
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
