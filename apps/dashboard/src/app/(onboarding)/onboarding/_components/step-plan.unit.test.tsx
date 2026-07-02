import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Footer } from "./chrome";
import { DEFAULT_DATA } from "./model";
import { StepPlan } from "./step-plan";

describe("StepPlan", () => {
  it("allows setup to finish without a customer email channel", () => {
    const html = renderToStaticMarkup(createElement(StepPlan, {
      data: { ...DEFAULT_DATA, storeName: "Demo Store" },
      hasEmail: false,
      hasMessaging: false,
      hasShopify: true,
      onStart: vi.fn(),
      onBack: vi.fn(),
    }));

    expect(html).toContain("Finish setup");
    expect(html).toContain("Add one later");
    expect(html).toContain("approval mode");
    expect(html).not.toContain("Start working");
  });

  it("shows the inbox test when email is connected", () => {
    const html = renderToStaticMarkup(createElement(StepPlan, {
      data: {
        ...DEFAULT_DATA,
        storeName: "Demo Store",
        primaryEmail: "support@example.com",
      },
      hasEmail: true,
      hasMessaging: true,
      hasShopify: true,
      onStart: vi.fn(),
      onBack: vi.fn(),
    }));

    expect(html).toContain("Start working");
    expect(html).toContain("Your first briefing");
    expect(html).toContain("support@example.com");
  });
});

describe("onboarding channel navigation", () => {
  it("labels an unconnected customer-channel step as skippable", () => {
    const html = renderToStaticMarkup(createElement(Footer, {
      idx: 2,
      stepId: "email",
      canContinue: true,
      hasEmail: false,
      hasMessaging: false,
      saving: false,
      onNext: vi.fn(),
      onBack: vi.fn(),
    }));

    expect(html).toContain("Skip for now");
  });
});
