import { describe, expect, it } from "vitest";
import type { ActionEntry } from "@shopkeeper/agent/context";
import { buildNavigateDashboardResult, getDashboardDestination } from "@shopkeeper/agent/dashboard-destinations";
import { extractConciergeNavigation } from "./concierge-navigation";

describe("extractConciergeNavigation", () => {
  it("returns the first valid navigate action", () => {
    const destination = getDashboardDestination("approvals");
    expect(destination).not.toBeNull();

    const actions: ActionEntry[] = [
      {
        tool: "navigate_dashboard",
        result: buildNavigateDashboardResult(destination!),
        status: "success",
      },
    ];

    expect(extractConciergeNavigation(actions)).toEqual({
      type: "navigate",
      href: "/dashboard/settings/approvals",
      label: "Approvals & limits",
    });
  });

  it("ignores invalid navigate payloads", () => {
    const actions: ActionEntry[] = [
      { tool: "navigate_dashboard", result: "not json", status: "success" },
    ];
    expect(extractConciergeNavigation(actions)).toBeNull();
  });
});
