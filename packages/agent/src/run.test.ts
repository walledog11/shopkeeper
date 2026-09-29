import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_SETTINGS_DEFAULTS } from "./settings.js";
import { resetAgentLoggerForTests } from "./logger.js";
import { runAgent } from "./run.js";
import { defineTool, stringArg } from "./tools/registry/schema.js";
import type { AgentContext } from "./agent-context.js";

const {
  mockCreate,
  mockBeginAgentActionAttempt,
  mockAuthorizeAgentActionDispatch,
  mockMarkAgentActionSubmitted,
  mockCompleteAgentActionAttempt,
  mockRecordAgentActionsBatch,
  mockEnforceSpendCap,
  mockRecordSpend,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockBeginAgentActionAttempt: vi.fn().mockResolvedValue({ id: "action_1", operationId: "operation_1" }),
  mockAuthorizeAgentActionDispatch: vi.fn().mockResolvedValue(undefined),
  mockMarkAgentActionSubmitted: vi.fn().mockResolvedValue(undefined),
  mockCompleteAgentActionAttempt: vi.fn().mockResolvedValue(undefined),
  mockRecordAgentActionsBatch: vi.fn().mockResolvedValue([{ id: "action_1" }]),
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
  beginAgentActionAttempt: mockBeginAgentActionAttempt,
  authorizeAgentActionDispatch: mockAuthorizeAgentActionDispatch,
  markAgentActionSubmitted: mockMarkAgentActionSubmitted,
  recordAgentActionsBatch: mockRecordAgentActionsBatch,
  summarizeJournaledActions: vi.fn().mockResolvedValue(undefined),
  completeAgentActionAttempt: mockCompleteAgentActionAttempt,
  recordAgentTurnUsage: vi.fn().mockResolvedValue(undefined),
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
  const receipt = (
    tool: "add_internal_note" | "send_reply" | "send_email" | "update_thread_status" | "update_thread_tag",
    execution: { operationId: string; executionId: string } | undefined,
    facts: Record<string, unknown>,
    providerReference = "thread_1",
  ) => execution ? {
    version: 1 as const,
    operationId: execution.operationId,
    executionId: execution.executionId,
    tool,
    target: { kind: "thread", id: "thread_1" },
    observedAt: "2026-09-15T07:00:00.000Z",
    providerReference,
    outcome: "succeeded" as const,
    facts,
  } : undefined;
  return {
    addInternalNote: vi.fn(async (_input, execution) => ({ status: "ok", message: "Note added.", receipt: receipt("add_internal_note", execution, { threadId: "thread_1", messageId: "message_1", contentSha256: "a".repeat(64) }, "message_1") })),
    sendReply: vi.fn(async (_input, execution) => ({ status: "ok", message: "Reply sent to customer via email.", receipt: receipt("send_reply", execution, { logicalResponseId: "message_1", messageId: "message_1", threadId: "thread_1", destination: { kind: "thread", id: "thread_1" }, contentSha256: "b".repeat(64), deliveryState: "sent", providerMessageId: null }, "message_1") })),
    sendEmail: vi.fn().mockResolvedValue({ status: "ok", message: "Email sent." }),
    updateThreadStatus: vi.fn(async (_input, execution) => ({ status: "ok", message: "Status updated.", receipt: receipt("update_thread_status", execution, { threadId: "thread_1", beforeStatus: "open", afterStatus: "closed" }) })),
    updateThreadTag: vi.fn(async (_input, execution) => ({ status: "ok", message: "Tag updated.", receipt: receipt("update_thread_tag", execution, { threadId: "thread_1", beforeTag: null, afterTag: "Refund" }) })),
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
    merchantPreferences: [],
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
  mockBeginAgentActionAttempt.mockResolvedValue({ id: "action_1", operationId: "operation_1" });
  mockAuthorizeAgentActionDispatch.mockResolvedValue(undefined);
  mockMarkAgentActionSubmitted.mockResolvedValue(undefined);
  mockCompleteAgentActionAttempt.mockResolvedValue(undefined);
  mockRecordAgentActionsBatch.mockResolvedValue([{ id: "action_1" }]);
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
        channelType: "operator",
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
        channelType: "operator",
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

});

