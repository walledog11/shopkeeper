import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db, Prisma } from "@shopkeeper/db";
import { cleanupTestData } from "@shopkeeper/db/test-helpers";
import { BadRequestError, ConflictError } from "./errors.js";
import { readAgentPlanCache } from "./plan-cache.js";
import { executeCurrentCachedHomePlan, maybeAutoExecuteCurrentCachedHomePlan, readParkedProposalForThread } from "./plan-execution.js";
import { hashInstruction, hashPlan } from "./agent-actions.js";
import {
  claimWithheldMessageFollowUp,
  findQueuedAgentTasks,
  finishWithheldMessageFollowUp,
  withheldMessageFollowUp,
  ANY_MEMBER_ACTOR_KEY,
} from "./task-ledger/index.js";
import type { AgentResult } from "./agent-context.js";
import {
  escalationPlan,
  makeDeps,
  mutativePlan,
  noteCall,
  okResult,
  orgIds,
  seedExecutablePlan,
  seedSupportCardParkedOnTask,
  seedThreadWithPlan,
  sendReplyCall,
  unreachableDeps,
} from "./test-fixtures/plan-execution.js";

afterEach(async () => {
  await Promise.all(orgIds.splice(0).map((orgId) => cleanupTestData(orgId)));
  vi.unstubAllEnvs();
});

