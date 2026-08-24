import { describe, expect, it } from "vitest";
import { getUserProfileClerkAppearance } from "./clerk-appearance";

describe("getUserProfileClerkAppearance", () => {
  it("keeps profile badges visible", () => {
    expect(getUserProfileClerkAppearance().elements.badge).toBeUndefined();
  });

  it("fills the account page instead of a fixed Clerk card", () => {
    const { elements } = getUserProfileClerkAppearance();
    expect(elements.rootBox).toContain("w-full");
    expect(elements.cardBox).toContain("border-border");
    expect(elements.navbar).toEqual({ display: "none" });
    expect(elements.navbarHeader).toEqual({ display: "none" });
    expect(elements.navbarButtons).toEqual({ display: "none" });
    expect(elements.headerTitle).toEqual({ display: "none" });
    expect(elements.headerSubtitle).toEqual({ display: "none" });
    expect(elements.profilePageContent).toContain("p-0");
    expect(elements.profileSection).toContain("items-center");
  });
});
