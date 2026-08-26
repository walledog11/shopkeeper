import { describe, expect, it } from "vitest";
import {
  MERCHANT_PREFERENCE_SCOPE_NOTE,
  budgetMerchantPreferences,
  buildMerchantPreferencesPromptSection,
  formatProposedMerchantPreferencesBriefingLine,
} from "./merchant-preferences.js";

describe("merchant-preferences", () => {
  it("builds a bounded prompt section with scope guardrails", () => {
    const section = buildMerchantPreferencesPromptSection([
      {
        id: "pref_1",
        category: "compensation",
        guidance: "Offer a 10% gift card on first damaged-item complaints.",
      },
    ]);

    expect(section).toContain("## Merchant preferences");
    expect(section).toContain(MERCHANT_PREFERENCE_SCOPE_NOTE);
    expect(section).toContain("Compensation: Offer a 10% gift card");
  });

  it("returns an empty section when no active preferences are present", () => {
    expect(buildMerchantPreferencesPromptSection([])).toBe("");
  });

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

  it("formats proposed preference briefing copy for operator channels", () => {
    expect(formatProposedMerchantPreferencesBriefingLine([])).toBeNull();
    expect(formatProposedMerchantPreferencesBriefingLine([
      {
        id: "pref_1",
        category: "compensation",
        guidance: "Always offer store credit instead of refunds for minor defects under $20.",
        proposedRationale: "Observed from a plan revision.",
      },
    ])).toContain("Open Agent settings");
  });
});
