import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db, Prisma } from "@shopkeeper/db";
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from "@shopkeeper/db/test-helpers";
import { BadRequestError, ConflictError, ForbiddenError } from "./errors.js";
import { buildAgentPlanCacheRecord, commitThreadPlanCacheIfCurrent, readAgentPlanCache } from "./plan-cache.js";
import {
  executeCurrentCachedHomePlan,
  dismissCurrentCachedPlan,
  findFailedToolResult,
  formatApproverId,
  getExecutablePlanToolCalls,
  isAutoExecuteEnabled,
  maybeAutoExecuteCurrentCachedHomePlan,
  resolvePlanExecutionLedgerMode,
  supportAttemptSettlement,
  type PlanExecutionDeps,
  readParkedProposalForThread,
} from "./plan-execution.js";
import { resolveAgentSettings } from "./settings.js";
import { buildPlanSteps } from "./planner-steps.js";
import { hashInstruction, hashPlan } from "./agent-actions.js";
import { claimCurrentPlanExecution } from "./execution-ledger.js";
import {
  acceptCustomerAgentRequest, claimAgentTask, settleAgentTaskClaim,
} from "./task-ledger.js";
import { authorizeAgentProposal } from "./task-approval.js";
import { deriveProposalCommunication } from "./proposal-communication.js";
import type { AgentContext, AgentResult } from "./agent-context.js";
import type { AgentPlan, OrgSettings, RawToolCall } from "./types.js";

const orgIds: string[] = [];

afterEach(async () => {
  await Promise.all(orgIds.splice(0).map((orgId) => cleanupTestData(orgId)));
  vi.unstubAllEnvs();
});

const sendReplyCall: RawToolCall = {
  id: "send_1",
  name: "send_reply",
  input: { text: "Your order ships Monday." },
};

const noteCall: RawToolCall = {
  id: "note_1",
  name: "add_shopify_customer_note",
  input: { customer_id: "gid://shopify/Customer/1", note: "Asked about shipping" },
};

function quickReplyPlan(): AgentPlan {
  return {
    instruction: "When does my order ship?",
    steps: [{
      id: "send_1",
      tool: "send_reply",
      label: "Reply",
      description: "Answer the shipping question",
      category: "communication",
      enabled: true,
    }],
    rawToolCalls: [sendReplyCall],
    routingEvidence: { classifierState: "not_applicable", codes: [] },
    validation: { status: "valid", issues: [] },
  };
}

function mutativePlan(): AgentPlan {
  return {
    instruction: "Please note my preference",
    steps: [
      {
        id: "note_1",
        tool: "add_shopify_customer_note",
        label: "Add note",
        description: "Note the request on the customer",
        category: "action",
        enabled: true,
      },
      {
        id: "send_1",
        tool: "send_reply",
        label: "Reply",
        description: "Tell the customer",
        category: "communication",
        enabled: true,
      },
    ],
    rawToolCalls: [noteCall, sendReplyCall],
    routingEvidence: { classifierState: "not_applicable", codes: [] },
    validation: { status: "valid", issues: [] },
  };
}

const refundCall: RawToolCall = {
  id: "refund_1",
  name: "create_refund",
  input: { order_id: "gid://shopify/Order/1", amount: "10.00", currency: "USD" },
};

function threeStepPlan(): AgentPlan {
  return {
    instruction: "Note the request, issue the refund, and reply",
    // Derived as the planner derives them, so a card identity built from this
    // plan is the identity a real card carries.
    steps: buildPlanSteps([noteCall, refundCall, sendReplyCall]),
    rawToolCalls: [noteCall, refundCall, sendReplyCall],
    routingEvidence: { classifierState: "not_applicable", codes: [] },
    validation: { status: "valid", issues: [] },
  };
}

function escalationPlan(): AgentPlan {
  const escalation: RawToolCall = {
    id: "escalate_1",
    name: "escalate_to_human",
    input: { reason: "Needs merchant review." },
  };
  return {
    instruction: "Escalate this request",
    steps: [{
      id: escalation.id,
      tool: escalation.name,
      label: "Escalate",
      description: "Needs merchant review.",
      category: "internal",
      enabled: true,
    }],
    rawToolCalls: [escalation],
  };
}

const okResult: AgentResult = {
  summary: "Replied to the customer",
  actionsPerformed: [{ tool: "send_reply", result: "sent", status: "success" }],
};

function makeDeps(overrides: Partial<PlanExecutionDeps> = {}): PlanExecutionDeps {
  return {
    lock: { acquire: async () => ({ release: async () => undefined }) },
    buildContext: async (threadId, orgId) => ({
      orgId,
      orgName: "Test Shop",
      recentMessages: [],
      shopify: null,
      escalate: async () => undefined,
      thread: {
        id: threadId,
        status: "open",
        channelType: "email",
        tag: null,
        aiSummary: null,
        shopifyCustomerId: null,
      },
      customer: { id: "customer", name: null, platformId: "shopper@test.com" },
      openThreadCount: 1,
      recentOrders: [],
      linkedShopifyCustomerName: null,
      kbArticles: [],
    merchantPreferences: [],
    } satisfies AgentContext),
    runAgent: async () => okResult,
    ...overrides,
  };
}

// Deps that fail loudly if execution is reached. Every guard below is only
// meaningful if it refuses *before* a tool call can reach a provider, so the
// stubs assert that rather than quietly returning a result.
function unreachableDeps(): PlanExecutionDeps {
  return makeDeps({
    runAgent: async () => {
      throw new Error("runAgent must not be reached once a guard has refused the plan");
    },
  });
}

