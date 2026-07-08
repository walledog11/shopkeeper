import { beforeEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { AgentContext } from "./agent-context.js";
import type { RawToolCall } from "./types.js";
import {
  findTerminalSendTool,
  refreshTerminalSendAfterSkip,
  stripTerminalSendTools,
} from "./planner-skip-reply.js";

const { runPlannerModelCallSpy } = vi.hoisted(() => ({
  runPlannerModelCallSpy: vi.fn(),
}));

vi.mock("./planner-model.js", () => ({
  PLAN_REPLAN_MAX_TOKENS: 1024,
  runPlannerModelCall: runPlannerModelCallSpy,
}));

vi.mock("./spend.js", () => ({
  enforceSpendCap: vi.fn().mockResolvedValue(undefined),
}));

function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    orgId: "org_1",
    orgName: "Test Store",
    customer: { id: "customer_1", name: "Jane", platformId: "jane@test.com" },
    recentMessages: [{ senderType: "customer", contentText: "Please update my shipping address." }],
    openThreadCount: 1,
    pastTickets: [],
    shopify: { shop: "test-store.myshopify.com", accessToken: "shpat_test" },
    recentOrders: [],
    linkedShopifyCustomerName: null,
    kbArticles: [],
    thread: {
      id: "thread_1",
      status: "open",
      channelType: "email",
      tag: "Support",
      aiSummary: null,
      shopifyCustomerId: null,
    },
    escalate: async () => {},
    io: {
      addInternalNote: async () => ({ status: "ok", message: "ok" }),
      sendReply: async () => ({ status: "ok", message: "ok" }),
      sendEmail: async () => ({ status: "ok", message: "ok" }),
      updateThreadStatus: async () => ({ status: "ok", message: "ok" }),
      updateThreadTag: async () => ({ status: "ok", message: "ok" }),
      escalateToHuman: async () => ({ status: "escalated", message: "escalated" }),
      askOperator: async () => ({ status: "ok", message: "ok" }),
    },
    ...overrides,
  };
}

beforeEach(() => {
  runPlannerModelCallSpy.mockReset();
});

describe("planner-skip-reply helpers", () => {
  it("finds and strips terminal send tools", () => {
    const toolCalls: RawToolCall[] = [
      { id: "a1", name: "edit_shopify_order", input: { quantity: 1 } },
      { id: "r1", name: "send_reply", input: { text: "Added item and updated address." } },
    ];

    expect(findTerminalSendTool(toolCalls)?.id).toBe("r1");
    expect(stripTerminalSendTools(toolCalls).map((toolCall) => toolCall.id)).toEqual(["a1"]);
  });
});

describe("refreshTerminalSendAfterSkip", () => {
  it("returns approved tool calls unchanged when there is no terminal send", async () => {
    const approvedToolCalls: RawToolCall[] = [
      { id: "a1", name: "edit_shopify_order", input: { quantity: 1 } },
    ];

    await expect(refreshTerminalSendAfterSkip({
      ctx: makeCtx(),
      instruction: "Handle address change",
      approvedToolCalls,
    })).resolves.toEqual(approvedToolCalls);

    expect(runPlannerModelCallSpy).not.toHaveBeenCalled();
  });

  it("re-drafts send_reply for remaining actions after a skip", async () => {
    runPlannerModelCallSpy.mockResolvedValue({
      toolBlocks: [{
        type: "tool_use",
        id: "tu_redraft",
        name: "send_reply",
        input: { text: "Your shipping address has been updated." },
      }] satisfies Anthropic.ToolUseBlock[],
    });

    const approvedToolCalls: RawToolCall[] = [
      { id: "r0", name: "get_shopify_orders", input: { customer_id: "1" } },
      { id: "a1", name: "edit_shopify_order", input: { quantity: 1, variant_id: "v1" } },
      { id: "a2", name: "update_shopify_order_address", input: { address1: "1 Main St", city: "LA", province: "CA", zip: "90001", country: "US" } },
      { id: "s1", name: "send_reply", input: { text: "Added the item and updated your address." } },
    ];

    const result = await refreshTerminalSendAfterSkip({
      ctx: makeCtx(),
      instruction: "Handle address change",
      approvedToolCalls: [
        { id: "r0", name: "get_shopify_orders", input: { customer_id: "1" } },
        { id: "a2", name: "update_shopify_order_address", input: { address1: "1 Main St", city: "LA", province: "CA", zip: "90001", country: "US" } },
        { id: "s1", name: "send_reply", input: { text: "Added the item and updated your address." } },
      ],
    });

    expect(runPlannerModelCallSpy).toHaveBeenCalled();
    const draftPrompt = runPlannerModelCallSpy.mock.calls[0]?.[0]?.phase;
    expect(draftPrompt).toBe("skip_reply_redraft");

    const prompt = runPlannerModelCallSpy.mock.calls[0]?.[0]?.messages?.at(-1);
    expect(prompt?.role).toBe("user");
    expect(String((prompt as { content: string }).content)).toContain("Remaining approved actions");
    expect(String((prompt as { content: string }).content)).not.toContain("Added the item");

    expect(result.map((toolCall) => toolCall.name)).toEqual([
      "get_shopify_orders",
      "update_shopify_order_address",
      "send_reply",
    ]);
    expect((result.at(-1)?.input as { text: string }).text).toBe("Your shipping address has been updated.");
  });

  it("drops terminal send when redraft fails", async () => {
    runPlannerModelCallSpy.mockResolvedValue({ toolBlocks: [] });

    const approvedToolCalls: RawToolCall[] = [
      { id: "a2", name: "update_shopify_order_address", input: { address1: "1 Main St", city: "LA", province: "CA", zip: "90001", country: "US" } },
      { id: "s1", name: "send_reply", input: { text: "Stale copy." } },
    ];

    const result = await refreshTerminalSendAfterSkip({
      ctx: makeCtx(),
      instruction: "Handle address change",
      approvedToolCalls,
    });

    expect(result.map((toolCall) => toolCall.name)).toEqual(["update_shopify_order_address"]);
  });
});
