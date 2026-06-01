import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db, isEmptyMemory, SenderType, type DbChannelType, type DbSenderType } from "@clerk/db";
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from "@clerk/db/test-helpers";
import { vi } from "vitest";
import { anthropic, buildCachedSystemPrompt } from "@/lib/ai/anthropic";
import { HAIKU_MODEL } from "@/lib/ai";
import { planAgent } from "../planner";
import { runAgent, type RunAgentOptions } from "../run";
import { classifyHomePlan } from "../plan-preview";
import { resolveAgentSettings } from "../settings";
import * as executor from "../tools/executor";
import { readModelUsage } from "../usage";
import { hashInstruction, hashPlan, type AgentActionApproval } from "../api/agent-actions";
import type { AgentActionMode, AgentContext } from "../types";
import type { AgentPlan, OrgSettings } from "@/types";
import { judgeReply } from "./judge";
import type {
  ExpectedAgentAction,
  Fixture,
  EvalResult,
  EvalUsage,
  ToolInputExpectation,
  EvalBaseline,
  CategoryScore,
} from "./types";

// Longest-prefix match groups fixtures into domains for per-category scoring.
// A fixture whose id matches no prefix becomes its own category (visible, not silently dropped).
const CATEGORY_PREFIXES = [
  "address-change",
  "brand-voice",
  "cancel",
  "escalate",
  "kb",
  "memory",
  "multi-step",
  "no-tool",
  "operator",
  "order-status",
  "prompt-injection",
  "quick-reply",
  "refund",
  "sample-reply",
  "tier",
];

const BASELINE_PATH = join(__dirname, "baseline.json");
const DEFAULT_REGRESSION_THRESHOLD = 0.05;

export interface CacheProbeUsage {
  firstCreate: number;
  firstRead: number;
  secondCreate: number;
  secondRead: number;
}

// Verifies the system-prompt cache plumbing (buildCachedSystemPrompt + the
// client honoring cache_control) on its own, independent of agent model
// tiering. The planner now splits its calls across Haiku and Sonnet, so a
// real-fixture run no longer produces two same-model calls that share a cache;
// this probe pins one model and one byte-identical prompt so the second call
// must read the ephemeral block the first created.
export async function probeSystemPromptCacheRead(): Promise<CacheProbeUsage> {
  // Comfortably above haiku-4-5's minimum cacheable prefix length (empirically
  // ~4k tokens don't cache but ~8k do; 1200 reps ≈ 9.5k tokens clears it).
  const systemText = `You are a careful support agent.\n${"Follow the workspace policies and answer accurately. ".repeat(1200)}`;
  const system = buildCachedSystemPrompt(systemText);
  const callOnce = async () => {
    const response = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 16,
      system,
      messages: [{ role: "user", content: "Reply with the single word OK." }],
    });
    return readModelUsage(response);
  };
  const first = await callOnce();
  const second = await callOnce();
  return {
    firstCreate: first.cacheCreationInputTokens,
    firstRead: first.cacheReadInputTokens,
    secondCreate: second.cacheCreationInputTokens,
    secondRead: second.cacheReadInputTokens,
  };
}

export function categoryOf(id: string): string {
  return CATEGORY_PREFIXES.find((p) => id === p || id.startsWith(`${p}-`)) ?? id;
}

export function summarizeResults(results: readonly EvalResult[]): EvalBaseline {
  const categories: Record<string, CategoryScore> = {};
  for (const r of results) {
    const cat = categoryOf(r.id);
    const score = categories[cat] ?? { total: 0, passed: 0, passRate: 0 };
    score.total += 1;
    if (r.pass) score.passed += 1;
    score.passRate = score.passed / score.total;
    categories[cat] = score;
  }
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  return {
    generatedAt: new Date().toISOString(),
    total,
    passed,
    passRate: total === 0 ? 0 : passed / total,
    categories: Object.fromEntries(Object.keys(categories).sort().map((k) => [k, categories[k]])),
  };
}