async function seedThreadWithPlan(options: {
  plan?: AgentPlan;
  settings?: OrgSettings;
  filterStatus?: string;
  /** Plan as runtime v2 does: the communication snapshot derived from its calls. */
  exactDraft?: boolean;
} = {}) {
  const authored = options.plan ?? quickReplyPlan();
  const settings = options.settings ?? resolveAgentSettings(null);
  const org = await createTestOrg();
  orgIds.push(org.id);
  const customer = await createTestCustomer(org.id, `${randomUUID()}@test.com`);
  const thread = await createTestThread(org.id, customer.id, "email");
  const communication = options.exactDraft
    ? deriveProposalCommunication(authored.rawToolCalls, thread)
    : null;
  const plan: AgentPlan = communication ? { ...authored, communication } : authored;
  const message = await createTestMessage(thread.id, plan.instruction);

  if (options.filterStatus) {
    await db.thread.update({
      where: { id: thread.id },
      data: { filterStatus: options.filterStatus },
    });
  }

  const cache = buildAgentPlanCacheRecord({
    instruction: plan.instruction,
    lastCustomerMessageId: message.id,
    settings,
    plan,
  });
  const committed = await commitThreadPlanCacheIfCurrent({
    orgId: org.id,
    threadId: thread.id,
    sourceMessageId: message.id,
    cache,
  });
  expect(committed).toBe(true);

  return { org, thread, message, plan, settings, cache };
}

// A support conversation whose parked card is also a durable proposal: the
// planning job accepts the customer's message, runs an attempt, and settles on
// whatever `supportAttemptSettlement` reads back out of the cached plan.
async function seedSupportCardParkedOnTask(runtimeVersion = 1, authored: AgentPlan = threeStepPlan()) {
  const settings = resolveAgentSettings({ autonomyTier: "guarded", maxRefundAmount: 100 });
  const seeded = await seedThreadWithPlan({ plan: authored, settings, exactDraft: runtimeVersion >= 2 });
  const plan = seeded.plan;
  const member = await db.orgMember.create({
    data: { organizationId: seeded.org.id, clerkUserId: randomUUID() },
  });
  const { request, task } = await acceptCustomerAgentRequest({
    organizationId: seeded.org.id, threadId: seeded.thread.id, sourceMessageId: seeded.message.id,
    objective: plan.instruction,
    budget: {
      runtimeVersion, modelCallLimit: 20,
      activeTimeMsLimit: 120000, spendNanoUsdLimit: 1000000000n,
    },
  });
  const claim = await claimAgentTask({
    organizationId: seeded.org.id, taskId: task.id, expectedRevision: task.revision,
  });
  const settlement = await supportAttemptSettlement({
    orgId: seeded.org.id, threadId: seeded.thread.id, settings,
    merchantQuestion: null, sourceRequestIds: [request.id],
  });
  expect(settlement.status).toBe("waiting_approval");
  expect(await settleAgentTaskClaim({
    organizationId: seeded.org.id, taskId: task.id, expectedRevision: task.revision,
    claimToken: claim!.claimToken, requestId: request.id, settlement,
  })).toBe(true);
  expect((await db.agentTask.findUniqueOrThrow({ where: { id: task.id } })).activeProposalId)
    .toBe(seeded.cache.planId);
  return { ...seeded, member, task, request };
}

