import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_DATA } from "./model";
import { StepShopify } from "./step-shopify";

const baseProps = {
  data: DEFAULT_DATA,
  connected: false,
  shopifyRow: undefined,
  kbSync: { status: "idle" as const, policies: 0, pages: 0 },
  onOAuth: vi.fn(),
  onSimulate: vi.fn(async () => true),
  simulating: false,
};

describe("StepShopify", () => {
  it("offers the demo store only when the server enables the simulator", () => {
    const enabled = renderToStaticMarkup(createElement(StepShopify, {
      ...baseProps,
      simulatorEnabled: true,
    }));
    const disabled = renderToStaticMarkup(createElement(StepShopify, {
      ...baseProps,
      simulatorEnabled: false,
    }));

    expect(enabled).toContain("Use demo store");
    expect(enabled).toContain("Development only");
    expect(disabled).not.toContain("Use demo store");
  });

  it("labels an active simulated integration as a demo", () => {
    const html = renderToStaticMarkup(createElement(StepShopify, {
      ...baseProps,
      connected: true,
      simulatorEnabled: true,
      shopifyRow: {
        id: "shopify-integration",
        platform: "shopify",
        externalAccountId: "demo-store.shopkeeper.test",
        fromEmail: null,
        metadata: { simulated: true },
      },
    }));

    expect(html).toContain("Connected");
    expect(html).toContain("Demo");
  });
});
