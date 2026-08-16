import { describe, expect, it } from "vitest";
import type { ActionEntry } from "@shopkeeper/agent/context";
import { buildNavigateDashboardResult, getDashboardDestination } from "@shopkeeper/agent/dashboard-destinations";
import {
  extractConciergeNavigation,
  matchConciergeNavigationIntent,
} from "./concierge-navigation";

describe("matchConciergeNavigationIntent", () => {
  it("matches setup and navigation phrasing for agent settings", () => {
    expect(matchConciergeNavigationIntent("change trust level")).toEqual({
      type: "navigate",
      href: "/dashboard/agent/configure",
      label: "Agent settings",
    });
    expect(matchConciergeNavigationIntent("take me to agent settings")).toEqual({
      type: "navigate",
      href: "/dashboard/agent/configure",
      label: "Agent settings",
    });
  });

  it("matches integration setup requests", () => {
    expect(matchConciergeNavigationIntent("I want to add a new email integration")).toEqual({
      type: "navigate",
      href: "/dashboard/integrations",
      label: "Integrations",
    });
  });

  it("does not treat inbox questions as navigation", () => {
    expect(matchConciergeNavigationIntent("what's in my inbox")).toBeNull();
    expect(matchConciergeNavigationIntent("anything urgent in tickets?")).toBeNull();
    expect(matchConciergeNavigationIntent("summarize all my open tickets")).toBeNull();
    expect(matchConciergeNavigationIntent("summarize open tickets")).toBeNull();
  });
});

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
      label: "Agent settings",
    });
  });

  it("ignores invalid navigate payloads", () => {
    const actions: ActionEntry[] = [
      { tool: "navigate_dashboard", result: "not json" },
    ];
    expect(extractConciergeNavigation(actions)).toBeNull();
  });
});
