import { describe, expect, it } from "vitest";
import {
  AGENT_SETTINGS_DEFAULTS,
  TIER_DEFAULTS,
  resolveAgentSettings,
  type AutonomyTier,
} from "./settings";

describe("resolveAgentSettings", () => {
  it("returns guarded-tier defaults when settings are null", () => {
    const resolved = resolveAgentSettings(null);
    expect(resolved.autonomyTier).toBe("guarded");
    expect(resolved.maxRefundAmount).toBe(TIER_DEFAULTS.guarded.maxRefundAmount);
    expect(resolved.requireApprovalForActions).toBe(true);
    expect(resolved.alwaysDraftReply).toBe(false);
  });

  it("returns guarded-tier defaults when settings are undefined", () => {
    const resolved = resolveAgentSettings(undefined);
    expect(resolved.autonomyTier).toBe("guarded");
  });

  it("preserves base defaults that are unrelated to autonomy", () => {
    const resolved = resolveAgentSettings(null);
    expect(resolved.agentName).toBe(AGENT_SETTINGS_DEFAULTS.agentName);
    expect(resolved.maxIterations).toBe(AGENT_SETTINGS_DEFAULTS.maxIterations);
    expect(resolved.replyLanguage).toBe(AGENT_SETTINGS_DEFAULTS.replyLanguage);
  });

  describe("per-tier defaults", () => {
    const cases: Array<{ tier: AutonomyTier; maxRefund: number; requireApproval: boolean; alwaysDraft: boolean }> = [
      { tier: "watch",   maxRefund: 0,    requireApproval: true,  alwaysDraft: true  },
      { tier: "guarded", maxRefund: 50,   requireApproval: true,  alwaysDraft: false },
      { tier: "trusted", maxRefund: 100,  requireApproval: false, alwaysDraft: false },
      { tier: "broad",   maxRefund: 250,  requireApproval: false, alwaysDraft: false },
      { tier: "full",    maxRefund: 1000, requireApproval: false, alwaysDraft: false },
    ];

    for (const { tier, maxRefund, requireApproval, alwaysDraft } of cases) {
      it(`applies ${tier}-tier defaults`, () => {
        const resolved = resolveAgentSettings({ autonomyTier: tier });
        expect(resolved.autonomyTier).toBe(tier);
        expect(resolved.maxRefundAmount).toBe(maxRefund);
        expect(resolved.requireApprovalForActions).toBe(requireApproval);
        expect(resolved.alwaysDraftReply).toBe(alwaysDraft);
      });
    }
  });

  it("applies watch-tier toolsEnabled defaults (action + communication blocked)", () => {
    const resolved = resolveAgentSettings({ autonomyTier: "watch" });
    expect(resolved.toolsEnabled).toEqual({
      action: false,
      communication: false,
      internal: true,
      read: true,
    });
  });

  it("leaves toolsEnabled at base defaults for tiers that do not override it", () => {
    const resolved = resolveAgentSettings({ autonomyTier: "trusted" });
    expect(resolved.toolsEnabled).toEqual(AGENT_SETTINGS_DEFAULTS.toolsEnabled);
  });

  it("lets explicit settings override tier defaults", () => {
    const resolved = resolveAgentSettings({ autonomyTier: "watch", maxRefundAmount: 100 });
    expect(resolved.autonomyTier).toBe("watch");
    // Override wins over watch-tier default of 0.
    expect(resolved.maxRefundAmount).toBe(100);
    // Other watch-tier defaults still apply.
    expect(resolved.alwaysDraftReply).toBe(true);
    expect(resolved.requireApprovalForActions).toBe(true);
  });

  it("lets explicit toolsEnabled override tier-level toolsEnabled", () => {
    const resolved = resolveAgentSettings({
      autonomyTier: "watch",
      toolsEnabled: { action: true, communication: true, internal: true, read: true },
    });
    expect(resolved.toolsEnabled).toEqual({
      action: true,
      communication: true,
      internal: true,
      read: true,
    });
  });

  it("merges partial toolsEnabled overrides on top of tier defaults", () => {
    const resolved = resolveAgentSettings({
      autonomyTier: "watch",
      toolsEnabled: { action: true } as never,
    });
    expect(resolved.toolsEnabled).toEqual({
      action: true,
      communication: false,
      internal: true,
      read: true,
    });
  });

  it("falls back to guarded tier when autonomyTier is an unknown value", () => {
    const resolved = resolveAgentSettings({ autonomyTier: "bogus" as AutonomyTier });
    expect(resolved.autonomyTier).toBe("guarded");
    expect(resolved.maxRefundAmount).toBe(TIER_DEFAULTS.guarded.maxRefundAmount);
  });

  it("preserves non-autonomy explicit fields", () => {
    const resolved = resolveAgentSettings({
      autonomyTier: "trusted",
      agentName: "Ada",
      maxIterations: 5,
      brandVoice: "warm",
    });
    expect(resolved.agentName).toBe("Ada");
    expect(resolved.maxIterations).toBe(5);
    expect(resolved.brandVoice).toBe("warm");
  });
});
