import { describe, expect, it } from "vitest";
import { createModelUsageMetrics, readModelUsage, recordModelUsage } from "./usage.js";

describe("readModelUsage budgetTokens weighting", () => {
  it("weights 1h cache writes at 2x, 5m writes at 1.25x, and cache reads at 0.1x", () => {
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
    expect(usage.cacheCreation1hInputTokens).toBe(160);
    // budgetTokens: 100 + 50 + 2*160 + 1.25*40 + 0.1*4000 = 920
    expect(usage.budgetTokens).toBe(920);
  });

  it("charges the whole cache-creation total at the 1h weight when no breakdown is sent", () => {
    const usage = readModelUsage({
      usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 200 },
    });

    expect(usage.cacheCreation1hInputTokens).toBe(200);
    // budgetTokens: 100 + 50 + 2*200 = 550 — never cheaper than reality.
    expect(usage.budgetTokens).toBe(550);
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
