import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_SETTINGS_DEFAULTS } from "./settings.js";
import { installAgentLogger, resetAgentLoggerForTests, type AgentLogger } from "./logger.js";
import { runAgent } from "./run.js";
import { defineTool, stringArg } from "./tools/registry/schema.js";
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
    pastTickets: [],
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
  it("hides support-only escalation, reply, and note tools in operator mode", async () => {
    mockCreate.mockResolvedValueOnce(endTurn("Ready."));
    const ctx = makeCtx({
      thread: {
        id: "operator_thread",
        status: "open",
        channelType: "sms_agent",
        tag: "Support",
        aiSummary: null,
        shopifyCustomerId: null,
      },
    });

    await runAgent(ctx, "What needs attention?");

    const request = mockCreate.mock.calls[0]?.[0] as { tools?: Array<{ name: string }> };
    const names = request.tools?.map((tool) => tool.name) ?? [];
    expect(names).not.toContain("escalate_to_human");
    expect(names).not.toContain("send_reply");
    expect(names).not.toContain("add_internal_note");
    expect(names).toContain("send_email");
  });

  it("returns an operator policy block to the model without invoking escalation", async () => {
    mockCreate
      .mockResolvedValueOnce(toolUse("create_refund", { order_id: "123", amount: "200.00" }))
      .mockResolvedValueOnce(endTurn("That refund is above the workspace cap. How would you like to proceed?"));
    const escalate = vi.fn().mockResolvedValue(undefined);
    const ctx = makeCtx({
      escalate,
      thread: {
        id: "operator_thread",
        status: "open",
        channelType: "sms_agent",
        tag: "Support",
        aiSummary: null,
        shopifyCustomerId: null,
      },
    });

    const result = await runAgent(ctx, "Refund $200");

    expect(escalate).not.toHaveBeenCalled();
    expect(result.actionsPerformed[0]).toMatchObject({
      tool: "create_refund",
      status: "policy_block",
    });
    expect(result.summary).toMatch(/workspace cap/i);
  });

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

describe("runAgent moduleTools seam", () => {
  function makeModuleTool(execute: ReturnType<typeof vi.fn>) {
    return defineTool({
      name: "test_control_tool",
      description: "A host-injected control tool.",
      fields: { guidance: stringArg("Guidance.", { required: true }) },
      category: "action",
      group: "thread",
      capabilities: [],
      label: "Ran control tool",
      planStepLabel: "Run control tool",
      policy: { categoryPermission: false },
      execute,
    });
  }

  it("appends module tool definitions to the tool set sent to the model", async () => {
    mockCreate.mockResolvedValueOnce(endTurn("Done."));
    const controlTool = makeModuleTool(vi.fn().mockResolvedValue({ status: "ok", message: "ok" }));

    await runAgent(makeCtx(), "hello", undefined, undefined, {
      moduleTools: { test_control_tool: controlTool },
    });

    const toolsArg = mockCreate.mock.calls[0]?.[0]?.tools as { name: string }[];
    expect(toolsArg.map((tool) => tool.name)).toContain("test_control_tool");
  });

  it("dispatches a module tool call through its definition and records the definition's category", async () => {
    const moduleExecute = vi.fn().mockResolvedValue({ status: "ok", message: "control effected." });
    const controlTool = makeModuleTool(moduleExecute);
    mockCreate
      .mockResolvedValueOnce(toolUse("test_control_tool", { guidance: "send it" }))
      .mockResolvedValueOnce(endTurn("All set."));

    const result = await runAgent(makeCtx(), "approve it", undefined, undefined, {
      moduleTools: { test_control_tool: controlTool },
    });

    expect(moduleExecute).toHaveBeenCalledTimes(1);
    expect(moduleExecute.mock.calls[0]?.[0]).toEqual({ guidance: "send it" });
    // Category resolves from the module definition, not TOOL_CATEGORIES (which
    // knows nothing of it) — otherwise the audit row gets a null category.
    expect(result.actionsPerformed[0]).toMatchObject({
      tool: "test_control_tool",
      category: "action",
      status: "success",
      result: "control effected.",
    });
  });

  it("does not offer module tools in read-only mode", async () => {
    mockCreate.mockResolvedValueOnce(endTurn("Answered."));
    const controlTool = makeModuleTool(vi.fn());

    await runAgent(makeCtx(), "just a question", undefined, undefined, {
      readOnly: true,
      moduleTools: { test_control_tool: controlTool },
    });

    const toolsArg = mockCreate.mock.calls[0]?.[0]?.tools as { name: string }[];
    expect(toolsArg.map((tool) => tool.name)).not.toContain("test_control_tool");
  });
});