describe("plan execution helpers", () => {
  it("records a delivered customer question as a wait on that customer", async () => {
    const { org, thread, message, settings } = await seedThreadWithPlan();
    const settlement = await supportAttemptSettlement({
      orgId: org.id,
      threadId: thread.id,
      settings,
      merchantQuestion: null,
      customerQuestion: "What is the full postal code?",
      sourceRequestIds: [message.id],
    });

    expect(settlement).toEqual({
      status: "waiting_input",
      question: "What is the full postal code?",
      answerer: { kind: "customer", key: `customer:${thread.customerId}` },
    });
  });

  it("dismisses only the exact cached plan identity", async () => {
    const { org, thread, cache } = await seedThreadWithPlan();

    await expect(dismissCurrentCachedPlan({
      orgId: org.id,
      threadId: thread.id,
      expectedPlanId: "stale-plan-id",
      clerkUserId: "user_dismisser",
    })).resolves.toBe(false);
    expect((await db.thread.findUnique({ where: { id: thread.id } }))?.cachedPlan).not.toBeNull();

    await expect(dismissCurrentCachedPlan({
      orgId: org.id,
      threadId: thread.id,
      expectedPlanId: cache.planId!,
      clerkUserId: "user_dismisser",
    })).resolves.toBe(true);
    const dismissed = await db.thread.findUnique({ where: { id: thread.id } });
    expect(dismissed?.cachedPlan).toBeNull();
    expect(dismissed?.cachedPlanMessageId).toBeNull();
  });

  it("refuses dismissal after execution has claimed the plan", async () => {
    const { org, thread, message, cache } = await seedThreadWithPlan();
    const claim = await claimCurrentPlanExecution({
      orgId: org.id,
      planId: cache.planId!,
      threadId: thread.id,
      sourceMessageId: message.id,
      planHash: hashPlan(cache.plan),
      instructionHash: hashInstruction(cache.instruction),
      mode: "human_approved",
    });
    expect(claim.claimed).toBe(true);

    await expect(dismissCurrentCachedPlan({
      orgId: org.id,
      threadId: thread.id,
      expectedPlanId: cache.planId!,
      clerkUserId: "user_dismisser",
    })).rejects.toBeInstanceOf(ConflictError);
    expect((await db.thread.findUnique({ where: { id: thread.id } }))?.cachedPlan).not.toBeNull();
  });

  // A dismissal ends the same wait an approval ends, so it has to leave the
  // durable proposal and the cached card saying the same thing. They used to
  // disagree: the card was destroyed and the task stayed `waiting_approval` on a
  // proposal the merchant had already declined, with nothing sweeping it.
  it("ends the durable approval wait when the parked card is dismissed", async () => {
    const support = await seedSupportCardParkedOnTask();

    await expect(dismissCurrentCachedPlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      expectedPlanId: support.cache.planId!,
      clerkUserId: support.member.clerkUserId,
    })).resolves.toBe(true);

    expect((await db.thread.findUnique({ where: { id: support.thread.id } }))?.cachedPlan).toBeNull();
    expect((await db.agentProposal.findUniqueOrThrow({ where: { id: support.cache.planId! } })).status)
      .toBe("rejected");
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: support.task.id } }))
      .toMatchObject({ status: "cancelled", activeProposalId: null });
  });

  it("leaves the draft parked when the proposal refuses the member dismissing it", async () => {
    const support = await seedSupportCardParkedOnTask();
    const otherOrg = await createTestOrg();
    orgIds.push(otherOrg.id);
    const outsider = await db.orgMember.create({
      data: { organizationId: otherOrg.id, clerkUserId: randomUUID() },
    });

    await expect(dismissCurrentCachedPlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      expectedPlanId: support.cache.planId!,
      clerkUserId: outsider.clerkUserId,
    })).rejects.toBeInstanceOf(ForbiddenError);

    // Refused before the draft was destroyed, which is why the two records move
    // in one transaction rather than one after the other.
    expect((await db.thread.findUnique({ where: { id: support.thread.id } }))?.cachedPlan).not.toBeNull();
    expect((await db.agentProposal.findUniqueOrThrow({ where: { id: support.cache.planId! } })).status)
      .toBe("ready");
  });

  it("refuses to dismiss a card whose approval was already recorded", async () => {
    const support = await seedSupportCardParkedOnTask();
    expect(await authorizeAgentProposal({
      organizationId: support.org.id,
      clerkUserId: support.member.clerkUserId,
      proposalId: support.cache.planId!,
      instruction: support.plan.instruction,
      approvedToolCalls: support.plan.rawToolCalls,
    })).not.toBeNull();

    // No execution row exists yet, so the ledger's own status is the only thing
    // that stops a second device's "no" from clearing a plan about to run.
    await expect(dismissCurrentCachedPlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      expectedPlanId: support.cache.planId!,
      clerkUserId: support.member.clerkUserId,
    })).rejects.toBeInstanceOf(ConflictError);
    expect((await db.thread.findUnique({ where: { id: support.thread.id } }))?.cachedPlan).not.toBeNull();
  });

  it("formats an approver with and without a display name", () => {
    expect(formatApproverId({ clerkUserId: "user_1", displayName: "Ada" })).toBe("user_1:Ada");
    expect(formatApproverId({ clerkUserId: "user_1", displayName: null })).toBe("user_1");
  });

  it("defaults the ledger to enforce and honours only the documented downgrade", () => {
    expect(resolvePlanExecutionLedgerMode("off")).toBe("off");
    expect(resolvePlanExecutionLedgerMode("enforce")).toBe("enforce");
    expect(resolvePlanExecutionLedgerMode(undefined)).toBe("enforce");
    // Legacy rollout values and typos must not disable the durable claim.
    expect(resolvePlanExecutionLedgerMode("shadow")).toBe("enforce");
    expect(resolvePlanExecutionLedgerMode("Off")).toBe("enforce");
    expect(resolvePlanExecutionLedgerMode("disabled")).toBe("enforce");
  });

  it("treats only live auto-execute as enabled", () => {
    expect(isAutoExecuteEnabled(resolveAgentSettings({ autoExecuteMode: "live" }))).toBe(true);
    expect(isAutoExecuteEnabled(resolveAgentSettings({ autoExecuteMode: "off" }))).toBe(false);
  });

  it("keeps only executable tool calls, dropping reads", () => {
    const plan = mutativePlan();
    plan.rawToolCalls.push({ id: "read_1", name: "get_order_by_name", input: { name: "#1024" } });

    expect(getExecutablePlanToolCalls(plan).map((call) => call.id)).toEqual(["note_1", "send_1"]);
  });

  it("finds the first non-success action and nothing when all succeeded", () => {
    expect(findFailedToolResult(okResult)).toBeNull();

    for (const status of ["error", "policy_block", "unknown"] as const) {
      const result: AgentResult = {
        summary: "s",
        actionsPerformed: [
          { tool: "get_order_by_name", result: "ok", status: "success" },
          { tool: "refund_order", result: "provider rejected", status },
        ],
      };
      expect(findFailedToolResult(result)).toEqual({
        tool: "refund_order",
        result: "provider rejected",
        status,
      });
    }
  });
});

describe("readParkedProposalForThread", () => {
  // The snapshot has to hash equal to what the approval surfaces actually send,
  // and every one of them sends the calls the card renders — reads included.
  // Recording the autonomy verdict's executable subset instead made the two
  // hashes permanently different, so a support approval could only ever conflict.
  it("snapshots the bundle the approval surfaces send, not the executable subset", async () => {
    const plan = threeStepPlan();
    const read: RawToolCall = { id: "read_1", name: "get_order_by_name", input: { order_name: "#1024" } };
    plan.rawToolCalls = [read, ...plan.rawToolCalls];
    const { org, thread, settings } = await seedThreadWithPlan({
      plan,
      settings: resolveAgentSettings({ autonomyTier: "guarded", maxRefundAmount: 100 }),
    });

    const snapshot = await readParkedProposalForThread({
      orgId: org.id, threadId: thread.id, settings,
    });
    expect(snapshot?.rawToolCalls.map((call) => call.name)).toEqual(
      plan.rawToolCalls.map((call) => call.name),
    );
    // The invariant the surfaces depend on, stated as they state it.
    expect(hashPlan({ instruction: plan.instruction, steps: [], rawToolCalls: snapshot!.rawToolCalls }))
      .toBe(hashPlan({ instruction: plan.instruction, steps: [], rawToolCalls: plan.rawToolCalls }));
  });
});

