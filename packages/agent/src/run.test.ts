import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_SETTINGS_DEFAULTS } from "./settings.js";
import { installAgentLogger, resetAgentLoggerForTests, type AgentLogger } from "./logger.js";
import { runAgent } from "./run.js";
import type { AgentContext } from "./agent-context.js";

const {
  mockCreate,
  mockRecordAgentActionsBatch,
  mockEnforceSpendCap,
  mockRecordSpend,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockRecordAgentActionsBatch: vi.fn().mockResolvedValue(undefined),
  mockEnforceSpendCap: vi.fn().mockResolvedValue(undefined),
  mockRecordSpend: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    messages = { create: mockCreate };
  },
}));

vi.mock("./spend.js", () => ({
  enforceSpendCap: mockEnforceSpendCap,
  recordSpend: mockRecordSpend,
  getDailySpendNano: vi.fn().mockResolvedValue(0),
}));

vi.mock("./agent-actions.js", () => ({
  recordAgentActionsBatch: mockRecordAgentActionsBatch,
  recordAgentAction: vi.fn().mockResolvedValue(undefined),
  hashInstruction: vi.fn().mockReturnValue("hash"),
  hashPlan: vi.fn().mockReturnValue("hash"),
}));

function toolUse(name: string, input: Record<string, unknown>, id = "tu_1") {
  return {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id, name, input }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function endTurn(text = "Done.") {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

function makeIo(): NonNullable<AgentContext["io"]> {
  return {
    addInternalNote: vi.fn().mockResolvedValue({ status: "ok", message: "Note added." }),
    sendReply: vi.fn().mockResolvedValue({ status: "ok", message: "Reply sent to customer via email." }),
    sendEmail: vi.fn().mockResolvedValue({ status: "ok", message: "Email sent." }),
    updateThreadStatus: vi.fn().mockResolvedValue({ status: "ok", message: "Status updated." }),
    updateThreadTag: vi.fn().mockResolvedValue({ status: "ok", message: "Tag updated." }),
  };
}

function makeLogger(): AgentLogger {
  return {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    orgId: "org_1",
    orgName: "Test Store",
    customer: { id: "customer_1", name: "Jane", platformId: "jane@test.com" },
    recentMessages: [{ senderType: "customer", contentText: "Help me" }],
    openThreadCount: 1,
    shopify: null,
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
    escalate: vi.fn().mockResolvedValue(undefined),
    io: makeIo(),
    ...overrides,
  };
}

beforeEach(() => {
  mockCreate.mockReset();
  mockRecordAgentActionsBatch.mockResolvedValue(undefined);
  mockEnforceSpendCap.mockResolvedValue(undefined);
  mockRecordSpend.mockResolvedValue(undefined);
});

afterEach(() => {
  resetAgentLoggerForTests();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("runAgent tool execution", () => {
  it("routes add_internal_note through the injected I/O sink", async () => {
    mockCreate
      .mockResolvedValueOnce(toolUse("add_internal_note", { text: "Customer is VIP" }))
      .mockResolvedValueOnce(endTurn());
    const ctx = makeCtx();

    const result = await runAgent(ctx, "Note that the customer is VIP");

    expect(ctx.io?.addInternalNote).toHaveBeenCalledWith({ text: "Customer is VIP" });
    expect(result.actionsPerformed[0]).toMatchObject({
      tool: "add_internal_note",
      result: "Note added.",
      status: "success",
    });
  });

  it("routes thread status and tag updates through the injected I/O sink", async () => {
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_1", name: "update_thread_status", input: { status: "closed" } },
          { type: "tool_use", id: "tu_2", name: "update_thread_tag", input: { tag: "Refund" } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      .mockResolvedValueOnce(endTurn("Updated."));
    const ctx = makeCtx();

    const result = await runAgent(ctx, "Close and tag this thread");

    expect(ctx.io?.updateThreadStatus).toHaveBeenCalledWith({ status: "closed" });
    expect(ctx.io?.updateThreadTag).toHaveBeenCalledWith({ tag: "Refund" });
    expect(result.actionsPerformed.map((action) => action.tool)).toEqual([
      "update_thread_status",
      "update_thread_tag",
    ]);
  });

  it("routes send_reply through the injected I/O sink", async () => {
    mockCreate
      .mockResolvedValueOnce(toolUse("send_reply", { text: "Your order shipped!" }))
      .mockResolvedValueOnce(endTurn("Reply sent."));
    const ctx = makeCtx();

    const result = await runAgent(ctx, "Tell the customer their order shipped");

    expect(ctx.io?.sendReply).toHaveBeenCalledWith({ text: "Your order shipped!" });
    expect(result.actionsPerformed[0].result).toBe("Reply sent to customer via email.");
  });

  it("returns an error string when no Shopify integration is connected", async () => {
    mockCreate
      .mockResolvedValueOnce(toolUse("get_shopify_orders", { customer_id: "999" }))
      .mockResolvedValueOnce(endTurn());

    const result = await runAgent(makeCtx(), "Get customer orders");

    expect(result.actionsPerformed[0].result).toBe("Error: no Shopify integration connected.");
  });
});

describe("runAgent loop behavior", () => {
  it("uses the injected logger for runner lifecycle logs", async () => {
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    mockCreate.mockResolvedValueOnce(endTurn("Nothing to do."));

    await runAgent(makeCtx(), "Do nothing");

    expect(injectedLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ iteration: 0, messageCount: 2, readOnly: false }),
      "[agent] iteration start",
    );
    expect(injectedLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "end_turn", orgId: "org_1", threadId: "thread_1" }),
      "[agent] run complete",
    );
  });

  it("returns the summary text on immediate end_turn", async () => {
    mockCreate.mockResolvedValueOnce(endTurn("Nothing to do."));

    const result = await runAgent(makeCtx(), "Do nothing");

    expect(result.summary).toBe("Nothing to do.");
    expect(result.actionsPerformed).toHaveLength(0);
  });

  it("tracks all tool calls from a single response in actionsPerformed", async () => {
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_1", name: "update_thread_tag", input: { tag: "Billing" } },
          { type: "tool_use", id: "tu_2", name: "add_internal_note", input: { text: "Billing issue" } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      .mockResolvedValueOnce(endTurn("All done."));

    const result = await runAgent(makeCtx(), "Tag and note this billing thread");

    expect(result.actionsPerformed).toHaveLength(2);
    expect(result.actionsPerformed.map((action) => action.tool)).toEqual(
      expect.arrayContaining(["update_thread_tag", "add_internal_note"]),
    );
  });

  it("answers simple operator order-status requests without an LLM loop", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        customers: [
          { id: 10368767590720, first_name: "Tiffany", last_name: "Johnson", email: "tfhut23993@yahoo.com", phone: null },
          { id: 10368746160448, first_name: "John", last_name: "Smith", email: "jrsmith2822@yahoo.com", phone: null },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        orders: [{
          id: 7108594991424,
          name: "#PG1003",
          created_at: "2026-04-03T16:14:11-07:00",
          financial_status: "pending",
          fulfillment_status: null,
          current_total_price: "149.90",
          currency: "USD",
          line_items: [
            { id: 17213578772800, variant_id: 51536929915200, title: "Pencil Half Zip", quantity: 1, fulfillable_quantity: 1, current_quantity: 1, fulfillment_status: null },
            { id: 17238938583360, variant_id: 51536929947968, title: "Pencil Half Zip", quantity: 1, fulfillable_quantity: 1, current_quantity: 1, fulfillment_status: null },
          ],
        }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAgent(
      makeCtx({
        shopify: { shop: "test-store.myshopify.com", accessToken: "shpat_test" },
        thread: {
          id: "thread_1",
          status: "open",
          channelType: "dashboard_agent",
          tag: "Support",
          aiSummary: null,
          shopifyCustomerId: null,
        },
      }),
      "What is the status on John's order?",
    );

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.actionsPerformed.map((action) => action.tool)).toEqual([
      "search_shopify_customers",
      "get_shopify_orders",
    ]);
    expect(result.summary).toContain("John Smith's latest order #PG1003");
    expect(result.summary).toContain("pending payment");
    expect(result.summary).toContain("has not shipped yet");
    expect(result.summary).toContain("2x Pencil Half Zip");
  });

  it("executes pre-approved tool calls without starting another model loop", async () => {
    const ctx = makeCtx();

    const result = await runAgent(
      ctx,
      "Execute plan",
      [{ id: "pre_1", name: "add_internal_note", input: { text: "Pre-approved note" } }],
    );

    expect(mockCreate).not.toHaveBeenCalled();
    expect(ctx.io?.addInternalNote).toHaveBeenCalledWith({ text: "Pre-approved note" });
    expect(result.actionsPerformed).toHaveLength(1);
    expect(result.actionsPerformed[0].tool).toBe("add_internal_note");
  });

  it("returns the exhaustion message when max iterations is reached", async () => {
    mockCreate.mockResolvedValue(toolUse("update_thread_tag", { tag: "loop" }));

    const result = await runAgent(
      makeCtx(),
      "Loop forever",
      undefined,
      { ...AGENT_SETTINGS_DEFAULTS, maxIterations: 2 },
    );

    expect(result.summary).toBe("Reached maximum steps without completing the task.");
    expect(result.actionsPerformed).toHaveLength(2);
  });
});
