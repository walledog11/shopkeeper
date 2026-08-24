import { describe, expect, it } from "vitest";
import { GLASS_SETTINGS_ACTION } from "@/lib/ui/glass-card-styles";
import { getUserProfileClerkAppearance } from "./clerk-appearance";

describe("getUserProfileClerkAppearance", () => {
  it("keeps profile badges visible", () => {
    expect(getUserProfileClerkAppearance().elements.badge).toBeUndefined();
  });

  it("fills the account page instead of a fixed Clerk card", () => {
    const appearance = getUserProfileClerkAppearance();
    const { elements } = appearance;
    expect(appearance.variables.colorBackground).toBe("transparent");
    expect(elements.rootBox).toContain("w-full");
    expect(elements.cardBox).toContain("bg-transparent");
    expect(elements.cardBox).toContain("rounded-none");
    expect(elements.actionCard).toContain("bg-transparent");
    expect(elements.navbar).toEqual({ display: "none" });
    expect(elements.navbarHeader).toEqual({ display: "none" });
    expect(elements.navbarButtons).toEqual({ display: "none" });
    expect(elements.headerTitle).toContain("text-strong");
    expect(elements.headerSubtitle).toContain("text-muted-foreground");
    expect(elements.profilePageContent).toContain("p-0");
    expect(elements.profileSection).toContain("rounded-2xl");
    expect(elements.profileSectionPrimaryButton).toBe(GLASS_SETTINGS_ACTION);
    expect(elements.profileSectionHeader).toContain("text-left");
    expect(elements.userPreview).toContain("max-w-full");
    expect(elements.userPreviewMainIdentifierText).toContain("whitespace-normal");
  });
});
