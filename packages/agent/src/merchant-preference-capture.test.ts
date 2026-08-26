import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inferMerchantPreferenceCategory,
  looksLikeReusableJudgment,
  looksLikeVoiceRevision,
  shouldCaptureObservedMerchantPreference,
} from "./merchant-preference-capture.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("merchant-preference-capture", () => {
  it("ignores tone-only revisions", () => {
    expect(looksLikeVoiceRevision("Make the reply warmer and friendlier")).toBe(true);
    expect(looksLikeReusableJudgment("Make the reply warmer and friendlier")).toBe(false);
  });

  it("accepts reusable judgment guidance", () => {
    const guidance = "Always offer store credit instead of refunds for minor defects under $20.";
    expect(looksLikeReusableJudgment(guidance)).toBe(true);
    expect(inferMerchantPreferenceCategory(guidance)).toBe("compensation");
  });

  it("requires the observed-proposals flag and skips Q&A answers", () => {
    const guidance = "Always offer store credit instead of refunds for minor defects under $20.";
    expect(shouldCaptureObservedMerchantPreference({
      organizationId: "org",
      guidance,
      hasPendingQuestion: true,
    })).toBe(false);

    vi.stubEnv("MERCHANT_PREFERENCE_OBSERVED_PROPOSALS", "true");
    expect(shouldCaptureObservedMerchantPreference({
      organizationId: "org",
      guidance,
      hasPendingQuestion: true,
    })).toBe(false);
    expect(shouldCaptureObservedMerchantPreference({
      organizationId: "org",
      guidance,
      hasPendingQuestion: false,
    })).toBe(true);
  });
});
