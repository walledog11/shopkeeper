import { describe, expect, it } from "vitest";
import { budgetMerchantPreferences } from "./merchant-preferences.js";

describe("merchant-preferences", () => {
  it("budgets preference count and total character load", () => {
    const longGuidance = "x".repeat(600);
    const { preferences, stats } = budgetMerchantPreferences([
      { id: "1", category: "general", guidance: longGuidance },
      { id: "2", category: "policy", guidance: "Always honor student discounts." },
    ], {
      maxCount: 1,
      maxTotalChars: 100,
      maxGuidanceChars: 100,
    });

    expect(preferences).toHaveLength(1);
    expect(preferences[0]?.guidance.length).toBeLessThanOrEqual(100);
    expect(stats.truncated).toBe(true);
  });
});
