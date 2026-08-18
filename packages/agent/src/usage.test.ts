import { describe, expect, it } from "vitest";
import { TOKEN_BUDGET } from "./run-policy.js";
import { createModelUsageMetrics, readModelUsage, recordModelUsage } from "./usage.js";

describe("readModelUsage budgetTokens weighting", () => {
  it("weights every cache write at 1.25x and cache reads at 0.1x, whatever the TTL split", () => {
    const usage = readModelUsage({
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 200,
        cache_creation: { ephemeral_1h_input_tokens: 160, ephemeral_5m_input_tokens: 40 },
        cache_read_input_tokens: 4000,
      },
    });

    // totalTokens counts every token at full weight (spend/logging continuity).
    expect(usage.totalTokens).toBe(4350);
    // The TTL split still reaches the pricing function...
    expect(usage.cacheCreation1hInputTokens).toBe(160);
    // ...but not the loop budget: 100 + 50 + 1.25*200 + 0.1*4000 = 800
    expect(usage.budgetTokens).toBe(800);
  });

  it("keeps the budget weight flat when no breakdown is sent", () => {
    const usage = readModelUsage({
      usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 200 },
    });

    expect(usage.cacheCreation1hInputTokens).toBe(200);
    // budgetTokens: 100 + 50 + 1.25*200 = 400
    expect(usage.budgetTokens).toBe(400);
  });

  it("treats an all-5m write as 1.25x", () => {
    const usage = readModelUsage({
      usage: {
        cache_creation_input_tokens: 200,
        cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 200 },
      },
    });

    expect(usage.cacheCreation1hInputTokens).toBe(0);
    expect(usage.budgetTokens).toBe(250);
  });

  it("rounds the weighted total", () => {
    const usage = readModelUsage({
      usage: { cache_read_input_tokens: 15 }, // 0.1 * 15 = 1.5 -> 2
    });

    expect(usage.budgetTokens).toBe(2);
  });

  it("treats missing usage fields as zero", () => {
    const usage = readModelUsage({ usage: { input_tokens: 10, output_tokens: 5 } });

    expect(usage.budgetTokens).toBe(15);
  });

  it("leaves a cold support write room to iterate inside TOKEN_BUDGET", () => {
    // Production's measured cold split-prompt call: the 1h stable prefix plus a
    // small 5m volatile block. agent-loop stops the run when budgetTokens tops
    // TOKEN_BUDGET, so weighting the one-time 1h write at 2x would end the turn
    // before its first tool call.
    const cold = readModelUsage({
      usage: {
        input_tokens: 83,
        output_tokens: 8,
        cache_creation_input_tokens: 11890,
        cache_creation: { ephemeral_1h_input_tokens: 11848, ephemeral_5m_input_tokens: 42 },
        cache_read_input_tokens: 0,
      },
    });

    expect(cold.budgetTokens).toBeLessThan(TOKEN_BUDGET);
  });
});

describe("recordModelUsage", () => {
  it("starts budgetTokens at zero and accumulates it across calls", () => {
    const metrics = createModelUsageMetrics();
    expect(metrics.budgetTokens).toBe(0);

    const response = {
      usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000 },
    };
    // each call weighted: 100 + 50 + 0.1*1000 = 250
    recordModelUsage(metrics, response);
    recordModelUsage(metrics, response);

    expect(metrics.budgetTokens).toBe(500);
    expect(metrics.modelCalls).toBe(2);
  });
});
