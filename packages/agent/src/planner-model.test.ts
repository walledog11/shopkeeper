import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentContext } from "./agent-context.js";
import { HAIKU_MODEL, SONNET_MODEL } from "./ai/index.js";
import { runPlannerModelCall } from "./planner-model.js";
import { createModelUsageMetrics } from "./usage.js";

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

const ctx = {
  orgId: "org_1",
  thread: { id: "thread_1" },
} as AgentContext;

async function runOnce(model: string): Promise<Record<string, unknown>> {
  mockCreate.mockResolvedValueOnce({
    content: [],
    stop_reason: "end_turn",
    usage: { input_tokens: 1, output_tokens: 1 },
  });
  await runPlannerModelCall({
    ctx,
    usageTotals: createModelUsageMetrics(),
    model,
    maxTokens: 256,
    systemPromptBlocks: [],
    messages: [{ role: "user", content: "Draft the terminal reply." }],
    tools: [],
    phase: "test_redraft",
  });
  return mockCreate.mock.calls[0]![0] as Record<string, unknown>;
}

beforeEach(() => {
  mockCreate.mockReset();
  mockRecordSpend.mockReset().mockResolvedValue(undefined);
  vi.stubEnv("AGENT_MODEL_EFFORT", "medium");
  vi.stubEnv("AGENT_PLANNER_THINKING", "disabled");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runPlannerModelCall model tuning", () => {
  it("sends explicit effort and thinking on a Sonnet planner call", async () => {
    await expect(runOnce(SONNET_MODEL)).resolves.toMatchObject({
      output_config: { effort: "medium" },
      thinking: { type: "disabled" },
    });
  });

  it("does not send unsupported tuning parameters to Haiku", async () => {
    const request = await runOnce(HAIKU_MODEL);

    expect(request).not.toHaveProperty("output_config");
    expect(request).not.toHaveProperty("thinking");
  });
});
