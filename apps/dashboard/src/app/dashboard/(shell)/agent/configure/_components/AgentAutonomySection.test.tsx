import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { resolveAgentSettings, type AutonomyOverridePath } from "@shopkeeper/agent/settings";
import { AgentAutonomySection } from "./AgentAutonomySection";
import type { AgentTabController } from "./useAgentTabState";

function render(stored: Record<string, unknown>, explicit: AutonomyOverridePath[] = []) {
  const settings = resolveAgentSettings(stored);
  const controller = {
    settingsState: settings,
    payload: settings,
    explicitOverrideSet: new Set(explicit),
    selectTier: vi.fn(),
  } as unknown as AgentTabController;
  return renderToStaticMarkup(createElement(AgentAutonomySection, { controller }));
}

describe("AgentAutonomySection refund cap", () => {
  it("does not show refund cap copy when no override is set", () => {
    const html = render({ autonomyTier: "guarded" });

    expect(html).not.toContain("Refund cap");
    expect(html).not.toContain("Single refund limit");
  });

  it("shows one override note for the active tier when a custom limit is set", () => {
    const html = render({ autonomyTier: "guarded", maxRefundAmount: 75 }, ["maxRefundAmount"]);

    expect(html).toContain("Single refund limit: $75");
    expect(html).toContain("tier default $50 on Ask first");
    expect(html).not.toContain("Refund cap");
  });

  it("uses the selected tier default in the override note", () => {
    const html = render({ autonomyTier: "trusted", maxRefundAmount: 75 }, ["maxRefundAmount"]);

    expect(html).toContain("tier default $100 on Trusted");
  });
});
