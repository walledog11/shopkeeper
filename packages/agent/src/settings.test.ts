import { describe, expect, it } from "vitest";
import {
  AGENT_SETTINGS_DEFAULTS,
  OrgSettingsValidationError,
  isWithinBusinessHours,
  normalizeStoredOrgSettings,
  parseOrgSettingsPatch,
  resolveAgentSettings,
} from "./settings.js";

describe("organization settings contract", () => {
  it("parses valid partial settings", () => {
    expect(parseOrgSettingsPatch({
      autoExecuteMode: "live",
      businessHoursEnabled: true,
      businessHoursDays: ["mon", "fri"],
      businessHoursStart: 9,
      businessHoursEnd: 17,
      businessHoursTimezone: "America/Los_Angeles",
      toolsEnabled: { action: false },
    })).toEqual({
      autoExecuteMode: "live",
      businessHoursEnabled: true,
      businessHoursDays: ["mon", "fri"],
      businessHoursStart: 9,
      businessHoursEnd: 17,
      businessHoursTimezone: "America/Los_Angeles",
      toolsEnabled: { action: false },
    });
  });

  it("rejects unknown keys and invalid field types in API patches", () => {
    expect(() => parseOrgSettingsPatch({
      autoExecuteEnabled: true,
      businessHoursDays: ["mon", "noday"],
      maxIterations: "ten",
      toolsEnabled: { action: true, deleteOrders: true },
      unexpected: true,
    })).toThrow(OrgSettingsValidationError);

    try {
      parseOrgSettingsPatch({
        autoExecuteEnabled: true,
        businessHoursDays: ["mon", "noday"],
        maxIterations: "ten",
        toolsEnabled: { action: true, deleteOrders: true },
        unexpected: true,
      });
    } catch (error) {
      expect((error as OrgSettingsValidationError).issues.map(issue => issue.path)).toEqual(
        expect.arrayContaining([
          "autoExecuteEnabled",
          "unexpected",
          "maxIterations",
          "toolsEnabled.deleteOrders",
          "businessHoursDays",
        ]),
      );
    }
  });

  it("repairs malformed historical settings and applies defaults", () => {
    const normalized = normalizeStoredOrgSettings({
      agentName: 42,
      autoExecuteEnabled: true,
      businessHoursEnabled: true,
      businessHoursDays: ["noday"],
      businessHoursStart: 9,
      businessHoursEnd: 9,
      businessHoursTimezone: "not-a-timezone",
      toolsEnabled: { action: false, read: "yes" },
      unexpected: true,
    });

    expect(normalized).toEqual({
      autoExecuteMode: "live",
      businessHoursEnabled: true,
      toolsEnabled: { action: false },
    });

    const resolved = resolveAgentSettings(normalized);
    expect(resolved.agentName).toBe(AGENT_SETTINGS_DEFAULTS.agentName);
    expect(resolved.businessHoursDays).toEqual(AGENT_SETTINGS_DEFAULTS.businessHoursDays);
    expect(resolved.businessHoursStart).toBe(AGENT_SETTINGS_DEFAULTS.businessHoursStart);
    expect(resolved.businessHoursEnd).toBe(AGENT_SETTINGS_DEFAULTS.businessHoursEnd);
    expect(resolved.businessHoursTimezone).toBeUndefined();
    expect(resolved.toolsEnabled).toEqual({
      action: false,
      communication: true,
      internal: true,
      read: true,
    });
  });
});

describe("business hours contract", () => {
  const enabled = resolveAgentSettings({
    businessHoursEnabled: true,
    businessHoursDays: ["wed"],
    businessHoursStart: 9,
    businessHoursEnd: 17,
    businessHoursTimezone: "UTC",
  });

  it("evaluates normal windows and closed days", () => {
    expect(isWithinBusinessHours(enabled, new Date("2026-06-03T16:00:00Z"))).toBe(true);
    expect(isWithinBusinessHours(enabled, new Date("2026-06-03T20:00:00Z"))).toBe(false);
    expect(isWithinBusinessHours(enabled, new Date("2026-06-04T16:00:00Z"))).toBe(false);
  });

  it("supports overnight windows using the selected day as the opening day", () => {
    const overnight = resolveAgentSettings({
      businessHoursEnabled: true,
      businessHoursDays: ["wed"],
      businessHoursStart: 22,
      businessHoursEnd: 6,
      businessHoursTimezone: "UTC",
    });

    expect(isWithinBusinessHours(overnight, new Date("2026-06-03T23:00:00Z"))).toBe(true);
    expect(isWithinBusinessHours(overnight, new Date("2026-06-04T05:00:00Z"))).toBe(true);
    expect(isWithinBusinessHours(overnight, new Date("2026-06-04T07:00:00Z"))).toBe(false);
  });

  it("treats an enabled schedule with no opening days as closed", () => {
    const closed = resolveAgentSettings({
      businessHoursEnabled: true,
      businessHoursDays: [],
      businessHoursStart: 9,
      businessHoursEnd: 17,
      businessHoursTimezone: "UTC",
    });

    expect(isWithinBusinessHours(closed, new Date("2026-06-03T12:00:00Z"))).toBe(false);
  });

  it("repairs malformed equal-hour historical schedules", () => {
    const repaired = resolveAgentSettings({
      businessHoursEnabled: true,
      businessHoursDays: ["wed"],
      businessHoursStart: 9,
      businessHoursEnd: 9,
      businessHoursTimezone: "UTC",
    });

    expect(repaired.businessHoursStart).toBe(AGENT_SETTINGS_DEFAULTS.businessHoursStart);
    expect(repaired.businessHoursEnd).toBe(AGENT_SETTINGS_DEFAULTS.businessHoursEnd);
    expect(isWithinBusinessHours(repaired, new Date("2026-06-03T12:00:00Z"))).toBe(true);
  });
});