describe("executeCurrentCachedHomePlan guards", () => {
  it("refuses an invalid plan before any human or automatic execution path", async () => {
    const { org, thread, settings } = await seedThreadWithPlan({
      plan: {
        ...quickReplyPlan(),
        validation: {
          status: "invalid",
          issues: [{
            code: "ungrounded_customer_reply",
            message: "The reply claims work the plan does not perform.",
            toolCallId: "send_1",
            tool: "send_reply",
          }],
        },
      },
    });

    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
    }, unreachableDeps())).rejects.toThrow(/invalid and cannot be approved/);

    await expect(maybeAutoExecuteCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      failureRoute: "test",
    }, unreachableDeps())).resolves.toBeNull();
  });

  it("refuses a plan whose kind the route does not allow", async () => {
    const { org, thread, settings } = await seedThreadWithPlan({
      plan: {
        ...quickReplyPlan(),
        signals: [{ code: "order_not_found", severity: "blocking", message: "missing" }],
      },
    });

    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "automatic",
      failureRoute: "test",
    }, unreachableDeps())).rejects.toBeInstanceOf(BadRequestError);
  });

  it("refuses to send for a sender still awaiting review", async () => {
    const { org, thread, settings } = await seedThreadWithPlan({ filterStatus: "questionable" });

    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "automatic",
      failureRoute: "test",
    }, unreachableDeps())).rejects.toThrow(/Review the sender/);
  });

  it("refuses a plan that is no longer the one the approver reviewed", async () => {
    const { org, thread, settings } = await seedThreadWithPlan();

    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      expectedIdentity: { planHash: "a-hash-from-some-older-plan" },
    }, unreachableDeps())).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses duplicate approved steps", async () => {
    const { org, thread, settings } = await seedThreadWithPlan();

    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approvedToolCalls: [sendReplyCall, sendReplyCall],
    }, unreachableDeps())).rejects.toThrow(/duplicate plan steps/);
  });

  it("refuses an approved step whose input was edited after planning", async () => {
    const { org, thread, settings } = await seedThreadWithPlan();

    // Same id and tool, different body — the case the hash guard exists for.
    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approvedToolCalls: [{ ...sendReplyCall, input: { text: "Refund issued, sorry!" } }],
    }, unreachableDeps())).rejects.toThrow(/must come from the current reviewed plan/);
  });

  it("refuses an empty approval rather than running an empty turn", async () => {
    const { org, thread, settings } = await seedThreadWithPlan();

    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approvedToolCalls: [],
    }, unreachableDeps())).rejects.toThrow(/no executable tool calls/);
  });

  it("refuses a read-only subset rather than consuming the reviewed plan", async () => {
    const withRead = quickReplyPlan();
    const read: RawToolCall = { id: "read_1", name: "get_order_by_name", input: { name: "#1024" } };
    withRead.rawToolCalls.unshift(read);
    const { org, thread, settings } = await seedThreadWithPlan({ plan: withRead });

    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approvedToolCalls: [read],
    }, unreachableDeps())).rejects.toThrow(/no executable tool calls/);
  });

  it("requires a revised plan when partial approval keeps the customer send", async () => {
    const { org, thread, settings } = await seedThreadWithPlan({ plan: mutativePlan() });

    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approvedToolCalls: [sendReplyCall],
    }, unreachableDeps())).rejects.toThrow(/revised customer reply/);
  });

  it("refuses merchant approval when any executable tool is statically disabled", async () => {
    const settings = resolveAgentSettings({
      toolsEnabled: { action: true, communication: false, internal: true, read: true },
    });
    const { org, thread } = await seedThreadWithPlan({ settings });
    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
    }, unreachableDeps())).rejects.toThrow(/not executable/);
  });
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

  it("keeps a v1 durable approval pinned to cached-plan interpretation", async () => {
    const support = await seedSupportCardParkedOnTask(1);

    await executeCurrentCachedHomePlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      settings: support.settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approver: { clerkUserId: support.member.clerkUserId, displayName: null },
    }, makeDeps());

    const execution = await db.planExecution.findUniqueOrThrow({
      where: {
        organizationId_planId: {
          organizationId: support.org.id,
          planId: support.cache.planId!,
        },
      },
    });
    expect(execution.planHash).toBe(hashPlan(support.plan));
  });

  it("executes an escalation only after explicit merchant approval", async () => {
    const { org, thread, settings } = await seedThreadWithPlan({ plan: escalationPlan() });
    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
    }, makeDeps());
    expect(executed.approvedToolCalls).toEqual(escalationPlan().rawToolCalls);
  });

  it("runs the approved calls, records the approver, and consumes the cache", async () => {
    const { org, thread, settings } = await seedThreadWithPlan();
    const runAgent = vi.fn(async () => okResult);

    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approver: { clerkUserId: "user_1", displayName: "Ada" },
    }, makeDeps({ runAgent }));

    expect(runAgent).toHaveBeenCalledOnce();
    expect(executed.approvedToolCalls.map((call) => call.id)).toEqual(["send_1"]);
    expect(executed.execution.status).toBe("committed");
    expect(executed.result).toEqual(okResult);

    // The cache is consumed so the same approval cannot be replayed.
    const after = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(after.cachedPlanMessageId).toBeNull();
  });

  it("carries successful planning-read facts into approved reply execution", async () => {
    const base = quickReplyPlan();
    const read = { id: "read_1", name: "get_order_by_name", input: { order_name: "#1001" } };
    const plan: AgentPlan = {
      ...base,
      rawToolCalls: [read, ...base.rawToolCalls],
      readResults: {
        read_1: JSON.stringify({
          id: "123",
          name: "#1001",
          financial_status: "refunded",
          fulfillment_status: null,
          total_price: "20.00",
          currency: "USD",
        }),
      },
    };
    const { org, thread, settings } = await seedThreadWithPlan({ plan });
    const runAgent = vi.fn(async () => okResult);

    await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
    }, makeDeps({ runAgent }));

    expect(runAgent.mock.calls[0]?.[4].completionEvidence).toEqual([
      expect.objectContaining({
        action: "refund",
        outcome: "success",
        executionReference: "read:read_1",
      }),
    ]);
  });

  // Package 5: the request ID is the turn ID because that is how settlement finds
  // the rows this execution wrote. Both halves are asserted, because a turn ID
  // that does not match the request links nothing and still looks correct.
  it("runs an approved plan as the turn of the request that authorized it", async () => {
    const { org, thread, message, settings } = await seedThreadWithPlan();
    const runAgent = vi.fn(async () => okResult);
    const { request, task } = await acceptCustomerAgentRequest({
      organizationId: org.id, threadId: thread.id, sourceMessageId: message.id,
      objective: "Answer the shipping question",
      budget: {
        runtimeVersion: 1, modelCallLimit: 20,
        activeTimeMsLimit: 120000, spendNanoUsdLimit: 1000000000n,
      },
    });
    const durableTurn = { requestId: request.id, taskId: task.id };

    await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      durableTurn,
    }, makeDeps({ runAgent }));

    expect(runAgent.mock.calls[0]?.[4].turnId).toBe(durableTurn.requestId);
    const note = await db.message.findFirstOrThrow({
      where: { threadId: thread.id, senderType: "note" },
    });
    expect(note).toMatchObject({
      agentRequestId: durableTurn.requestId,
      agentTaskId: durableTurn.taskId,
    });
  });

  it("generates its own turn identity when the caller has no durable task", async () => {
    const { org, thread, settings } = await seedThreadWithPlan();
    const runAgent = vi.fn(async () => okResult);

    await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
    }, makeDeps({ runAgent }));

    expect(runAgent.mock.calls[0]?.[4].turnId).toEqual(expect.any(String));
    expect(await db.message.findFirstOrThrow({
      where: { threadId: thread.id, senderType: "note" },
    })).toMatchObject({ agentRequestId: null, agentTaskId: null });
  });

  it("leaves a plan that drafted its own reply to send that reply", async () => {
    const { org, thread, settings } = await seedThreadWithPlan({ plan: mutativePlan() });
    const runAgent = vi.fn(async () => okResult);

    await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
    }, makeDeps({ runAgent }));

    expect(runAgent.mock.calls[0]?.[2]).toEqual([noteCall, sendReplyCall]);
  });

  it("refuses a second execution of the same plan", async () => {
    const { org, thread, settings } = await seedThreadWithPlan();
    const params = {
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
    };

    await executeCurrentCachedHomePlan(params, makeDeps());

    // The cache is gone, so the plan is no longer current — the approval cannot
    // be replayed even by a caller holding the original request.
    await expect(executeCurrentCachedHomePlan(params, unreachableDeps())).rejects.toThrow();
  });

  it("clears the cache even when the turn throws, so a failed plan is not replayable", async () => {
    const { org, thread, settings } = await seedThreadWithPlan();

    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
    }, makeDeps({
      runAgent: async () => {
        throw new Error("provider exploded mid-turn");
      },
    }))).rejects.toThrow(/provider exploded/);

    const after = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(after.cachedPlanMessageId).toBeNull();
  });

  it("reports a failed tool as a non-committed execution", async () => {
    const { org, thread, settings } = await seedThreadWithPlan();
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
    }, makeDeps({ runAgent: async () => failed }));

    expect(executed.execution.status).not.toBe("committed");
  });

  it("runs without a durable claim when the ledger is switched off", async () => {
    vi.stubEnv("PLAN_EXECUTION_LEDGER_MODE", "off");
    const { org, thread, settings } = await seedThreadWithPlan();

    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
    }, makeDeps());

    expect(executed.execution.id).toBeNull();
    expect(executed.result).toEqual(okResult);
  });
});

