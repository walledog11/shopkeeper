import { describe, expect, it } from "vitest";
import { TOKEN_BUDGET } from "./run-policy.js";
import { createModelUsageMetrics, readModelUsage, recordModelUsage } from "./usage.js";

describe("readModelUsage budgetTokens weighting", () => {
  it("excludes the 1h stable-prefix write and weights 5m writes 1.25x, reads 0.1x", () => {
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
    // The 1h split still reaches the pricing function, which bills it at 2x...
    expect(usage.cacheCreation1hInputTokens).toBe(160);
    // ...but the loop budget drops it entirely, since the stable prefix is a
    // one-time startup write: 100 + 50 + 1.25*40 + 0.1*4000 = 600
    expect(usage.budgetTokens).toBe(600);
  });

  it("counts an unattributed write, inverting the pricing default", () => {
    // Pricing defaults a missing breakdown to all-1h so it never undercounts the
    // bill. The budget must default the other way: if this returned 0 the guard
    // would go blind whenever the API omitted `cache_creation`.
    const usage = readModelUsage({
      usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 200 },
    });

    expect(usage.cacheCreation1hInputTokens).toBe(200);
    // budgetTokens: 100 + 50 + 1.25*200 = 400 — the whole write counts.
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

  it("leaves a cold turn the same iteration headroom as a warm one", () => {
    // Production's measured pair for the same prompt. agent-loop stops the run
    // when budgetTokens tops TOKEN_BUDGET, so any gap between these two is
    // iteration headroom that depends on cache temperature rather than on what
    // the turn is doing. Cold used to burn 14,954 of 20,000 here.
    const cold = readModelUsage({
      usage: {
        input_tokens: 83,
        output_tokens: 8,
        cache_creation_input_tokens: 11890,
        cache_creation: { ephemeral_1h_input_tokens: 11848, ephemeral_5m_input_tokens: 42 },
        cache_read_input_tokens: 0,
      },
    });
    const warm = readModelUsage({
      usage: {
        input_tokens: 83,
        output_tokens: 8,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 11848,
      },
    });

    expect(cold.budgetTokens).toBe(144);
    // Both are a rounding error against the budget the loop actually needs.
    expect(cold.budgetTokens).toBeLessThan(TOKEN_BUDGET * 0.1);
    expect(warm.budgetTokens).toBeLessThan(TOKEN_BUDGET * 0.1);
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
