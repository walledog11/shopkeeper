import { describe, expect, it } from "vitest";
import type { ActionEntry } from "@shopkeeper/agent/context";
import { buildNavigateDashboardResult, getDashboardDestination } from "@shopkeeper/agent/dashboard-destinations";
import { extractConciergeNavigation } from "./concierge-navigation";

describe("extractConciergeNavigation", () => {
  it("returns the first valid navigate action", () => {
    const destination = getDashboardDestination("agent_settings");
    expect(destination).not.toBeNull();

    const actions: ActionEntry[] = [
      {
        tool: "navigate_dashboard",
        result: buildNavigateDashboardResult(destination!),
      },
    ];

    expect(extractConciergeNavigation(actions)).toEqual({
      type: "navigate",
      href: "/dashboard/agent/configure",
      label: "Agent configure",
    });
  });

  it("ignores invalid navigate payloads", () => {
    const actions: ActionEntry[] = [
      { tool: "navigate_dashboard", result: "not json" },
    ];
    expect(extractConciergeNavigation(actions)).toBeNull();
  });
});