// Overhaul plan, Next work item 3 (decision A): a v2 proposal that messages the
// customer binds that exact message and where it goes into the approval.
describe("exact-draft proposals", () => {
  const cardIdentity = (support: Awaited<ReturnType<typeof seedSupportCardParkedOnTask>>, plan: AgentPlan) => ({
    planId: support.cache.planId!,
    sourceMessageId: support.message.id,
    planHash: hashPlan(plan),
    instructionHash: hashInstruction(plan.instruction),
  });

  it("persists the exact draft and its destination as part of the proposal's identity", async () => {
    const support = await seedSupportCardParkedOnTask(2);
    const proposal = await db.agentProposal.findUniqueOrThrow({ where: { id: support.cache.planId! } });

    expect(proposal).toMatchObject({
      communicationMode: "exact_draft",
      communicationDestination: { kind: "thread", id: support.thread.id, channel: "email" },
      approvedDraft: "Your order ships Monday.",
      allowedResultBindings: [],
    });
    expect(proposal.proposalHash).toBe(hashPlan(support.plan));
    expect(proposal.proposalHash).not.toBe(hashPlan({ ...support.plan, communication: undefined }));
  });

  it("refuses a card whose draft is not the one the proposal binds", async () => {
    const support = await seedSupportCardParkedOnTask(2);
    const runAgent = vi.fn(async () => okResult);
    const edited: AgentPlan = {
      ...support.plan,
      communication: { ...support.plan.communication!, draft: "Your order ships Tuesday." } as AgentPlan["communication"],
    };

    await expect(executeCurrentCachedHomePlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      settings: support.settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approver: { clerkUserId: support.member.clerkUserId, displayName: null },
      expectedIdentity: cardIdentity(support, edited),
    }, makeDeps({ runAgent }))).rejects.toBeInstanceOf(ConflictError);
    expect(runAgent).not.toHaveBeenCalled();
    expect(await db.agentProposal.findUniqueOrThrow({ where: { id: support.cache.planId! } }))
      .toMatchObject({ status: "ready", approverKey: null });
  });

  it("refuses a card whose destination is not the one the proposal binds", async () => {
    const support = await seedSupportCardParkedOnTask(2);
    const runAgent = vi.fn(async () => okResult);
    const exact = support.plan.communication as Extract<AgentPlan["communication"], { mode: "exact_draft" }>;
    const redirected: AgentPlan = {
      ...support.plan,
      communication: { ...exact, destination: { kind: "thread", id: randomUUID(), channel: "email" } },
    };

    await expect(executeCurrentCachedHomePlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      settings: support.settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approver: { clerkUserId: support.member.clerkUserId, displayName: null },
      expectedIdentity: cardIdentity(support, redirected),
    }, makeDeps({ runAgent }))).rejects.toBeInstanceOf(ConflictError);
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("refuses an approval that drops the approved reply and keeps the writes", async () => {
    const support = await seedSupportCardParkedOnTask(2);
    const runAgent = vi.fn(async () => okResult);

    await expect(executeCurrentCachedHomePlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      settings: support.settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approver: { clerkUserId: support.member.clerkUserId, displayName: null },
      approvedToolCalls: [noteCall, refundCall],
    }, makeDeps({ runAgent }))).rejects.toBeInstanceOf(ConflictError);
    expect(runAgent).not.toHaveBeenCalled();
    expect(await db.planExecution.count({ where: { organizationId: support.org.id } })).toBe(0);
  });

  it("binds a receipt placeholder into the proposal and hands the executor that exact snapshot", async () => {
    const reply: RawToolCall = { ...sendReplyCall, input: { text: "We refunded {{refund_amount}}." } };
    const authored: AgentPlan = {
      instruction: "Issue the refund and tell the customer",
      steps: buildPlanSteps([refundCall, reply]),
      rawToolCalls: [refundCall, reply],
      routingEvidence: { classifierState: "not_applicable", codes: [] },
      validation: { status: "valid", issues: [] },
    };
    const support = await seedSupportCardParkedOnTask(2, authored);
    const binding = { placeholder: "refund_amount", toolCallId: "refund_1", tool: "create_refund", field: "facts.amount" };
    expect(await db.agentProposal.findUniqueOrThrow({ where: { id: support.cache.planId! } }))
      .toMatchObject({ approvedDraft: "We refunded {{refund_amount}}.", allowedResultBindings: [binding] });
    const runAgent = vi.fn(async () => okResult);

    await executeCurrentCachedHomePlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      settings: support.settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approver: { clerkUserId: support.member.clerkUserId, displayName: null },
      expectedIdentity: cardIdentity(support, support.plan),
    }, makeDeps({ runAgent }));

    expect(runAgent.mock.calls[0]?.[4].approvedCommunication).toEqual(support.plan.communication);
    expect(runAgent.mock.calls[0]?.[4].approvedCommunication).toMatchObject({ allowedResultBindings: [binding] });
  });

  it("gives a legacy plan's reply no approved snapshot, so it keeps the legacy grounding", async () => {
    const { org, thread, settings } = await seedThreadWithPlan({ plan: mutativePlan() });
    const runAgent = vi.fn(async () => okResult);

    await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
    }, makeDeps({ runAgent }));

    expect(runAgent.mock.calls[0]?.[4].approvedCommunication).toBeUndefined();
  });

  it("sends nothing on a proposal that authorizes no message", async () => {
    const writesOnly: AgentPlan = {
      instruction: "Note the request and issue the refund",
      steps: buildPlanSteps([noteCall, refundCall]),
      rawToolCalls: [noteCall, refundCall],
      routingEvidence: { classifierState: "not_applicable", codes: [] },
      validation: { status: "valid", issues: [] },
    };
    const support = await seedSupportCardParkedOnTask(2, writesOnly);
    const runAgent = vi.fn(async () => okResult);
    expect(support.plan.communication).toEqual({ mode: "none" });
    expect(await db.agentProposal.findUniqueOrThrow({ where: { id: support.cache.planId! } }))
      .toMatchObject({ communicationMode: null, approvedDraft: null });

    await executeCurrentCachedHomePlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      settings: support.settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approver: { clerkUserId: support.member.clerkUserId, displayName: null },
      expectedIdentity: cardIdentity(support, support.plan),
    }, makeDeps({ runAgent }));

    expect(runAgent.mock.calls[0]?.[2]).toEqual([noteCall, refundCall]);
  });

  it("refuses a plan that authorizes no message but carries one", async () => {
    const { org, thread, settings } = await seedThreadWithPlan({
      plan: { ...mutativePlan(), communication: { mode: "none" } },
    });

    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
    }, unreachableDeps())).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("maybeAutoExecuteCurrentCachedHomePlan", () => {
  it("does nothing when the thread has no cached plan", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, `${randomUUID()}@test.com`);
    const thread = await createTestThread(org.id, customer.id, "email");

    const result = await maybeAutoExecuteCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings: resolveAgentSettings(null),
      failureRoute: "test",
    }, unreachableDeps());

    expect(result).toBeNull();
  });

  it("skips a sender the filter is still holding", async () => {
    const { org, thread, settings } = await seedThreadWithPlan({ filterStatus: "questionable" });

    const result = await maybeAutoExecuteCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      failureRoute: "test",
    }, unreachableDeps());

    expect(result).toBeNull();
  });

  it("sends a clean quick reply without consuming merchant attention", async () => {
    const { org, thread, settings } = await seedThreadWithPlan();
    const runAgent = vi.fn(async () => okResult);

    const result = await maybeAutoExecuteCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      failureRoute: "test",
    }, makeDeps({ runAgent }));

    expect(runAgent).toHaveBeenCalledOnce();
    expect(result?.approvedToolCalls.map((call) => call.id)).toEqual(["send_1"]);
  });

  it("sends a quick reply even when mutative auto-execution is switched off", async () => {
    // Turning on clarifying replies must not be coupled to turning on refunds,
    // and the reverse must hold too.
    const { org, thread, settings } = await seedThreadWithPlan();

    const result = await maybeAutoExecuteCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      failureRoute: "test",
      allowMutativeAutoExecute: false,
    }, makeDeps());

    expect(result).not.toBeNull();
  });

  it("leaves a needs_review plan for the merchant", async () => {
    // A mutative plan under the default tier classifies as needs_review.
    const settings = resolveAgentSettings(null);
    const { org, thread } = await seedThreadWithPlan({ plan: mutativePlan(), settings });

    const result = await maybeAutoExecuteCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      failureRoute: "test",
    }, unreachableDeps());

    expect(result).toBeNull();
  });

  it("holds an auto-executable plan when the mutative gate is closed", async () => {
    const settings = resolveAgentSettings({ autonomyTier: "trusted", autoExecuteMode: "live" });
    const { org, thread } = await seedThreadWithPlan({ plan: mutativePlan(), settings });

    const result = await maybeAutoExecuteCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      failureRoute: "test",
      allowMutativeAutoExecute: false,
    }, unreachableDeps());

    expect(result).toBeNull();
  });

  it("holds an auto-executable plan when auto-execute is off", async () => {
    const settings = resolveAgentSettings({ autonomyTier: "trusted", autoExecuteMode: "off" });
    const { org, thread } = await seedThreadWithPlan({ plan: mutativePlan(), settings });

    const result = await maybeAutoExecuteCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      failureRoute: "test",
    }, unreachableDeps());

    expect(result).toBeNull();
  });

  it("executes a mutative plan only when the tier and the gate both allow it", async () => {
    const settings = resolveAgentSettings({ autonomyTier: "trusted", autoExecuteMode: "live" });
    const { org, thread } = await seedThreadWithPlan({ plan: mutativePlan(), settings });
    const runAgent = vi.fn(async () => okResult);

    const result = await maybeAutoExecuteCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      failureRoute: "test",
      allowMutativeAutoExecute: true,
    }, makeDeps({ runAgent }));

    expect(runAgent).toHaveBeenCalledOnce();
    expect(result?.approvedToolCalls.map((call) => call.id)).toEqual(["note_1", "send_1"]);
  });
});

