// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOnboardingOrganization } from "./useOnboardingOrganization";

const clerk = vi.hoisted(() => ({
  organization: undefined as { id: string; name: string } | undefined,
  organizationLoaded: true,
  listLoaded: true,
  createOrganization: vi.fn(),
  setActive: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useOrganization: () => ({
    isLoaded: clerk.organizationLoaded,
    organization: clerk.organization,
  }),
  useOrganizationList: () => ({
    createOrganization: clerk.createOrganization,
    isLoaded: clerk.listLoaded,
    setActive: clerk.setActive,
    userMemberships: { data: [] },
  }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("useOnboardingOrganization", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest!: ReturnType<typeof useOnboardingOrganization>;

  function Probe() {
    const value = useOnboardingOrganization();
    useEffect(() => { latest = value; }, [value]);
    return null;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    clerk.organization = undefined;
    clerk.organizationLoaded = true;
    clerk.listLoaded = true;
    clerk.createOrganization.mockResolvedValue({ id: "org-new" });
    clerk.setActive.mockResolvedValue(undefined);
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it("keeps Clerk loading separate from organization failure", async () => {
    clerk.organizationLoaded = false;
    clerk.listLoaded = false;
    await act(async () => root.render(<Probe />));

    await expect(latest.ensureOrganization("Fixture")).resolves.toBe(false);
    expect(latest.clerkLoaded).toBe(false);
    expect(latest.operation.status).toBe("idle");
    expect(clerk.createOrganization).not.toHaveBeenCalled();
  });

  it("coalesces organization creation and activates only the created workspace", async () => {
    await act(async () => root.render(<Probe />));
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await act(async () => {
      first = latest.ensureOrganization("Fixture");
      second = latest.ensureOrganization("Fixture");
      await Promise.all([first, second]);
    });

    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(clerk.createOrganization).toHaveBeenCalledOnce();
    expect(clerk.setActive).toHaveBeenCalledOnce();
    expect(clerk.setActive).toHaveBeenCalledWith({ organization: "org-new" });
  });

  it("preserves a creation failure and permits an explicit retry", async () => {
    clerk.createOrganization
      .mockRejectedValueOnce(new Error("Clerk unavailable"))
      .mockResolvedValueOnce({ id: "org-retry" });
    await act(async () => root.render(<Probe />));

    await act(async () => {
      await expect(latest.ensureOrganization("Fixture")).resolves.toBe(false);
    });
    expect(latest.operation).toMatchObject({
      status: "failed",
      message: "Couldn't prepare your workspace. Try again.",
    });

    await act(async () => {
      await expect(latest.ensureOrganization("Fixture")).resolves.toBe(true);
    });
    expect(clerk.createOrganization).toHaveBeenCalledTimes(2);
    expect(clerk.setActive).toHaveBeenCalledWith({ organization: "org-retry" });
  });
});
