import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installAgentLogger, resetAgentLoggerForTests, type AgentLogger } from "./logger.js";
import { runAgentLoop, type ToolExecMode } from "./agent-loop.js";
import { SONNET_MODEL } from "./ai/index.js";
import { createModelUsageMetrics } from "./usage.js";
import type { BaseAgentContext } from "./agent-context.js";
import { completesAtMerchantFollowUp } from "./planner-evidence.js";

const { mockCreate, mockRecordSpend } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockRecordSpend: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    messages = { create: mockCreate };
  },
}));

vi.mock("./spend.js", () => ({
  recordSpend: mockRecordSpend,
}));

function endTurn(text: string, usage: Record<string, number>) {
  return { stop_reason: "end_turn", content: [{ type: "text", text }], usage };
}

function toolUse(usage: Record<string, number>, id = "tu_1") {
  return {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id, name: "get_shopify_orders", input: {} }],
    usage,
  };
}

function makeLogger(): AgentLogger {
  return { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

const ctx = { orgId: "org_1" } as unknown as BaseAgentContext;

function runExecuteLoop(runTools: RunTools) {
  return runAgentLoop({
    ctx,
    mode: "execute",
    messages: [{ role: "user", content: "go" }],
    systemPromptBlocks: [],
    tools: [],
    model: "test-model",
    maxIterations: 10,
    maxTokensPerCall: 4096,
    tokenBudget: 100,
    usageTotals: createModelUsageMetrics(),
    runTools,
    getEscalationReason: () => null,
  });
}

type RunTools = NonNullable<Parameters<typeof runAgentLoop>[0]["runTools"]>;

const toolResult: RunTools = async (calls) =>
  calls.map((c) => ({ type: "tool_result" as const, tool_use_id: c.id, content: "ok" }));

beforeEach(() => {
  mockCreate.mockReset();
  mockRecordSpend.mockResolvedValue(undefined);
  installAgentLogger(makeLogger());
});

afterEach(() => {
  resetAgentLoggerForTests();
  vi.clearAllMocks();
});

// Asserts the loop actually spreads the resolved tuning into the request.
// Deleting the spread in agent-loop.ts passes every other test here — they all
// run on a model id the tuning table doesn't know, so they expect no parameters
// either way.
describe("runAgentLoop model tuning", () => {
  const requestBody = () => mockCreate.mock.calls[0][0] as Record<string, unknown>;

  async function runOnce(model: string, mode: ToolExecMode) {
    mockCreate.mockResolvedValueOnce(endTurn("done", { input_tokens: 1, output_tokens: 1 }));
    await runAgentLoop({
      ctx,
      mode,
      messages: [{ role: "user", content: "go" }],
      systemPromptBlocks: [],
      tools: [],
      model,
      maxIterations: 10,
      maxTokensPerCall: 4096,
      tokenBudget: 100,
      usageTotals: createModelUsageMetrics(),
      runTools: toolResult,
      getEscalationReason: () => null,
    });
  }

  beforeEach(() => {
    vi.stubEnv("AGENT_MODEL_EFFORT", "medium");
    vi.stubEnv("AGENT_PLANNER_THINKING", "disabled");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends effort and thinking on a planning call", async () => {
    await runOnce(SONNET_MODEL, "capture");

    expect(requestBody()).toMatchObject({
      output_config: { effort: "medium" },
      thinking: { type: "disabled" },
    });
  });
});

describe("runAgentLoop transcript caching", () => {
  // The messages array grows by an assistant turn plus its tool results every
  // iteration, and used to be re-sent uncached each time: one 7KB knowledge-base
  // article on a four-call operator turn re-read itself three times and pushed
  // the turn past TOKEN_BUDGET. Top-level cache_control auto-places the
  // breakpoint on the last cacheable block, so each call writes only its delta.
  it("asks for the transcript to be cached on every call", async () => {
    mockCreate
      .mockResolvedValueOnce(toolUse({ input_tokens: 10, output_tokens: 0 }))
      .mockResolvedValueOnce(endTurn("Done.", { input_tokens: 10, output_tokens: 0 }));

    await runExecuteLoop(vi.fn(toolResult));

    expect(mockCreate).toHaveBeenCalledTimes(2);
    for (const [params] of mockCreate.mock.calls) {
      expect(params.cache_control).toEqual({ type: "ephemeral" });
    }
  });
});

describe("runAgentLoop token budget", () => {
  it("returns end_turn with the finished answer even when the budget is exhausted", async () => {
    // 200 weighted budget tokens >= the 100 budget, but the turn ended cleanly.
    mockCreate.mockResolvedValueOnce(endTurn("Here is your answer.", { input_tokens: 200, output_tokens: 0 }));
    const runTools = vi.fn(toolResult);

    const result = await runExecuteLoop(runTools);

    expect(result.stop).toBe("end_turn");
    expect(result.finalText).toBe("Here is your answer.");
    expect(runTools).not.toHaveBeenCalled();
  });

  it("returns token_budget when a tool-using loop would keep iterating over budget", async () => {
    // Iter 0: 60 weighted tokens (< 100), runs tools and continues.
    // Iter 1: 120 accumulated (>= 100) with more tool calls pending -> stop.
    mockCreate
      .mockResolvedValueOnce(toolUse({ input_tokens: 60, output_tokens: 0 }))
      .mockResolvedValueOnce(toolUse({ input_tokens: 60, output_tokens: 0 }));
    const runTools = vi.fn(toolResult);

    const result = await runExecuteLoop(runTools);

    expect(result.stop).toBe("token_budget");
    // The over-budget iteration stops before its tools run: only iter 0 executed.
    expect(runTools).toHaveBeenCalledTimes(1);
  });
});

it('does not start another attempt after its shared token budget has been spent', async () => {
  const usageTotals = createModelUsageMetrics();
  usageTotals.budgetTokens = 100;
  const result = await runAgentLoop({ ctx, mode: 'capture', messages: [], systemPromptBlocks: [], tools: [],
    model: 'test', maxIterations: 10, maxTokensPerCall: 100, tokenBudget: 100, usageTotals });
  expect(result.stop).toBe('token_budget');
  expect(mockCreate).not.toHaveBeenCalled();
});

it('refuses a new model call once the shared planning deadline expires', async () => {
  const signal = AbortSignal.abort(new Error('planning deadline'));
  await expect(runAgentLoop({ ctx, mode: 'capture', messages: [], systemPromptBlocks: [], tools: [],
    model: 'test', maxIterations: 10, maxTokensPerCall: 100, signal })).rejects.toThrow('planning deadline');
  expect(mockCreate).not.toHaveBeenCalled();
});

// The durable budget must bracket the provider call: reserved before, charged
// after, and a stop observed by the reservation ends the turn without another.
describe("runAgentLoop durable task budget", () => {
  it("reserves before each call and records the measured usage after", async () => {
    const calls: string[] = [];
    const taskBudget = {
      reserveModelCall: vi.fn(async () => { calls.push("reserve"); }),
      recordModelUsage: vi.fn(async () => { calls.push("record"); }),
    };
    let iteration = 0;
    mockCreate.mockImplementation(async () => {
      calls.push("provider");
      iteration += 1;
      return iteration === 1
        ? toolUse({ input_tokens: 10, output_tokens: 4 })
        : endTurn("done", { input_tokens: 6, output_tokens: 2 });
    });

    await runAgentLoop({
      ctx: { orgId: "org_1", taskBudget } as unknown as BaseAgentContext,
      mode: "execute",
      messages: [{ role: "user", content: "go" }],
      systemPromptBlocks: [],
      tools: [],
      model: "test-model",
      maxIterations: 10,
      maxTokensPerCall: 4096,
      usageTotals: createModelUsageMetrics(),
      runTools: toolResult,
      getEscalationReason: () => null,
    });

    expect(calls).toEqual(["reserve", "provider", "record", "reserve", "provider", "record"]);
    expect(taskBudget.recordModelUsage).toHaveBeenLastCalledWith(
      expect.objectContaining({ inputTokens: 6, outputTokens: 2 }),
      "test-model",
    );
  });

  it("stops the turn when the reservation is refused", async () => {
    mockCreate.mockResolvedValue(endTurn("done", { input_tokens: 1, output_tokens: 1 }));
    const taskBudget = {
      reserveModelCall: vi.fn(async () => { throw new Error("Task stopped: cancelled."); }),
      recordModelUsage: vi.fn(async () => {}),
    };

    await expect(runAgentLoop({
      ctx: { orgId: "org_1", taskBudget } as unknown as BaseAgentContext,
      mode: "execute",
      messages: [{ role: "user", content: "go" }],
      systemPromptBlocks: [],
      tools: [],
      model: "test-model",
      maxIterations: 10,
      maxTokensPerCall: 4096,
      usageTotals: createModelUsageMetrics(),
      runTools: toolResult,
      getEscalationReason: () => null,
    })).rejects.toThrow("Task stopped: cancelled.");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("runAgentLoop capture reply refusal", () => {
  const usage = { input_tokens: 1, output_tokens: 1 };
  const propose = (id: string, name: string, input: Record<string, unknown>) => ({
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id, name, input }],
    usage,
  });
  const runCapture = (refusal: string | null) => runAgentLoop({
    ctx,
    mode: "capture",
    messages: [{ role: "user", content: "go" }],
    systemPromptBlocks: [],
    tools: [],
    model: "test-model",
    maxIterations: 10,
    maxTokensPerCall: 4096,
    usageTotals: createModelUsageMetrics(),
    captureRefuseReply: () => refusal,
  });

  it("refuses the reply, returns the reason to the model, and records what it does instead", async () => {
    mockCreate
      .mockResolvedValueOnce(propose("tu_reply", "send_reply", { text: "Trim the wick." }))
      .mockResolvedValueOnce(propose("tu_ask", "ask_operator", { question: "Do you recommend a first-burn time?" }));

    const result = await runCapture("Not sent. Ask the merchant.");

    expect(result.stop).toBe("terminal_captured");
    expect(result.rawToolCalls.map((call) => call.name)).toEqual(["ask_operator"]);
    // The loop mutates one messages array, so read it rather than a request snapshot.
    const request = mockCreate.mock.calls[1][0] as { messages: { role: string; content: unknown }[] };
    expect(request.messages).toContainEqual({
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: "tu_reply",
        content: "Not sent. Ask the merchant.",
        is_error: true,
      }],
    });
  });

  it("refuses once, then records a repeated reply for routing to catch", async () => {
    mockCreate
      .mockResolvedValueOnce(propose("tu_1", "send_reply", { text: "First." }))
      .mockResolvedValueOnce(propose("tu_2", "send_reply", { text: "Second." }));

    const result = await runCapture("Not sent.");

    expect(result.stop).toBe("terminal_captured");
    expect(result.rawToolCalls.map((call) => call.id)).toEqual(["tu_2"]);
  });

  it("records the reply when the gate allows it", async () => {
    mockCreate.mockResolvedValueOnce(propose("tu_1", "send_reply", { text: "Shipped Monday." }));

    const result = await runCapture(null);

    expect(result.rawToolCalls.map((call) => call.id)).toEqual(["tu_1"]);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe("runAgentLoop capture merchant follow-ups", () => {
  it.each([false, true])("honors a model-ended merchant handoff only for customer planning (merchant directed: %s)", async (merchantDirected) => {
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tu_exchange", name: "create_exchange", input: { order_id: "1041", variant_id: "501", exchange_variant_id: "502" } }],
        usage: { input_tokens: 1, output_tokens: 1 },
      })
      .mockResolvedValueOnce(endTurn("The merchant has the remaining return shipping work.", { input_tokens: 1, output_tokens: 1 }))
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tu_reply", name: "send_reply", input: { text: "Merchant-directed reply." } }],
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    const result = await runAgentLoop({
      ctx, mode: "capture", messages: [{ role: "user", content: "go" }], systemPromptBlocks: [],
      tools: [], model: "test-model", maxIterations: 10, maxTokensPerCall: 4096,
      usageTotals: createModelUsageMetrics(), captureReprompt: true,
      captureCompleteTurn: proposal => completesAtMerchantFollowUp({
        merchantDirected, modelEndedTurn: proposal.modelEndedTurn,
        rawToolCalls: proposal.rawToolCalls, readBlocks: proposal.readBlocks, readStatusMap: proposal.readStatus,
      }),
    });
    expect(result.reprompted).toBe(merchantDirected);
    expect(result.rawToolCalls.map(call => call.name)).toEqual(merchantDirected
      ? ["create_exchange", "send_reply"] : ["create_exchange"]);
    expect(result.stop).toBe(merchantDirected ? "terminal_captured" : "end_turn");
  });

  it.each([false, true])("reports only outstanding label work while recording proposals without execution (label supplied: %s)", async (labelSupplied) => {
    const proposed = [
      { type: "tool_use", id: "tu_exchange", name: "create_exchange", input: { order_id: "1041", variant_id: "501", exchange_variant_id: "502" } },
      ...(labelSupplied ? [{ type: "tool_use", id: "tu_label", name: "attach_return_label", input: { order_id: "1041", label_url: "https://example.test/label.pdf" } }] : []),
    ];
    mockCreate
      .mockResolvedValueOnce({ stop_reason: "tool_use", content: proposed, usage: { input_tokens: 1, output_tokens: 1 } })
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tu_reply", name: "send_reply", input: { text: "The exchange is open." } }],
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    const runTools = vi.fn(toolResult);
    const result = await runAgentLoop({
      ctx, mode: "capture", messages: [{ role: "user", content: "go" }], systemPromptBlocks: [],
      tools: [], model: "test-model", maxIterations: 10, maxTokensPerCall: 4096,
      usageTotals: createModelUsageMetrics(), runTools,
    });

    const request = mockCreate.mock.calls[1][0] as {
      messages: { role: string; content: { type: string; tool_use_id?: string; content?: string }[] | string }[];
    };
    const feedback = request.messages.flatMap(message => Array.isArray(message.content) ? message.content : [])
      .find(block => block.type === "tool_result" && block.tool_use_id === "tu_exchange")!.content!;
    expect(feedback).toContain("Not executed during planning.");
    if (labelSupplied) {
      expect(feedback).not.toContain("merchant_follow_up");
    } else {
      expect(JSON.parse(feedback.split("\n").at(-1)!)).toEqual({
        merchant_follow_up: {
          kind: "send_return_label", status: "requires_merchant",
          scheduledByTool: false, customerCommitmentEstablishedByTool: false,
        },
      });
    }
    expect(runTools).not.toHaveBeenCalled();
    expect(result.rawToolCalls.map(call => call.id)).toEqual([...proposed.map(block => block.id), "tu_reply"]);
  });
});

describe("runAgentLoop capture turn completion", () => {
  it("ends the turn at a complete plan and leaves out the question proposed beside it", async () => {
    mockCreate.mockResolvedValueOnce({
      stop_reason: "tool_use",
      content: [
        { type: "tool_use", id: "tu_return", name: "create_return", input: { order_id: "1042" } },
        { type: "tool_use", id: "tu_ask", name: "ask_operator", input: { question: "Can you send a label URL?" } },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    const result = await runAgentLoop({
      ctx,
      mode: "capture",
      messages: [{ role: "user", content: "go" }],
      systemPromptBlocks: [],
      tools: [],
      model: "test-model",
      maxIterations: 10,
      maxTokensPerCall: 4096,
      usageTotals: createModelUsageMetrics(),
      captureCompleteTurn: ({ rawToolCalls }) => rawToolCalls.some((call) => call.name === "create_return"),
    });

    expect(result.stop).toBe("terminal_captured");
    expect(result.rawToolCalls.map((call) => call.name)).toEqual(["create_return"]);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
