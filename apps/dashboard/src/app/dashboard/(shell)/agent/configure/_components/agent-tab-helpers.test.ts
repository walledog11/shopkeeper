import { describe, expect, it } from "vitest";
import { AGENT_SETTINGS_DEFAULTS } from "@shopkeeper/agent/settings";
import type { OrgSettings } from "@/types";
import {
  applyTierDefaultsToInheritedSettings,
  agentSettingsReducer,
  buildAgentSettingsPatch,
  buildSettingsPayload,
  collectExplicitOverridePaths,
  hydrateSettings,
  rawInputsFor,
  resetPathToTierDefault,
} from "./agent-tab-helpers";

function makeSettings(overrides: Partial<OrgSettings> = {}): OrgSettings {
  return {
    ...AGENT_SETTINGS_DEFAULTS,
    ...overrides,
    toolsEnabled: {
      ...AGENT_SETTINGS_DEFAULTS.toolsEnabled,
      ...(overrides.toolsEnabled ?? {}),
    },
  };
}

describe("agent tab helpers", () => {
  it("hydrates legacy timezone offsets into curated IANA timezones", () => {
    const hydrated = hydrateSettings(makeSettings({
      digestTimezone: "Etc/GMT+5",
      digestTimezoneOffset: -5,
      businessHoursTimezoneOffset: -8,
    }));

    expect(hydrated.digestTimezone).toBe("America/New_York");
    expect(hydrated.businessHoursTimezone).toBe("America/Los_Angeles");
  });

  it("preserves explicit non-curated IANA timezones", () => {
    const hydrated = hydrateSettings(makeSettings({
      digestTimezone: "America/Tijuana",
      businessHoursTimezone: "Asia/Kolkata",
      digestTimezoneOffset: -8,
      businessHoursTimezoneOffset: 5,
    }));

    expect(hydrated.digestTimezone).toBe("America/Tijuana");
    expect(hydrated.businessHoursTimezone).toBe("Asia/Kolkata");
  });

  it("builds the API payload from text inputs", () => {
    const payload = buildSettingsPayload(
      makeSettings({ agentName: "   " }),
      {
        maxRefund: "12.50",
        maxDiscount: "15",
        dailyRefundCap: "",
        dailyLLMSpendCap: "not-a-number",
        maxIter: "0",
        digestHour: "99",
        digestSecondHour: "",
        bhStart: "bad",
        bhEnd: "-3",
      }
    );

    expect(payload.agentName).toBe("Shopkeeper");
    expect(payload.maxRefundAmount).toBe(12.5);
    expect(payload.maxDiscountPercent).toBe(15);
    expect(payload.dailyRefundCap).toBeNull();
    expect(payload.dailyLLMSpendCapUsd).toBeNull();
    expect(payload.maxIterations).toBe(10);
    expect(payload.digestHour).toBe(23);
    expect(payload.digestSecondHour).toBe(17);
    expect(payload.businessHoursStart).toBe(9);
    expect(payload.businessHoursEnd).toBe(0);
  });

  it("serializes settings into raw form inputs", () => {
    const raw = rawInputsFor(makeSettings({
      maxRefundAmount: null,
      dailyRefundCap: 200,
      dailyLLMSpendCapUsd: 20,
      maxIterations: 7,
      digestHour: 10,
      digestSecondHour: 18,
      businessHoursStart: 6,
      businessHoursEnd: 14,
    }));

    expect(raw).toEqual({
      maxRefund: "",
      maxDiscount: "",
      dailyRefundCap: "200",
      dailyLLMSpendCap: "20",
      maxIter: "7",
      digestHour: "10",
      digestSecondHour: "18",
      bhStart: "6",
      bhEnd: "14",
    });
  });

  it("applies set and reset reducer actions", () => {
    const base = makeSettings({ agentName: "Shopkeeper" });
    const changed = agentSettingsReducer(base, { type: "set", patch: { agentName: "Ada" } });
    const reset = agentSettingsReducer(changed, { type: "reset", payload: base });

    expect(changed.agentName).toBe("Ada");
    expect(base.agentName).toBe("Shopkeeper");
    expect(reset).toBe(base);
  });

  it("collects explicit autonomy override paths from raw settings", () => {
    const explicit = collectExplicitOverridePaths({
      maxRefundAmount: 75,
      toolsEnabled: { action: false } as OrgSettings["toolsEnabled"],
    });

    expect(explicit).toEqual(["maxRefundAmount", "toolsEnabled.action"]);
  });

  it("updates inherited autonomy fields when the tier changes", () => {
    const next = applyTierDefaultsToInheritedSettings(
      makeSettings({
        autonomyTier: "guarded",
        maxRefundAmount: 50,
        requireApprovalForActions: true,
        toolsEnabled: { action: true, communication: true, internal: true, read: true },
      }),
      "trusted",
      [],
    );

    expect(next.autonomyTier).toBe("trusted");
    expect(next.maxRefundAmount).toBe(100);
    expect(next.requireApprovalForActions).toBe(false);
    expect(next.toolsEnabled).toEqual({
      action: true,
      communication: true,
      internal: true,
      read: true,
    });
  });

  it("preserves explicit autonomy overrides when the tier changes", () => {
    const next = applyTierDefaultsToInheritedSettings(
      makeSettings({
        autonomyTier: "guarded",
        maxRefundAmount: 75,
        requireApprovalForActions: true,
      }),
      "trusted",
      ["maxRefundAmount"],
    );

    expect(next.autonomyTier).toBe("trusted");
    expect(next.maxRefundAmount).toBe(75);
    expect(next.requireApprovalForActions).toBe(false);
  });

  it("resets an override to the current tier default", () => {
    const reset = resetPathToTierDefault(
      makeSettings({ autonomyTier: "trusted", maxRefundAmount: 250 }),
      "maxRefundAmount",
    );

    expect(reset.maxRefundAmount).toBe(100);
  });

  it("builds a persistence patch that omits inherited override fields", () => {
    const patch = buildAgentSettingsPatch(
      makeSettings({
        autonomyTier: "trusted",
        maxRefundAmount: 150,
        requireApprovalForActions: false,
        toolsEnabled: {
          action: true,
          communication: true,
          internal: true,
          read: true,
        },
      }),
      ["maxRefundAmount", "toolsEnabled.action"],
    );

    expect(patch.settings.maxRefundAmount).toBe(150);
    expect(patch.settings.requireApprovalForActions).toBeUndefined();
    expect(patch.settings.toolsEnabled).toEqual({ action: true });
    expect(patch.settingsUnset).toContain("requireApprovalForActions");
    expect(patch.settingsUnset).toContain("toolsEnabled.communication");
    expect(patch.settingsUnset).not.toContain("maxRefundAmount");
  });
});