describe("runAgent loop behavior", () => {
  it("executes pre-approved tool calls without starting another model loop", async () => {
    const ctx = makeCtx();

    const result = await runAgent(
      ctx,
      "Execute plan",
      [{ id: "pre_1", name: "add_internal_note", input: { text: "Pre-approved note" } }],
    );

    expect(mockCreate).not.toHaveBeenCalled();
    expect(ctx.io?.addInternalNote).toHaveBeenCalledWith({ text: "Pre-approved note" }, expect.any(Object));
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
    expect(mockBeginAgentActionAttempt.mock.calls.at(-1)?.[0]).toMatchObject({
      action: { tool: "test_control_tool", category: "action" },
    });
  });

  it("preserves the provider operation key on the action audit entry", async () => {
    const moduleExecute = vi.fn().mockResolvedValue({ status: "ok", message: "control effected." });
    const controlTool = makeModuleTool(moduleExecute);
    mockCreate
      .mockResolvedValueOnce(toolUse("test_control_tool", { guidance: "send it" }, "tool_call_7"))
      .mockResolvedValueOnce(endTurn("All set."));

    const result = await runAgent(
      makeCtx({ shopify: { shop: "test.myshopify.com", accessToken: "test" } }),
      "approve it",
      undefined,
      undefined,
      {
        executionId: "execution_42",
        moduleTools: { test_control_tool: controlTool },
      },
    );

    const providerOperationKey = moduleExecute.mock.calls[0]?.[1]?.shopify?.operationId;
    expect(providerOperationKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.actionsPerformed[0]?.providerOperationKey).toBe(providerOperationKey);
    expect(mockBeginAgentActionAttempt.mock.calls.at(-1)?.[0]).toMatchObject({
      operationId: providerOperationKey,
      action: { providerOperationKey },
    });
    expect(mockAuthorizeAgentActionDispatch).toHaveBeenCalledWith({
      id: "action_1",
      operationId: "operation_1",
    });
    expect(mockMarkAgentActionSubmitted).toHaveBeenCalledWith({
      id: "action_1",
      operationId: "operation_1",
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

it('keeps a completed action journaled when the following model call fails', async () => {
  const { completeAgentActionAttempt, recordAgentTurnUsage } = await import('./agent-actions.js');
  mockCreate.mockResolvedValueOnce(toolUse('send_reply', { text: 'Sent once' })).mockRejectedValueOnce(new Error('model unavailable'));
  const ctx = makeCtx();
  await expect(runAgent(ctx, 'Reply')).rejects.toThrow('model unavailable');
  expect(ctx.io?.sendReply).toHaveBeenCalledOnce();
  expect(mockBeginAgentActionAttempt).toHaveBeenCalledOnce();
  expect(completeAgentActionAttempt).toHaveBeenCalledWith(
    { id: 'action_1', operationId: 'operation_1' },
    expect.objectContaining({ status: 'success' }),
  );
  expect(recordAgentTurnUsage).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'error' }));
});

it('does not execute a mutation when the attempt cannot be persisted', async () => {
  mockBeginAgentActionAttempt.mockRejectedValueOnce(new Error('database unavailable'));
  const ctx = makeCtx();
  await expect(runAgent(ctx, 'Reply', [{ id: 'send', name: 'send_reply', input: { text: 'hello' } }])).rejects.toThrow('database unavailable');
  expect(ctx.io?.sendReply).not.toHaveBeenCalled();
});

it('checks ownership again between mutations in the same approved batch', async () => {
  const ctx = makeCtx();
  let lost = false;
  ctx.assertExecutionAllowed = () => { if (lost) throw new Error('lost lease'); };
  vi.mocked(ctx.io!.sendReply).mockImplementationOnce(async () => { lost = true; return { status: 'ok', message: 'sent' }; });
  await expect(runAgent(ctx, 'Reply and close', [
    { id: 'send', name: 'send_reply', input: { text: 'hello' } },
    { id: 'close', name: 'update_thread_status', input: { status: 'closed' } },
  ])).rejects.toThrow('lost lease');
  expect(ctx.io?.updateThreadStatus).not.toHaveBeenCalled();
});
