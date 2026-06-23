import { describe, expect, it } from "vitest";
import { resolveMobileChromeMode } from "./resolveMobileChromeMode";

describe("resolveMobileChromeMode", () => {
  it("returns local for the tickets inbox route", () => {
    expect(resolveMobileChromeMode("/dashboard/tickets")).toBe("local");
  });

  it("returns local for nested tickets paths", () => {
    expect(resolveMobileChromeMode("/dashboard/tickets/archive")).toBe("local");
  });

  it("returns standard for shop and settings routes", () => {
    expect(resolveMobileChromeMode("/dashboard/orders")).toBe("standard");
    expect(resolveMobileChromeMode("/dashboard/settings")).toBe("standard");
    expect(resolveMobileChromeMode("/dashboard/review")).toBe("standard");
  });

  it("returns standard for the dashboard home route", () => {
    expect(resolveMobileChromeMode("/dashboard")).toBe("standard");
  });
});