describe("executeCurrentCachedHomePlan execution", () => {
  it("executes a v2 proposal by exact durable identity after its cache projection is gone", async () => {
    const support = await seedSupportCardParkedOnTask(2);
    const proposal = await db.agentProposal.findUniqueOrThrow({
      where: { id: support.cache.planId! },
    });
    await db.thread.update({
      where: { id: support.thread.id },
      data: { cachedPlan: Prisma.DbNull, cachedPlanMessageId: null },
    });
    const runAgent = vi.fn(async () => okResult);
    // One identity: the hash a card carries is the proposal row's hash, and a
    // step label the planner changes is display, not authority.
    expect(hashPlan(support.cache.plan)).toBe(proposal.proposalHash);
    expect(hashPlan({
      ...support.cache.plan,
      steps: support.cache.plan.steps.map((step) => ({ ...step, label: "Relabelled" })),
    })).toBe(proposal.proposalHash);

    await executeCurrentCachedHomePlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      settings: support.settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approver: { clerkUserId: support.member.clerkUserId, displayName: null },
      // What a phone card carries: `planIdentity` hashes the rendered plan.
      expectedIdentity: {
        planId: proposal.id,
        sourceMessageId: support.message.id,
        planHash: hashPlan(support.cache.plan),
        instructionHash: hashInstruction(support.cache.instruction),
      },
    }, makeDeps({ runAgent }));

    expect(runAgent.mock.calls[0]?.[1]).toBe(proposal.instruction);
    expect(runAgent.mock.calls[0]?.[2]).toEqual(proposal.canonicalActions);
    expect(await db.planExecution.findUnique({
      where: {
        organizationId_planId: {
          organizationId: support.org.id,
          planId: proposal.id,
        },
      },
    })).toMatchObject({ proposalId: proposal.id, taskId: support.task.id });
  });

  it("rejects a v2 card whose plan hash names a different bundle", async () => {
    const support = await seedSupportCardParkedOnTask(2);
    const runAgent = vi.fn(async () => okResult);

    await expect(executeCurrentCachedHomePlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      settings: support.settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approver: { clerkUserId: support.member.clerkUserId, displayName: null },
      expectedIdentity: {
        planId: support.cache.planId!,
        sourceMessageId: support.message.id,
        planHash: hashPlan({ ...support.cache.plan, rawToolCalls: [noteCall, sendReplyCall] }),
        instructionHash: hashInstruction(support.cache.instruction),
      },
    }, makeDeps({ runAgent }))).rejects.toBeInstanceOf(ConflictError);
    expect(runAgent).not.toHaveBeenCalled();
    expect(await db.planExecution.count({ where: { organizationId: support.org.id } })).toBe(0);
  });

  it("does not consume a newer cache projection after exact v2 proposal execution", async () => {
    const support = await seedSupportCardParkedOnTask(2);
    const proposal = await db.agentProposal.findUniqueOrThrow({
      where: { id: support.cache.planId! },
    });
    const replacementPlanId = randomUUID();
    await db.thread.update({
      where: { id: support.thread.id },
      data: {
        cachedPlanMessageId: support.message.id,
        cachedPlan: { ...support.cache, planId: replacementPlanId },
      },
    });

    await executeCurrentCachedHomePlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      settings: support.settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approver: { clerkUserId: support.member.clerkUserId, displayName: null },
      expectedIdentity: { planId: proposal.id },
    }, makeDeps());

    const thread = await db.thread.findUniqueOrThrow({ where: { id: support.thread.id } });
    expect(readAgentPlanCache(thread.cachedPlan)?.planId).toBe(replacementPlanId);
  });

  it("uses the immutable proposal envelope for a v2 execution", async () => {
    const support = await seedSupportCardParkedOnTask(2);
    const runAgent = vi.fn(async () => okResult);

    await executeCurrentCachedHomePlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      settings: support.settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approver: { clerkUserId: support.member.clerkUserId, displayName: null },
    }, makeDeps({ runAgent }));

    const proposal = await db.agentProposal.findUniqueOrThrow({
      where: { id: support.cache.planId! },
    });
    const execution = await db.planExecution.findUniqueOrThrow({
      where: {
        organizationId_planId: {
          organizationId: support.org.id,
          planId: support.cache.planId!,
        },
      },
    });
    expect(execution).toMatchObject({
      proposalId: proposal.id,
      taskId: support.task.id,
      planHash: proposal.proposalHash,
      instructionHash: hashInstruction(proposal.instruction),
    });
    expect(runAgent.mock.calls[0]?.[1]).toBe(proposal.instruction);
    expect(runAgent.mock.calls[0]?.[2]).toEqual(proposal.canonicalActions);
  });

  // Gate C run 4's shape: the write committed and the approved draft was withheld
  // because a placeholder had no receipt value. The refund stands; the reply is
  // delivery, recorded on its own row.
  it("completes a v2 task whose write committed when its approved draft is withheld", async () => {
    const support = await seedSupportCardParkedOnTask(2);
    const runAgent = vi.fn(async (): Promise<AgentResult> => ({
      summary: "Refunded the order; the reply was not sent.",
      actionsPerformed: [
        { tool: "create_refund", result: "Refunded", status: "success" },
        {
          tool: "send_reply",
          result: "Error: skipped send_reply because its refund_amount placeholder has no value from a successful action receipt.",
          status: "error",
        },
      ],
    }));

    const executed = await executeCurrentCachedHomePlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      settings: support.settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approver: { clerkUserId: support.member.clerkUserId, displayName: null },
    }, makeDeps({ runAgent }));

    expect(executed.execution?.status).toBe("committed");
    expect(await db.planExecution.findUniqueOrThrow({
      where: { organizationId_planId: { organizationId: support.org.id, planId: support.cache.planId! } },
    })).toMatchObject({ status: "committed" });
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: support.task.id } }))
      .toMatchObject({ status: "completed", failureCode: null });
    expect(await db.agentProposal.findUniqueOrThrow({ where: { id: support.cache.planId! } }))
      .toMatchObject({ status: "completed" });
  });

  // Approval and communication contract: when an action fails or a binding is
  // unavailable, the success draft is not sent and a new proposal is composed.
  // The task is queued for that one attempt instead of ending untold.
  describe("a withheld approved message", () => {
    const approve = (
      support: Awaited<ReturnType<typeof seedSupportCardParkedOnTask>>,
      actionsPerformed: AgentResult["actionsPerformed"],
    ) => executeCurrentCachedHomePlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      settings: support.settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approver: { clerkUserId: support.member.clerkUserId, displayName: null },
    }, makeDeps({ runAgent: vi.fn(async () => ({ summary: "ran", actionsPerformed })) }));

    const executionFor = (support: Awaited<ReturnType<typeof seedSupportCardParkedOnTask>>) => (
      db.planExecution.findUniqueOrThrow({
        where: { organizationId_planId: { organizationId: support.org.id, planId: support.cache.planId! } },
      })
    );

    it("queues a follow-up when a placeholder had no receipt value", async () => {
      const support = await seedSupportCardParkedOnTask(2);
      await approve(support, [
        { tool: "add_shopify_customer_note", result: "Noted", status: "success" },
        { tool: "create_refund", result: "Refunded", status: "success" },
        {
          tool: "send_reply", result: "Error: skipped send_reply", status: "error",
          withheld: "placeholder_unfilled",
        },
      ]);

      const execution = await executionFor(support);
      expect(execution.status).toBe("committed");
      const task = await db.agentTask.findUniqueOrThrow({ where: { id: support.task.id } });
      expect(task).toMatchObject({
        status: "queued", revision: support.task.revision + 1,
        activeProposalId: null, failureCode: null, completedAt: null,
      });
      expect(withheldMessageFollowUp(task.checkpoint)).toEqual({
        executionId: execution.id, reason: "placeholder_unfilled",
      });
      // The refund committed, so its proposal is done whatever the message did.
      expect(await db.agentProposal.findUniqueOrThrow({ where: { id: support.cache.planId! } }))
        .toMatchObject({ status: "completed" });
      expect((await findQueuedAgentTasks()).map((queued) => queued.id)).toContain(task.id);

      const claimed = await claimWithheldMessageFollowUp({
        organizationId: support.org.id, taskId: task.id, expectedRevision: task.revision,
      });
      expect(claimed?.followUp).toEqual({ executionId: execution.id, reason: "placeholder_unfilled" });
      expect(await finishWithheldMessageFollowUp({
        organizationId: support.org.id, taskId: task.id, expectedRevision: task.revision,
        claimToken: claimed!.claimToken, outcome: "completed",
      })).toBe(true);
      expect(await db.agentTask.findUniqueOrThrow({ where: { id: task.id } }))
        .toMatchObject({ status: "completed", claimToken: null, failureCode: null });
    });

    it("queues a follow-up when an approved write failed and the message was never attempted", async () => {
      const support = await seedSupportCardParkedOnTask(2);
      await approve(support, [
        { tool: "add_shopify_customer_note", result: "Noted", status: "success" },
        { tool: "create_refund", result: "Error: refund declined", status: "error" },
      ]);

      const execution = await executionFor(support);
      expect(execution.status).toBe("failed");
      const task = await db.agentTask.findUniqueOrThrow({ where: { id: support.task.id } });
      expect(task.status).toBe("queued");
      expect(withheldMessageFollowUp(task.checkpoint)).toEqual({
        executionId: execution.id, reason: "approved_action_failed",
      });

      const claimed = await claimWithheldMessageFollowUp({
        organizationId: support.org.id, taskId: task.id, expectedRevision: task.revision,
      });
      expect(await finishWithheldMessageFollowUp({
        organizationId: support.org.id, taskId: task.id, expectedRevision: task.revision,
        claimToken: claimed!.claimToken, outcome: "failed",
      })).toBe(true);
      // Not `reconciling`: the note settled and the refund definitely failed.
      expect(await db.agentTask.findUniqueOrThrow({ where: { id: task.id } }))
        .toMatchObject({ status: "failed", failureCode: "approved_execution_failed" });
    });

    it("reconciles an unknown outcome instead of following it up", async () => {
      const support = await seedSupportCardParkedOnTask(2);
      await approve(support, [
        { tool: "create_refund", result: "Unknown: timed out", status: "unknown" },
      ]);

      const task = await db.agentTask.findUniqueOrThrow({ where: { id: support.task.id } });
      expect(task.status).toBe("reconciling");
      expect(withheldMessageFollowUp(task.checkpoint)).toBeNull();
    });

    it("does not claim a follow-up beside a write that has not settled", async () => {
      const support = await seedSupportCardParkedOnTask(2);
      await approve(support, [
        { tool: "create_refund", result: "Error: refund declined", status: "error" },
      ]);
      const task = await db.agentTask.findUniqueOrThrow({ where: { id: support.task.id } });
      await db.agentAction.create({ data: {
        organizationId: support.org.id, threadId: support.thread.id, taskId: task.id,
        turnId: support.request.id, tool: "add_shopify_customer_note", category: "action", input: {},
        status: "unknown", mode: "human_approved", dispatchState: "submitted",
        submittedAt: new Date(), operationId: randomUUID(), actionIndex: 0,
      } });

      expect(await claimWithheldMessageFollowUp({
        organizationId: support.org.id, taskId: task.id, expectedRevision: task.revision,
      })).toBeNull();
    });
  });

  it("refuses a historical v1 proposal without recording approval or dispatch", async () => {
    const support = await seedSupportCardParkedOnTask(2);
    // Seed historical evidence directly; new task acceptance refuses runtime 1.
    const historicalTask = await db.agentTask.create({ data: {
      organizationId: support.org.id, threadId: support.thread.id, objective: support.plan.instruction,
      initiatingActorKind: "customer", initiatingActorKey: `customer:${support.thread.customerId}`,
      runtimeVersion: 1, modelCallLimit: 20, activeTimeMsLimit: 120000, spendNanoUsdLimit: 1000000000n,
      checkpointVersion: 1, checkpoint: {},
    } });
    const original = await db.agentProposal.findUniqueOrThrow({ where: { id: support.cache.planId! } });
    const historicalProposal = await db.agentProposal.create({ data: {
      organizationId: support.org.id, taskId: historicalTask.id, taskRevision: 0,
      schemaVersion: original.schemaVersion, instruction: original.instruction,
      canonicalActions: original.canonicalActions as Prisma.InputJsonValue, proposalHash: original.proposalHash,
      dependencies: [],
      approverScopeKind: "member", approverScopeKey: ANY_MEMBER_ACTOR_KEY,
      sourceRequestIds: original.sourceRequestIds as Prisma.InputJsonValue,
    } });
    await db.thread.update({ where: { id: support.thread.id }, data: {
      cachedPlan: { ...support.cache, planId: historicalProposal.id } as unknown as Prisma.InputJsonValue,
    } });
    await expect(executeCurrentCachedHomePlan({
      orgId: support.org.id, threadId: support.thread.id, settings: support.settings,
      executionIntent: "merchant_approved", failureRoute: "test",
      approver: { clerkUserId: support.member.clerkUserId, displayName: null },
    }, unreachableDeps())).rejects.toBeInstanceOf(ConflictError);
    expect(await db.agentProposal.findUniqueOrThrow({ where: { id: historicalProposal.id } }))
      .toMatchObject({ status: "ready", approvedAt: null });
  });

  it("refuses approval of an escalation-only plan before executing", async () => {
    const { org, thread, settings } = await seedThreadWithPlan({ plan: escalationPlan() });
    await expect(executeCurrentCachedHomePlan({
      orgId: org.id, threadId: thread.id, settings,
      executionIntent: "merchant_approved", failureRoute: "test",
    }, makeDeps())).rejects.toBeInstanceOf(BadRequestError);
    expect(await readParkedProposalForThread({
      orgId: org.id, threadId: thread.id, settings, manualReview: true,
    })).toBeNull();
  });

  it("executes a handoff without approval even with store-write rollout disabled", async () => {
    const { org, thread, settings, execution } = await seedExecutablePlan({ automatic: true, plan: escalationPlan() });
    const executed = await maybeAutoExecuteCurrentCachedHomePlan({
      orgId: org.id, threadId: thread.id, settings,
      allowMutativeAutoExecute: false, failureRoute: "test",
      ...execution,
    }, makeDeps());
    expect(executed?.approvedToolCalls).toEqual(escalationPlan().rawToolCalls);
    expect(readAgentPlanCache((await db.thread.findUniqueOrThrow({ where: { id: thread.id } })).cachedPlan)).toBeNull();
  });

  it("runs the approved calls, records the approver, and consumes the cache", async () => {
    const { org, thread, settings, execution } = await seedExecutablePlan();
    const runAgent = vi.fn(async () => okResult);

    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      ...execution,
      approver: { ...execution.approver!, displayName: "Ada" },
    }, makeDeps({ runAgent }));

    expect(runAgent).toHaveBeenCalledOnce();
    expect(executed.approvedToolCalls.map((call) => call.id)).toEqual(["send_1"]);
    expect(executed.execution.status).toBe("committed");
    expect(executed.result).toEqual(okResult);

    // The cache is consumed so the same approval cannot be replayed.
    const after = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(after.cachedPlanMessageId).toBeNull();
  });

  // Package 5: the request ID is the turn ID because that is how settlement finds
  // the rows this execution wrote. Both halves are asserted, because a turn ID
  // that does not match the request links nothing and still looks correct.
  it("attributes approved execution to its proposal task and a distinct approved turn", async () => {
    const { org, thread, settings, task, request, execution } = await seedExecutablePlan();
    const runAgent = vi.fn(async () => okResult);
    await executeCurrentCachedHomePlan({
      orgId: org.id, threadId: thread.id, settings, executionIntent: "merchant_approved",
      failureRoute: "test", ...execution,
    }, makeDeps({ runAgent }));
    const turnId = runAgent.mock.calls[0]?.[4].turnId;
    expect(turnId).toEqual(expect.any(String));
    expect(turnId).not.toBe(request.id);
    expect(await db.message.findFirstOrThrow({ where: { threadId: thread.id, senderType: "note" } }))
      .toMatchObject({ agentRequestId: null, agentTaskId: task.id });
  });

  it("refuses a taskless plan before creating a turn or reaching the provider", async () => {
    const { org, thread, settings } = await seedThreadWithPlan();
    const runAgent = vi.fn(async () => okResult);
    await expect(executeCurrentCachedHomePlan({
      orgId: org.id, threadId: thread.id, settings, executionIntent: "merchant_approved", failureRoute: "test",
    }, makeDeps({ runAgent }))).rejects.toBeInstanceOf(ConflictError);
    expect(runAgent).not.toHaveBeenCalled();
    expect(await db.message.count({ where: { threadId: thread.id, senderType: "note" } })).toBe(0);
  });

  it("leaves a plan that drafted its own reply to send that reply", async () => {
    const { org, thread, settings, execution } = await seedExecutablePlan({ plan: mutativePlan() });
    const runAgent = vi.fn(async () => okResult);

    await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      ...execution,
    }, makeDeps({ runAgent }));

    expect(runAgent.mock.calls[0]?.[2]).toEqual([noteCall, sendReplyCall]);
  });

  it("refuses a second execution of the same plan", async () => {
    const { org, thread, settings, execution } = await seedExecutablePlan();
    const params = {
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      ...execution,
    };

    await executeCurrentCachedHomePlan(params, makeDeps());

    // The cache is gone, so the plan is no longer current — the approval cannot
    // be replayed even by a caller holding the original request.
    await expect(executeCurrentCachedHomePlan(params, unreachableDeps())).rejects.toThrow();
  });

  it("clears the cache even when the turn throws, so a failed plan is not replayable", async () => {
    const { org, thread, settings, execution } = await seedExecutablePlan();

    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      ...execution,
    }, makeDeps({
      runAgent: async () => {
        throw new Error("provider exploded mid-turn");
      },
    }))).rejects.toThrow(/provider exploded/);

    const after = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(after.cachedPlanMessageId).toBeNull();
  });

  it("reports a failed tool as a non-committed execution", async () => {
    const { org, thread, settings, execution } = await seedExecutablePlan();
    const failed: AgentResult = {
      summary: "Could not reply",
      actionsPerformed: [{ tool: "send_reply", result: "provider rejected", status: "error" }],
    };

    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      ...execution,
    }, makeDeps({ runAgent: async () => failed }));

    expect(executed.execution.status).not.toBe("committed");
  });

  it("refuses a durable approval when the execution ledger is switched off", async () => {
    vi.stubEnv("PLAN_EXECUTION_LEDGER_MODE", "off");
    const { org, thread, settings, execution, cache } = await seedExecutablePlan();
    await expect(executeCurrentCachedHomePlan({
      orgId: org.id, threadId: thread.id, settings, executionIntent: "merchant_approved",
      failureRoute: "test", ...execution,
    }, unreachableDeps())).rejects.toThrow("Durable proposals require the execution ledger");
    expect(await db.agentProposal.findUniqueOrThrow({ where: { id: cache.planId! } }))
      .toMatchObject({ status: "ready", approvedAt: null });
  });

});
