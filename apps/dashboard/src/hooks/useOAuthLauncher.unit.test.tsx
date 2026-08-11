// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOAuthIntegrationDefinition } from "@/lib/integrations/catalog";
import type { OAuthDoneMessage, OAuthOutcome } from "@/lib/integrations/oauth-contract";
import { useOAuthLauncher } from "./useOAuthLauncher";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  open: vi.fn(),
  subscribe: vi.fn(),
  watch: vi.fn(),
}));

vi.mock("@/lib/product-events", () => ({ captureClientProductEvent: mocks.capture }));
vi.mock("@/lib/integrations/oauth-flow", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/integrations/oauth-flow")>();
  return {
    ...original,
    openOAuthPopup: mocks.open,
    subscribeOAuthDone: mocks.subscribe,
    watchOAuthPopup: mocks.watch,
  };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("useOAuthLauncher", () => {
  let container: HTMLDivElement;
  let root: Root;
  let emit!: (payload: OAuthDoneMessage) => void;
  let subscriptionDispose: ReturnType<typeof vi.fn>;
  let watcherDispose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    root = createRoot(container);
    subscriptionDispose = vi.fn();
    watcherDispose = vi.fn();
    mocks.subscribe.mockImplementation((callback: typeof emit) => {
      emit = callback;
      return subscriptionDispose;
    });
    mocks.watch.mockReturnValue(watcherDispose);
    mocks.open.mockReturnValue({ mode: "popup", popup: {} as Window });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it("constructs a typed provider URL, attributes analytics, and blocks duplicate popups", async () => {
    let launcher!: ReturnType<typeof useOAuthLauncher>;
    function Probe() {
      const value = useOAuthLauncher();
      useEffect(() => { launcher = value; }, [value]);
      return null;
    }
    await act(async () => root.render(<Probe />));
    const definition = getOAuthIntegrationDefinition("shopify");

    let first!: Promise<boolean>;
    let duplicate!: Promise<boolean>;
    await act(async () => {
      first = launcher.launch({
        definition,
        params: { shop: "fixture.myshopify.com" },
        returnTo: "/onboarding",
      });
      duplicate = launcher.launch({ definition, params: { shop: "other" }, returnTo: "/onboarding" });
      await Promise.all([first, duplicate]);
    });

    expect(await first).toBe(true);
    expect(await duplicate).toBe(false);
    expect(mocks.open).toHaveBeenCalledWith(
      "/api/integrations/shopify/auth?shop=fixture.myshopify.com&returnTo=%2Fonboarding",
    );
    expect(mocks.capture).toHaveBeenCalledWith({
      event: "integration_connection_started",
      platform: "shopify",
    });
    expect(launcher.pendingProvider).toBe("shopify");
  });

  it("disposes the watcher on popup outcome and reports success", async () => {
    const outcomes: Array<{ outcome: OAuthOutcome; refresh: boolean }> = [];
    let launcher!: ReturnType<typeof useOAuthLauncher>;
    function Probe() {
      const value = useOAuthLauncher({
        onOutcome: (outcome, context) => outcomes.push({ outcome, refresh: context.refresh }),
      });
      useEffect(() => { launcher = value; }, [value]);
      return null;
    }
    await act(async () => root.render(<Probe />));
    await act(async () => {
      await launcher.launch({
        definition: getOAuthIntegrationDefinition("gmail"),
        params: {},
        returnTo: "/onboarding",
      });
    });

    await act(async () => emit({
      type: "shopkeeper-oauth-done",
      outcome: { status: "connected", provider: "gmail" },
    }));
    expect(watcherDispose).toHaveBeenCalledOnce();
    expect(launcher.pendingProvider).toBeNull();
    expect(outcomes).toEqual([{
      outcome: { status: "connected", provider: "gmail" },
      refresh: true,
    }]);
  });

  it("handles redirect failures and cleans subscriptions after unmount", async () => {
    const failure: OAuthOutcome = {
      status: "failed",
      provider: "shopify",
      error: "shopify_token_failed",
    };
    const onOutcome = vi.fn();
    function Probe() {
      useOAuthLauncher({ outcome: failure, onOutcome });
      return null;
    }
    await act(async () => root.render(<Probe />));
    expect(onOutcome).toHaveBeenCalledWith(failure, { source: "redirect", refresh: false });
    await act(async () => root.unmount());
    expect(subscriptionDispose).toHaveBeenCalledOnce();
    root = createRoot(container);
  });
});
