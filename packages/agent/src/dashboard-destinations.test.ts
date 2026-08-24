import { describe, expect, it } from "vitest";
import {
  buildNavigateDashboardResult,
  getDashboardDestination,
  parseNavigateDashboardResult,
} from "./dashboard-destinations.js";

describe("dashboard destinations", () => {
  it("resolves known destination ids", () => {
    expect(getDashboardDestination("integrations")?.href).toBe("/dashboard/integrations");
    expect(getDashboardDestination("agent_settings")?.label).toBe("Agent configure");
    expect(getDashboardDestination("workspace_settings")?.href).toBe("/dashboard/settings");
    expect(getDashboardDestination("account_settings")?.href).toBe("/dashboard/account");
    expect(getDashboardDestination("missing")).toBeNull();
  });

  it("builds and parses navigate payloads", () => {
    const destination = getDashboardDestination("integrations");
    expect(destination).not.toBeNull();

    const result = buildNavigateDashboardResult(destination!);
    expect(parseNavigateDashboardResult(result)).toEqual({
      type: "navigate",
      href: "/dashboard/integrations",
      label: "Integrations",
    });
  });

  it("rejects payloads outside the allowlist", () => {
    expect(parseNavigateDashboardResult(JSON.stringify({
      type: "navigate",
      href: "/dashboard/evil",
      label: "Evil",
    }))).toBeNull();
  });
});
