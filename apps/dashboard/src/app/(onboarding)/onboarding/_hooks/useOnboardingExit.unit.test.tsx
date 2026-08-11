// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "../_components/model";
import { useOnboardingExit } from "./useOnboardingExit";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@clerk/nextjs", () => ({ useClerk: () => ({ signOut: mocks.signOut }) }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("useOnboardingExit", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest!: ReturnType<typeof useOnboardingExit>;
  const setActive = vi.fn();

  function Probe() {
    const value = useOnboardingExit({
      activeOrganizationId: "org-current",
      memberships: [
        { organization: { id: "org-current", name: "Current" } },
        { organization: { id: "org-other", name: "Other" } },
      ],
      setActive,
    });
    useEffect(() => { latest = value; }, [value]);
    return null;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem(STORAGE_KEY, "draft");
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it("coalesces workspace switching and stays on onboarding when activation fails", async () => {
    setActive.mockRejectedValue(new Error("activation failed"));
    await act(async () => root.render(<Probe />));

    await act(async () => {
      await Promise.all([latest.exit.action(), latest.exit.action()]);
    });

    expect(setActive).toHaveBeenCalledOnce();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("draft");
    expect(latest.state).toMatchObject({
      status: "failed",
      message: "Couldn't switch workspaces. Try again.",
    });
  });

  it("redirects and clears the draft only after successful activation", async () => {
    setActive.mockResolvedValue(undefined);
    await act(async () => root.render(<Probe />));
    await act(async () => latest.exit.action());

    expect(setActive).toHaveBeenCalledWith({ organization: "org-other" });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });
});
