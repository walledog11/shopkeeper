import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_DATA } from "./model";
import { StepShopify } from "./step-shopify";

const baseProps = {
  data: DEFAULT_DATA,
  connected: false,
  shopifyRow: undefined,
  kbSync: { status: "idle" as const, retry: vi.fn() },
  onOAuth: vi.fn(),
  onSimulate: vi.fn(async () => true),
  simulating: false,
  oauthPending: false,
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
        organizationId: "org-1",
        platform: "shopify",
        externalAccountId: "demo-store.shopkeeper.test",
        fromEmail: null,
        tokenExpiresAt: null,
        metadata: { simulated: true },
        createdAt: "2026-08-07T00:00:00.000Z",
      },
    }));

    expect(html).toContain("Connected");
    expect(html).toContain("Demo");
  });

  it("shows an explicit knowledge-sync retry after failure", () => {
    const html = renderToStaticMarkup(createElement(StepShopify, {
      ...baseProps,
      connected: true,
      simulatorEnabled: false,
      kbSync: {
        status: "failed",
        integrationId: "shopify-integration",
        error: new Error("temporary"),
        message: "Couldn't read your Shopify store. Try again.",
        canRetry: true,
        retry: vi.fn(),
      },
    }));

    expect(html).toContain("Couldn&#x27;t read your store");
    expect(html).toContain("Try again");
  });
});
