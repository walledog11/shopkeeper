// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useShopifyKnowledgeSync } from "./useShopifyKnowledgeSync";

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

describe("useShopifyKnowledgeSync", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest!: ReturnType<typeof useShopifyKnowledgeSync>;

  function Probe({ integrationId }: { integrationId: string | undefined }) {
    const value = useShopifyKnowledgeSync(integrationId);
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

  it("synchronizes once per integration and suppresses stale completion", async () => {
    const first = deferred<{ syncedPages: number; syncedPolicies: number }>();
    const second = deferred<{ syncedPages: number; syncedPolicies: number }>();
    synchronize.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    await act(async () => root.render(<Probe integrationId="shopify-a" />));
    expect(latest).toMatchObject({ status: "pending", integrationId: "shopify-a" });
    await act(async () => root.render(<Probe integrationId="shopify-b" />));
    expect(synchronize).toHaveBeenCalledTimes(2);

    await act(async () => {
      first.resolve({ syncedPages: 8, syncedPolicies: 3 });
      await first.promise;
    });
    expect(latest).toMatchObject({ status: "pending", integrationId: "shopify-b" });

    await act(async () => {
      second.resolve({ syncedPages: 2, syncedPolicies: 1 });
      await second.promise;
    });
    expect(latest).toMatchObject({
      status: "succeeded",
      integrationId: "shopify-b",
      pages: 2,
      policies: 1,
    });

    await act(async () => root.render(<Probe integrationId="shopify-b" />));
    expect(synchronize).toHaveBeenCalledTimes(2);
  });

  it("allows one explicit retry after a transient failure", async () => {
    const first = deferred<{ syncedPages: number; syncedPolicies: number }>();
    const retry = deferred<{ syncedPages: number; syncedPolicies: number }>();
    synchronize.mockReturnValueOnce(first.promise).mockReturnValueOnce(retry.promise);
    await act(async () => root.render(<Probe integrationId="shopify-a" />));

    await act(async () => {
      first.reject(new Error("temporary"));
      await first.promise.catch(() => undefined);
    });
    expect(latest).toMatchObject({ status: "failed", canRetry: true });

    act(() => {
      latest.retry();
      latest.retry();
    });
    expect(synchronize).toHaveBeenCalledTimes(2);
    expect(latest).toMatchObject({ status: "pending" });

    await act(async () => {
      retry.reject(new Error("still failing"));
      await retry.promise.catch(() => undefined);
    });
    expect(latest).toMatchObject({ status: "failed", canRetry: false });
    act(() => latest.retry());
    expect(synchronize).toHaveBeenCalledTimes(2);
  });
});