describe("bounded failure replan", () => {
  it("replans once after a definite partial failure and completes remaining work", async () => {
    const settings = resolveAgentSettings({ autonomyTier: "trusted", autoExecuteMode: "live" });
    const { org, thread } = await seedThreadWithPlan({ plan: threeStepPlan(), settings });
    const partialResult: AgentResult = {
      summary: "Refund failed",
      actionsPerformed: [
        { tool: "add_shopify_customer_note", result: "Noted", status: "success" },
        { tool: "create_refund", result: "Rejected", status: "error" },
      ],
    };
    const runAgent = vi.fn()
      .mockResolvedValueOnce(partialResult)
      .mockResolvedValueOnce(okResult);
    const mockPlanAgent = vi.fn(async () => quickReplyPlan());

    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "automatic",
      failureRoute: "test",
      allowMutativeAutoExecute: true,
    }, makeDeps({ runAgent, planAgent: mockPlanAgent }));

    expect(runAgent).toHaveBeenCalledTimes(2);
    expect(mockPlanAgent).toHaveBeenCalledOnce();
    expect(mockPlanAgent.mock.calls[0]?.[1]).toContain("A previously approved plan partially failed during execution.");
    expect(executed.execution.status).toBe("committed");
    expect(executed.failureReplanRecovery).toMatchObject({
      context: expect.objectContaining({
        failureTool: "create_refund",
        failureReason: "Rejected",
      }),
    });
    expect(executed.result.actionsPerformed.at(-1)).toMatchObject({ tool: "send_reply", status: "success" });

    const threadAfter = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(threadAfter.cachedPlan).toBeNull();
  });

  it("keeps bounded failure-replan execution attributed to the durable task", async () => {
    const settings = resolveAgentSettings({ autonomyTier: "trusted", autoExecuteMode: "live" });
    const { org, thread, message } = await seedThreadWithPlan({ plan: threeStepPlan(), settings });
    const partialResult: AgentResult = {
      summary: "Refund failed",
      actionsPerformed: [
        { tool: "add_shopify_customer_note", result: "Noted", status: "success" },
        { tool: "create_refund", result: "Rejected", status: "error" },
      ],
    };
    const runAgent = vi.fn()
      .mockResolvedValueOnce(partialResult)
      .mockResolvedValueOnce(okResult);
    const { request, task } = await acceptCustomerAgentRequest({
      organizationId: org.id,
      threadId: thread.id,
      sourceMessageId: message.id,
      objective: "Resolve the request",
      budget: {
        runtimeVersion: 2,
        modelCallLimit: 20,
        activeTimeMsLimit: 120000,
        spendNanoUsdLimit: 1000000000n,
      },
    });
    const durableTurn = { requestId: request.id, taskId: task.id, runtimeVersion: 2 };

    await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "automatic",
      failureRoute: "test",
      allowMutativeAutoExecute: true,
      durableTurn,
    }, makeDeps({ runAgent, planAgent: vi.fn(async () => quickReplyPlan()) }));

    expect(runAgent).toHaveBeenCalledTimes(2);
    expect(runAgent.mock.calls[1]?.[4]).toMatchObject({
      turnId: durableTurn.requestId,
    });
    expect(runAgent.mock.calls[1]?.[0]).toMatchObject({
      agentRequestId: durableTurn.requestId,
      agentTaskId: durableTurn.taskId,
    });
  });

  // The dashboard ticket card posts the reviewed tool calls back to /api/agent.
  // The child shares none of them, so the parent's approval envelope must not
  // travel into the child execution.
  it("recovers when the approver posted an explicit approved tool-call set", async () => {
    const settings = resolveAgentSettings({ autonomyTier: "trusted", autoExecuteMode: "live" });
    const plan = threeStepPlan();
    const { org, thread } = await seedThreadWithPlan({ plan, settings });
    const partialResult: AgentResult = {
      summary: "Refund failed",
      actionsPerformed: [
        { tool: "add_shopify_customer_note", result: "Noted", status: "success" },
        { tool: "create_refund", result: "Rejected", status: "error" },
      ],
    };
    const runAgent = vi.fn()
      .mockResolvedValueOnce(partialResult)
      .mockResolvedValueOnce(okResult);
    const mockPlanAgent = vi.fn(async () => quickReplyPlan());

    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approvedToolCalls: [noteCall, refundCall, sendReplyCall],
      expectedIdentity: { instructionHash: hashInstruction(plan.instruction) },
      allowMutativeAutoExecute: true,
    }, makeDeps({ runAgent, planAgent: mockPlanAgent }));

    expect(runAgent).toHaveBeenCalledTimes(2);
    expect(executed.execution.status).toBe("committed");
    expect(executed.failureReplanRecovery).toMatchObject({
      context: expect.objectContaining({ failureTool: "create_refund" }),
    });
  });

  it("recovers on the quick-approve path, which posts no approved tool calls", async () => {
    const settings = resolveAgentSettings({ autonomyTier: "trusted", autoExecuteMode: "live" });
    const { org, thread } = await seedThreadWithPlan({ plan: threeStepPlan(), settings });
    const partialResult: AgentResult = {
      summary: "Refund failed",
      actionsPerformed: [
        { tool: "add_shopify_customer_note", result: "Noted", status: "success" },
        { tool: "create_refund", result: "Rejected", status: "error" },
      ],
    };
    const runAgent = vi.fn()
      .mockResolvedValueOnce(partialResult)
      .mockResolvedValueOnce(okResult);
    const mockPlanAgent = vi.fn(async () => quickReplyPlan());

    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      allowMutativeAutoExecute: true,
    }, makeDeps({ runAgent, planAgent: mockPlanAgent }));

    expect(runAgent).toHaveBeenCalledTimes(2);
    expect(executed.failureReplanRecovery).toBeDefined();
  });

  it("caches a child that cannot run on its own authority instead of executing it", async () => {
    const settings = resolveAgentSettings({ autonomyTier: "guarded", requireApprovalForActions: true });
    const { org, thread, message } = await seedThreadWithPlan({ plan: threeStepPlan(), settings });
    const retryRefund: RawToolCall = {
      id: "child_refund_1",
      name: "create_refund",
      input: { order_id: "gid://shopify/Order/1", amount: "10.00", currency: "USD" },
    };
    const childNeedingApproval: AgentPlan = {
      instruction: "Note the request, issue the refund, and reply",
      steps: [{
        id: retryRefund.id,
        tool: retryRefund.name,
        label: "Refund",
        description: "Retry the refund",
        category: "action",
        enabled: true,
      }],
      rawToolCalls: [retryRefund],
      routingEvidence: { classifierState: "not_applicable", codes: [] },
      validation: { status: "valid", issues: [] },
    };
    const partialResult: AgentResult = {
      summary: "Refund failed",
      actionsPerformed: [
        { tool: "add_shopify_customer_note", result: "Noted", status: "success" },
        { tool: "create_refund", result: "Rejected", status: "error" },
      ],
    };
    const runAgent = vi.fn().mockResolvedValueOnce(partialResult);
    const mockPlanAgent = vi.fn(async () => childNeedingApproval);

    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approvedToolCalls: [noteCall, refundCall, sendReplyCall],
    }, makeDeps({ runAgent, planAgent: mockPlanAgent }));

    // The child never ran, and the parent's committed work is still reported.
    expect(runAgent).toHaveBeenCalledOnce();
    expect(executed.failureReplanRecovery).toBeUndefined();
    expect(executed.result.actionsPerformed).toHaveLength(2);
    expect(executed.failureReplanAwaitingApproval).toMatchObject({
      context: expect.objectContaining({ failureTool: "create_refund" }),
    });

    // It is waiting on the thread for the merchant, marked so it cannot replan again.
    const threadAfter = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    const cached = readAgentPlanCache(threadAfter.cachedPlan);
    expect(cached?.plan.rawToolCalls.map((call) => call.id)).toEqual(["child_refund_1"]);
    expect(cached?.failureReplan?.failureTool).toBe("create_refund");
    expect(threadAfter.cachedPlanMessageId).toBe(message.id);
  });

  it("does not replan after an unknown provider outcome and escalates the thread", async () => {
    const settings = resolveAgentSettings({ autonomyTier: "trusted", autoExecuteMode: "live" });
    const { org, thread } = await seedThreadWithPlan({ plan: threeStepPlan(), settings });
    const unknownResult: AgentResult = {
      summary: "Unknown refund outcome",
      actionsPerformed: [
        { tool: "add_shopify_customer_note", result: "Noted", status: "success" },
        { tool: "create_refund", result: "Unknown", status: "unknown" },
      ],
    };
    const runAgent = vi.fn(async () => unknownResult);
    const mockPlanAgent = vi.fn(async () => quickReplyPlan());

    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "automatic",
      failureRoute: "test",
      allowMutativeAutoExecute: true,
    }, makeDeps({ runAgent, planAgent: mockPlanAgent }));

    expect(runAgent).toHaveBeenCalledOnce();
    expect(mockPlanAgent).not.toHaveBeenCalled();
    expect(executed.execution.status).toBe("unknown");
    const updated = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(updated.escalatedAt).not.toBeNull();
    expect(updated.cachedPlan).toBeNull();
  });
});
