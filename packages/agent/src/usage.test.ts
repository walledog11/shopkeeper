import { describe, expect, it } from "vitest";
import { createModelUsageMetrics, readModelUsage, recordModelUsage } from "./usage.js";

describe("readModelUsage budgetTokens weighting", () => {
  it("weights cache creation at 1.25x and cache reads at 0.1x", () => {
    const usage = readModelUsage({
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 200,
        cache_read_input_tokens: 4000,
      },
    });

    // totalTokens counts every token at full weight (spend/logging continuity).
    expect(usage.totalTokens).toBe(4350);
    // budgetTokens: 100 + 50 + 1.25*200 + 0.1*4000 = 800
    expect(usage.budgetTokens).toBe(800);
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
