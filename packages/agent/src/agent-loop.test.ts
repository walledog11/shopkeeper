import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installAgentLogger, resetAgentLoggerForTests, type AgentLogger } from "./logger.js";
import { runAgentLoop, type ToolExecMode } from "./agent-loop.js";
import { HAIKU_MODEL, SONNET_MODEL } from "./ai/index.js";
import { createModelUsageMetrics } from "./usage.js";
import type { BaseAgentContext } from "./agent-context.js";

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

// The resolver is unit-tested in model-tuning.test.ts; this asserts the loop
// actually spreads it into the request. Without these, deleting the spread in
// agent-loop.ts passes the whole suite — every other test here runs on a model
// id the tuning table doesn't know, so it expects no parameters either way.
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

  it("sends effort but no thinking outside planning", async () => {
    await runOnce(SONNET_MODEL, "execute");

    expect(requestBody()).toMatchObject({ output_config: { effort: "medium" } });
    expect(requestBody()).not.toHaveProperty("thinking");
  });

  it("sends Haiku neither parameter", async () => {
    // Load-bearing: `effort` is a 400 on Haiku, and the low-risk planner tier
    // runs every plan it claims on this model.
    await runOnce(HAIKU_MODEL, "capture");

    expect(requestBody()).not.toHaveProperty("output_config");
    expect(requestBody()).not.toHaveProperty("thinking");
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
