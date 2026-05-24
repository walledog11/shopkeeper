import { SenderType, type DbChannelType, type DbSenderType } from "@clerk/db";
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from "@clerk/db/test-helpers";
import { vi } from "vitest";
import { anthropic } from "@/lib/ai/anthropic";
import { planAgent } from "../planner";
import { resolveAgentSettings } from "../settings";
import { readModelUsage } from "../usage";
import type { AgentContext } from "../types";
import type { Fixture, EvalResult, EvalUsage } from "./types";

const SENDER_TYPE_MAP: Record<string, DbSenderType> = {
  customer: SenderType.customer,
  agent: SenderType.agent,
  ai: SenderType.ai,
  note: SenderType.note,
};

function buildContext(fixture: Fixture, orgId: string, threadId: string): AgentContext {
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
      name: setup.customerName ?? null,
      platformId: setup.customerPlatformId ?? "customer@test.com",
    },
    recentMessages: setup.messages.map((m) => ({
      senderType: m.senderType,
      contentText: m.contentText,
    })),
    openThreadCount: setup.openThreadCount ?? 1,
    shopify: setup.shopify ?? null,
    recentOrders: setup.recentOrders ?? [],
    kbArticles: setup.kbArticles ?? [],
  };
}

function emptyUsage(): EvalUsage {
  return {
    modelCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
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

export async function runFixture(fixture: Fixture): Promise<EvalResult> {
  const failures: string[] = [];
  const usage = emptyUsage();
  const startedAt = Date.now();
  let orgId: string | null = null;
  let spy: { mockRestore: () => void } | null = null;

  try {
    const org = await createTestOrg();
    orgId = org.id;
    const channel = fixture.setup.channelType as DbChannelType;
    const customer = await createTestCustomer(
      org.id,
      fixture.setup.customerPlatformId ?? "customer@test.com",
      fixture.setup.customerName ? { name: fixture.setup.customerName } : {},
    );
    const thread = await createTestThread(org.id, customer.id, channel, { tag: fixture.setup.tag });

    for (const m of fixture.setup.messages) {
      const sender = SENDER_TYPE_MAP[m.senderType] ?? SenderType.customer;
      await createTestMessage(thread.id, m.contentText, sender);
    }

    type CreateFn = typeof anthropic.messages.create;
    const originalCreate = anthropic.messages.create.bind(anthropic.messages) as CreateFn;
    const createWithUsage = ((
      body: Parameters<CreateFn>[0],
      options?: Parameters<CreateFn>[1],
    ) => (
      originalCreate(body, options).then((response: Awaited<ReturnType<CreateFn>>) => {
        recordEvalUsage(usage, response);
        return response;
      })
    )) as CreateFn;
    spy = vi.spyOn(anthropic.messages, "create").mockImplementation(createWithUsage);

    const ctx = buildContext(fixture, org.id, thread.id);
    const resolved = resolveAgentSettings(fixture.setup.orgSettings ?? null);
    const plan = await planAgent(ctx, fixture.instruction, resolved);

    const calledTools = plan.rawToolCalls.map((tc) => tc.name);
    const sendReplyCall = plan.rawToolCalls.find((tc) => tc.name === "send_reply");
    const replyText = sendReplyCall && typeof sendReplyCall.input === "object" && sendReplyCall.input !== null
      ? String((sendReplyCall.input as { text?: unknown }).text ?? "")
      : "";

    const expected = fixture.expectedPlan;

    for (const tool of expected.mustCallTools ?? []) {
      if (!calledTools.includes(tool)) {
        failures.push(`expected tool "${tool}" to be called; called: [${calledTools.join(", ")}]`);
      }
    }

    for (const tool of expected.mustNotCallTools ?? []) {
      if (calledTools.includes(tool)) {
        failures.push(`tool "${tool}" should not have been called; called: [${calledTools.join(", ")}]`);
      }
    }

    if (expected.mustEscalate === true && !calledTools.includes("escalate_to_human")) {
      failures.push(`expected escalation; called: [${calledTools.join(", ")}]`);
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
  } catch (err) {
    failures.push(`runner threw: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
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