export function formatSummary(summary: EvalBaseline): string {
  const lines = [
    `[eval:summary] aggregate ${summary.passed}/${summary.total} (${(summary.passRate * 100).toFixed(1)}%)`,
  ];
  for (const [cat, score] of Object.entries(summary.categories)) {
    lines.push(`  ${cat}: ${score.passed}/${score.total} (${(score.passRate * 100).toFixed(1)}%)`);
  }
  return lines.join("\n");
}

export function shouldUpdateBaseline(): boolean {
  const flag = process.env.UPDATE_EVAL_BASELINE;
  if (flag === undefined) return false;
  const normalized = flag.trim().toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false";
}

export function regressionThreshold(): number {
  const raw = process.env.EVAL_BASELINE_THRESHOLD;
  if (raw === undefined) return DEFAULT_REGRESSION_THRESHOLD;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_REGRESSION_THRESHOLD;
}

export function writeBaseline(summary: EvalBaseline): void {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(summary, null, 2)}\n`);
}

export function loadBaseline(): EvalBaseline | null {
  if (!existsSync(BASELINE_PATH)) return null;
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as EvalBaseline;
}

// The aggregate pass rate is the hard gate (returned as `aggregate`); per-category drops are
// reported separately so a localized regression is visible/flagged even when the aggregate stays
// within threshold.
export function compareToBaseline(
  current: EvalBaseline,
  baseline: EvalBaseline,
  threshold: number,
): { aggregate: string | null; categories: string[] } {
  const drop = (cur: number, base: number) =>
    `${(cur * 100).toFixed(1)}% dropped > ${(threshold * 100).toFixed(1)} pts below baseline ${(base * 100).toFixed(1)}%`;

  const aggregate =
    current.passRate < baseline.passRate - threshold
      ? `aggregate pass rate ${drop(current.passRate, baseline.passRate)}`
      : null;

  const categories: string[] = [];
  for (const [cat, baseScore] of Object.entries(baseline.categories)) {
    const curScore = current.categories[cat];
    if (!curScore) continue;
    if (curScore.passRate < baseScore.passRate - threshold) {
      categories.push(`category "${cat}" pass rate ${drop(curScore.passRate, baseScore.passRate)}`);
    }
  }
  return { aggregate, categories };
}

const SENDER_TYPE_MAP: Record<string, DbSenderType> = {
  customer: SenderType.customer,
  agent: SenderType.agent,
  ai: SenderType.ai,
  note: SenderType.note,
};

function buildContext(fixture: Fixture, orgId: string, threadId: string, customerId: string): AgentContext {
  const { setup } = fixture;
  return {
    orgId,
    orgName: "Test Store",
    thread: {
      id: threadId,
      status: "open",
      channelType: setup.channelType,
      tag: setup.tag ?? "Support",
      aiSummary: setup.aiSummary ?? null,
      shopifyCustomerId: setup.shopifyCustomerId ?? null,
    },
    customer: {
      id: customerId,
      name: setup.customerName ?? null,
      platformId: setup.customerPlatformId ?? "customer@test.com",
    },
    customerMemory: setup.customerMemory && !isEmptyMemory(setup.customerMemory) ? setup.customerMemory : null,
    recentMessages: setup.messages.map((m) => ({
      senderType: m.senderType,
      contentText: m.contentText,
    })),
    openThreadCount: setup.openThreadCount ?? 1,
    shopify: setup.shopify ?? null,
    recentOrders: setup.recentOrders ?? [],
    linkedShopifyCustomerName: setup.linkedShopifyCustomerName ?? null,
    kbArticles: setup.kbArticles ?? [],
  };
}

function recordEvalUsage(usage: EvalUsage, response: unknown) {
  if (!response || typeof response !== "object" || !("usage" in response)) {
    return;
  }

  const modelUsage = readModelUsage(response as { usage?: unknown });
  usage.modelCalls += 1;
  usage.inputTokens += modelUsage.inputTokens;
  usage.outputTokens += modelUsage.outputTokens;
  usage.cacheReadInputTokens += modelUsage.cacheReadInputTokens;
  usage.cacheCreationInputTokens += modelUsage.cacheCreationInputTokens;
}

function isSubsequence(needle: readonly string[], haystack: readonly string[]): boolean {
  let i = 0;
  for (const item of haystack) {
    if (i < needle.length && item === needle[i]) i += 1;
  }
  return i === needle.length;
}

function inputContainsExpected(actual: unknown, expected: Record<string, unknown>): boolean {
  if (actual === null || typeof actual !== "object") return false;
  const actualObj = actual as Record<string, unknown>;
  for (const [key, value] of Object.entries(expected)) {
    const got = actualObj[key];
    if (typeof value === "string") {
      if (typeof got !== "string" || !got.toLowerCase().includes(value.toLowerCase())) return false;
    } else if (got !== value) {
      return false;
    }
  }
  return true;
}

function findToolInputMatch(rawToolCalls: { name: string; input: unknown }[], expectation: ToolInputExpectation): boolean {
  return rawToolCalls.some(
    (tc) => tc.name === expectation.tool && inputContainsExpected(tc.input, expectation.inputIncludes),
  );
}

function isAgentActionSubsequence(
  expected: readonly ExpectedAgentAction[],
  observed: readonly ExpectedAgentAction[],
): boolean {
  let i = 0;
  for (const row of observed) {
    const target = expected[i];
    if (i < expected.length && row.tool === target.tool && row.status === target.status && row.mode === target.mode) {
      i += 1;
    }
  }
  return i === expected.length;
}

function formatAgentAction(row: ExpectedAgentAction): string {
  return `${row.tool}:${row.status}:${row.mode}`;
}

function inferRunMode(expected: ExpectedAgentAction[]): AgentActionMode {
  if (expected.length === 0) return "read_only";
  const first = expected[0].mode;
  return first;
}

function isJudgeEnabled(): boolean {
  const flag = process.env.RUN_JUDGE_EVALS;
  if (flag !== undefined) {
    const normalized = flag.trim().toLowerCase();
    return normalized !== "" && normalized !== "0" && normalized !== "false";
  }
  return !process.env.CI;
}

async function executeRunForFixture(params: {
  ctx: AgentContext;
  fixture: Fixture;
  plan: AgentPlan;
  mode: AgentActionMode;
  settings: OrgSettings;
}): Promise<void> {
  const { ctx, fixture, plan, mode, settings } = params;
  let approvedToolCalls = mode === "read_only" ? undefined : plan.rawToolCalls;
  if (approvedToolCalls && approvedToolCalls.length === 0) {
    approvedToolCalls = undefined;
  }

  const options: RunAgentOptions = { mode };
  if (mode === "read_only") options.readOnly = true;
  if (mode === "human_approved") {
    const approval: AgentActionApproval = {
      approverId: "eval_runner:Eval Runner",
      approvedAt: new Date(),
      approvedPlanHash: hashPlan(plan),
      instructionHash: hashInstruction(fixture.instruction),
    };
    options.approval = approval;
  }

  await runAgent(ctx, fixture.instruction, approvedToolCalls, settings, options);
}

async function fetchObservedAgentActions(orgId: string, threadId: string): Promise<ExpectedAgentAction[]> {
  const rows = await db.agentAction.findMany({
    where: { organizationId: orgId, threadId },
    orderBy: { executedAt: "asc" },
    select: { tool: true, status: true, mode: true },
  });
  return rows.map((r) => ({
    tool: r.tool,
    status: r.status as ExpectedAgentAction["status"],
    mode: r.mode as ExpectedAgentAction["mode"],
  }));
}

export async function runFixture(fixture: Fixture): Promise<EvalResult> {
  const failures: string[] = [];
  const usage: EvalUsage = {
    modelCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    judgeUsage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    },
  };
  const startedAt = Date.now();
  let orgId: string | null = null;
  let spy: { mockRestore: () => void } | null = null;
  let executorSpy: { mockRestore: () => void } | null = null;
  let executorStatusSpy: { mockRestore: () => void } | null = null;

  try {
    const org = await createTestOrg();
    orgId = org.id;
    const channel = fixture.setup.channelType as DbChannelType;
    const customer = await createTestCustomer(
      org.id,
      fixture.setup.customerPlatformId ?? "customer@test.com",
      fixture.setup.customerName ? { name: fixture.setup.customerName } : {},
    );
    if (fixture.setup.customerMemory) {
      await db.customer.update({
        where: { id: customer.id },
        data: {
          memory: JSON.parse(JSON.stringify(fixture.setup.customerMemory)),
          memoryUpdatedAt: new Date(),
        },
      });
    }
    const thread = await createTestThread(org.id, customer.id, channel, { tag: fixture.setup.tag });

    const createFixtureMessages = async (index: number): Promise<void> => {
      const m = fixture.setup.messages[index];
      if (!m) return;
      const sender = SENDER_TYPE_MAP[m.senderType] ?? SenderType.customer;
      await createTestMessage(thread.id, m.contentText, sender);
      return createFixtureMessages(index + 1);
    };

    await createFixtureMessages(0);

    // Plain monkey-patch instead of vi.spyOn: tinyspy tracks every call's settled
    // result via returnValue.then(...), which overflows the stack under the live
    // client's APIPromise + retry volume. We only need to tally usage, so wrap
    // create() directly and restore it in finally.
    type CreateFn = typeof anthropic.messages.create;
    const messages = anthropic.messages;
    const originalCreate = messages.create;
    const wrappedCreate = (async (body: unknown, options: unknown) => {
      const response = await (originalCreate as CreateFn).call(messages, body as never, options as never);
      recordEvalUsage(usage, response);
      return response;
    }) as CreateFn;
    messages.create = wrappedCreate;
    // Only restore if our wrapper is still installed: if a prior fixture timed out and its
    // restore fires late (mid-way through this fixture), it must not clobber our patch.
    spy = { mockRestore: () => { if (messages.create === wrappedCreate) messages.create = originalCreate; } };

    const simulatedResults = new Map<string, string>(
      (fixture.setup.simulateToolResults ?? []).map((r) => [r.tool, r.result]),
    );
    if (simulatedResults.size > 0) {
      const originalExecute = executor.executeTool;
      executorSpy = vi
        .spyOn(executor, "executeTool")
        .mockImplementation(async (name, args, execCtx, settings) => {
          if (simulatedResults.has(name)) return simulatedResults.get(name) as string;
          return originalExecute(name, args, execCtx, settings);
        });

      const originalExecuteWithStatus = executor.executeToolWithStatus;
      executorStatusSpy = vi
        .spyOn(executor, "executeToolWithStatus")
        .mockImplementation(async (name, args, execCtx, settings) => {
          if (simulatedResults.has(name)) {
            const result = simulatedResults.get(name) as string;
            return {
              result,
              status: result.toLowerCase().startsWith("error:") ? "error" : "success",
            };
          }
          return originalExecuteWithStatus(name, args, execCtx, settings);
        });
    }

    const ctx = buildContext(fixture, org.id, thread.id, customer.id);
    const resolved = resolveAgentSettings(fixture.setup.orgSettings ?? null);
    const plan = await planAgent(ctx, fixture.instruction, resolved);

    const calledTools = plan.rawToolCalls.map((tc) => tc.name);
    const calledToolSet = new Set(calledTools);
    const sendReplyCall = plan.rawToolCalls.find((tc) => tc.name === "send_reply");
    const replyText = sendReplyCall && typeof sendReplyCall.input === "object" && sendReplyCall.input !== null
      ? String((sendReplyCall.input as { text?: unknown }).text ?? "")
      : "";

    const expected = fixture.expectedPlan;

    for (const tool of expected.mustCallTools ?? []) {
      if (!calledToolSet.has(tool)) {
        failures.push(`expected tool "${tool}" to be called; called: [${calledTools.join(", ")}]`);
      }
    }

    for (const tool of expected.mustNotCallTools ?? []) {
      if (calledToolSet.has(tool)) {
        failures.push(`tool "${tool}" should not have been called; called: [${calledTools.join(", ")}]`);
      }
    }

    if (expected.mustCallToolsInOrder && expected.mustCallToolsInOrder.length > 0) {
      if (!isSubsequence(expected.mustCallToolsInOrder, calledTools)) {
        failures.push(
          `expected tool order [${expected.mustCallToolsInOrder.join(", ")}] not found as subsequence; called: [${calledTools.join(", ")}]`,
        );
      }
    }

    for (const expectation of expected.mustCallToolsWithInput ?? []) {
      if (!findToolInputMatch(plan.rawToolCalls, expectation)) {
        const matching = plan.rawToolCalls.filter((tc) => tc.name === expectation.tool);
        const observed = matching.map((tc) => JSON.stringify(tc.input)).join(" | ") || "(no calls)";
        failures.push(
          `expected "${expectation.tool}" call with input including ${JSON.stringify(expectation.inputIncludes)}; observed: ${observed}`,
        );
      }
    }

    if (expected.mustEscalate === true && !calledTools.includes("escalate_to_human")) {
      failures.push(`expected escalation; called: [${calledTools.join(", ")}]`);
    }

    if (expected.mustClassifyAs) {
      const classification = classifyHomePlan(plan, fixture.setup.orgSettings ?? null);
      if (classification.kind !== expected.mustClassifyAs) {
        failures.push(
          `expected classifyHomePlan -> "${expected.mustClassifyAs}", got "${classification.kind}"`,
        );
      }
    }

    for (const phrase of expected.replyMustInclude ?? []) {
      if (!replyText.toLowerCase().includes(phrase.toLowerCase())) {
        failures.push(`reply missing "${phrase}"; reply was: "${replyText}"`);
      }
    }

    for (const phrase of expected.replyMustNotInclude ?? []) {
      if (replyText.toLowerCase().includes(phrase.toLowerCase())) {
        failures.push(`reply contained forbidden "${phrase}"; reply was: "${replyText}"`);
      }
    }

    if (fixture.expectedRubric && replyText.length > 0 && isJudgeEnabled()) {
      const judged = await judgeReply({
        checks: fixture.expectedRubric.checks,
        replyText,
        context: {
          orgSettings: resolved,
          customerMemory: ctx.customerMemory,
          recentMessages: ctx.recentMessages,
        },
      });
      // The anthropic.messages.create spy counts every call; move the judge's slice out of the agent totals.
      usage.modelCalls -= 1;
      usage.inputTokens -= judged.usage.inputTokens;
      usage.outputTokens -= judged.usage.outputTokens;
      usage.cacheReadInputTokens -= judged.usage.cacheReadInputTokens;
      usage.cacheCreationInputTokens -= judged.usage.cacheCreationInputTokens;
      usage.judgeUsage.inputTokens += judged.usage.inputTokens;
      usage.judgeUsage.outputTokens += judged.usage.outputTokens;
      usage.judgeUsage.cacheReadInputTokens += judged.usage.cacheReadInputTokens;
      usage.judgeUsage.cacheCreationInputTokens += judged.usage.cacheCreationInputTokens;

      const checkById = new Map(fixture.expectedRubric.checks.map((c) => [c.id, c]));
      for (const result of judged.results) {
        if (result.pass) continue;
        const check = checkById.get(result.checkId);
        const required = check?.required !== false;
        if (required) {
          failures.push(`rubric "${result.checkId}" failed: ${result.reasoning}`);
        } else {
          console.log(
            `[eval] ${fixture.id} informational rubric "${result.checkId}" failed: ${result.reasoning}`,
          );
        }
      }
    }

    if (expected.expectedAgentActions) {
      const runMode = inferRunMode(expected.expectedAgentActions);
      await executeRunForFixture({ ctx, fixture, plan, mode: runMode, settings: resolved });

      const observed = await fetchObservedAgentActions(org.id, thread.id);
      if (!isAgentActionSubsequence(expected.expectedAgentActions, observed)) {
        failures.push(
          `expected AgentAction rows [${expected.expectedAgentActions.map(formatAgentAction).join(", ")}] not found as ordered subsequence; observed: [${observed.map(formatAgentAction).join(", ")}]`,
        );
      }
    }
  } catch (err) {
    failures.push(`runner threw: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    executorStatusSpy?.mockRestore();
    executorSpy?.mockRestore();
    spy?.mockRestore();
    if (orgId) {
      await cleanupTestData(orgId).catch(() => {});
    }
  }

  return {
    id: fixture.id,
    pass: failures.length === 0,
    failures,
    usage,
    latencyMs: Date.now() - startedAt,
  };
}
