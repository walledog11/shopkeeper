import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@shopkeeper/db";
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from "@shopkeeper/db/test-helpers";
import { BadRequestError, ConflictError } from "./errors.js";
import { buildAgentPlanCacheRecord, commitThreadPlanCacheIfCurrent } from "./plan-cache.js";
import {
  executeCurrentCachedHomePlan,
  dismissCurrentCachedPlan,
  findFailedToolResult,
  formatApproverId,
  getExecutablePlanToolCalls,
  isAutoExecuteEnabled,
  maybeAutoExecuteCurrentCachedHomePlan,
  resolvePlanExecutionLedgerMode,
  type PlanExecutionDeps,
} from "./plan-execution.js";
import { resolveAgentSettings } from "./settings.js";
import { hashInstruction, hashPlan } from "./agent-actions.js";
import { claimCurrentPlanExecution } from "./execution-ledger.js";
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
        id: "refund_1",
        tool: "create_refund",
        label: "Refund",
        description: "Issue the refund",
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
} = {}) {
  const plan = options.plan ?? quickReplyPlan();
  const settings = options.settings ?? resolveAgentSettings(null);
  const org = await createTestOrg();
  orgIds.push(org.id);
  const customer = await createTestCustomer(org.id, `${randomUUID()}@test.com`);
  const thread = await createTestThread(org.id, customer.id, "email");
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

describe("plan execution helpers", () => {
  it("dismisses only the exact cached plan identity", async () => {
    const { org, thread, cache } = await seedThreadWithPlan();

    await expect(dismissCurrentCachedPlan({
      orgId: org.id,
      threadId: thread.id,
      expectedPlanId: "stale-plan-id",
    })).resolves.toBe(false);
    expect((await db.thread.findUnique({ where: { id: thread.id } }))?.cachedPlan).not.toBeNull();

    await expect(dismissCurrentCachedPlan({
      orgId: org.id,
      threadId: thread.id,
      expectedPlanId: cache.planId!,
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
    })).rejects.toBeInstanceOf(ConflictError);
    expect((await db.thread.findUnique({ where: { id: thread.id } }))?.cachedPlan).not.toBeNull();
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
