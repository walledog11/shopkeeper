// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DATA } from "../_components/model";
import { useOnboardingMutations } from "./useOnboardingMutations";

const requests = vi.hoisted(() => ({
  createEmail: vi.fn(),
  persistSettings: vi.fn(),
  simulateShopify: vi.fn(),
  updateGmail: vi.fn(),
}));

vi.mock("../_lib/onboarding-requests", () => ({
  createForwardingEmail: requests.createEmail,
  persistOnboardingSettings: requests.persistSettings,
  simulateShopifyIntegration: requests.simulateShopify,
  updateGmailSupportAddress: requests.updateGmail,
}));
vi.mock("@/lib/product-events", () => ({ captureClientProductEvent: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("useOnboardingMutations", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest!: ReturnType<typeof useOnboardingMutations>;
  const ensureOrganization = vi.fn(async () => true);
  const refreshIntegrations = vi.fn(async () => undefined);
  const update = vi.fn();

  function Probe() {
    const value = useOnboardingMutations({
      data: { ...DEFAULT_DATA, storeName: "Fixture", founderName: "Willa" },
      ensureOrganization,
      forwarding: undefined,
      gmail: undefined,
      refreshIntegrations,
      update,
      user: undefined,
    });
    useEffect(() => { latest = value; }, [value]);
    return null;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    requests.createEmail.mockResolvedValue(undefined);
    requests.persistSettings.mockResolvedValue(undefined);
    requests.simulateShopify.mockResolvedValue(undefined);
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it("coalesces settings, completion, email, and simulation mutations by operation", async () => {
    await act(async () => root.render(<Probe />));

    await act(async () => {
      await Promise.all([latest.saveSettings(), latest.saveSettings()]);
      await Promise.all([latest.completeOnboarding(), latest.completeOnboarding()]);
      await Promise.all([
        latest.saveEmail("SUPPORT@EXAMPLE.COM", "postmark"),
        latest.saveEmail("ignored@example.com", "postmark"),
      ]);
      await Promise.all([latest.simulateShopify(), latest.simulateShopify()]);
    });

    expect(requests.persistSettings).toHaveBeenCalledTimes(2);
    expect(requests.persistSettings.mock.calls[0][0].settings.onboardingCompletedAt).toBeUndefined();
    expect(requests.persistSettings.mock.calls[1][0].settings.onboardingCompletedAt).toEqual(expect.any(String));
    expect(requests.createEmail).toHaveBeenCalledOnce();
    expect(requests.createEmail).toHaveBeenCalledWith("support@example.com");
    expect(requests.simulateShopify).toHaveBeenCalledOnce();
    expect(refreshIntegrations).toHaveBeenCalledTimes(2);
  });

  it("does not let an unrelated success clear an email failure", async () => {
    requests.createEmail.mockRejectedValueOnce(new Error("status 503"));
    await act(async () => root.render(<Probe />));
    await act(async () => {
      await expect(latest.saveEmail("support@example.com", "postmark")).resolves.toBe(false);
    });
    expect(latest.states.email).toMatchObject({
      status: "failed",
      message: "Couldn't save that support address. Try again.",
    });

    await act(async () => {
      await expect(latest.simulateShopify()).resolves.toBe(true);
    });
    expect(latest.states.shopifySimulation.status).toBe("succeeded");
    expect(latest.states.email.status).toBe("failed");
  });
});
