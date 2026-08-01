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
  it("shows the tier default when no override is set", () => {
    const html = render({ autonomyTier: "guarded" });

    expect(html).toContain("Refund cap $0");
    expect(html).toContain("Refund cap $50");
    expect(html).toContain("Refund cap $100");
    expect(html).not.toContain("tier default");
  });

  it("shows the override that is actually in force, with the tier default demoted", () => {
    const html = render({ autonomyTier: "guarded", maxRefundAmount: 75 }, ["maxRefundAmount"]);

    expect(html).toContain("Refund cap $75");
    expect(html).toContain("tier default $50");
    expect(html).not.toContain("Refund cap $50");
  });

  it("carries the override onto the tiers that keep it when selected", () => {
    const html = render({ autonomyTier: "guarded", maxRefundAmount: 75 }, ["maxRefundAmount"]);

    expect(html).toContain("tier default $100");
    expect(html).not.toContain("Refund cap $100");
  });

  it("leaves Draft only at no refunds, since that tier cannot act at all", () => {
    const html = render({ autonomyTier: "watch", maxRefundAmount: 75 }, ["maxRefundAmount"]);

    expect(html).toContain("Refund cap $0");
    expect(html).not.toContain("tier default $0");
  });
});
