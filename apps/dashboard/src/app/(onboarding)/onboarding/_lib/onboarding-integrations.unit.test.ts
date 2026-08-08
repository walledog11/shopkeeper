import { describe, expect, it } from "vitest";
import type { Integration } from "@/types";
import { selectOnboardingIntegrations } from "./onboarding-integrations";

function emailIntegration(
  id: string,
  emailProvider: "gmail" | "postmark",
  options?: { default?: boolean; fromEmail?: string | null },
): Integration {
  return {
    id,
    organizationId: "org-1",
    platform: "email",
    emailProvider,
    externalAccountId: `${id}@example.test`,
    fromEmail: options?.fromEmail ?? `${id}@example.test`,
    tokenExpiresAt: null,
    metadata: null,
    createdAt: "2026-08-07T00:00:00.000Z",
    isDefaultEmail: options?.default ?? false,
  };
}

describe("selectOnboardingIntegrations", () => {
  it.each([
    ["gmail first", [emailIntegration("gmail", "gmail"), emailIntegration("forwarding", "postmark")]],
    ["forwarding first", [emailIntegration("forwarding", "postmark"), emailIntegration("gmail", "gmail")]],
  ])("selects both email providers when %s", (_label, rows) => {
    const selected = selectOnboardingIntegrations(rows as Integration[]);

    expect(selected.gmail?.id).toBe("gmail");
    expect(selected.forwarding?.id).toBe("forwarding");
    expect(selected.emailReady).toBe(true);
  });

  it("prefers the configured default email integration", () => {
    const gmail = emailIntegration("gmail", "gmail");
    const forwarding = emailIntegration("forwarding", "postmark", { default: true });

    expect(selectOnboardingIntegrations([gmail, forwarding]).preferredEmail?.id)
      .toBe("forwarding");
  });

  it("uses the canonical emailProvider field when legacy metadata is absent", () => {
    const gmail = emailIntegration("gmail", "gmail", { fromEmail: null });

    const selected = selectOnboardingIntegrations([gmail]);
    expect(selected.gmail?.id).toBe("gmail");
    expect(selected.forwarding).toBeUndefined();
  });
});
