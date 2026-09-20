// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useShopifyKbSync } from "./useShopifyKbSync";

const synchronize = vi.hoisted(() => vi.fn());
vi.mock("../_lib/onboarding-requests", () => ({ synchronizeShopifyKnowledge: synchronize }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("useShopifyKbSync", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest!: ReturnType<typeof useShopifyKbSync>;

  function Probe({ integrationId }: { integrationId: string | undefined }) {
    const value = useShopifyKbSync(integrationId);
    useEffect(() => { latest = value; }, [value]);
    return null;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it("syncs once per integration id", async () => {
    synchronize.mockResolvedValue({ syncedPages: 2, syncedPolicies: 1 });
    await act(async () => root.render(<Probe integrationId="int_1" />));
    await act(async () => { await Promise.resolve(); });
    expect(synchronize).toHaveBeenCalledTimes(1);
    expect(latest.status).toBe("succeeded");
  });

  it("allows one retry after failure", async () => {
    const first = deferred<{ syncedPages: number; syncedPolicies: number }>();
    synchronize.mockReturnValueOnce(first.promise);
    await act(async () => root.render(<Probe integrationId="int_1" />));
    await act(async () => { await Promise.resolve(); });
    expect(latest.status).toBe("pending");

    await act(async () => {
      first.reject(new Error("network"));
      await Promise.resolve();
    });
    expect(latest.status).toBe("failed");
    if (latest.status !== "failed") throw new Error("expected failed");
    expect(latest.canRetry).toBe(true);

    synchronize.mockResolvedValue({ syncedPages: 0, syncedPolicies: 0 });
    await act(async () => { latest.retry(); await Promise.resolve(); });
    expect(latest.status).toBe("succeeded");
  });
});
