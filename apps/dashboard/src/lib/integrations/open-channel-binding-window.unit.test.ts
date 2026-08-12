// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { openChannelBindingWindow } from "./open-channel-binding-window";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("openChannelBindingWindow", () => {
  it("opens synchronously and navigates after the binding request resolves", async () => {
    const replace = vi.fn();
    const close = vi.fn();
    const pendingWindow = {
      close,
      location: { replace },
      opener: window,
    } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(pendingWindow);
    let resolveAttempt!: (value: { value: string; expiresAt: number }) => void;
    const startBinding = vi.fn(() => new Promise<{ value: string; expiresAt: number }>((resolve) => {
      resolveAttempt = resolve;
    }));

    const result = openChannelBindingWindow(startBinding);
    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(startBinding).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();

    resolveAttempt({ value: "https://t.me/ShopkeeperBot?start=token", expiresAt: Date.now() + 60_000 });
    await result;

    expect(replace).toHaveBeenCalledWith("https://t.me/ShopkeeperBot?start=token");
    expect(close).not.toHaveBeenCalled();
  });

  it("closes the placeholder when binding fails", async () => {
    const close = vi.fn();
    vi.spyOn(window, "open").mockReturnValue({
      close,
      location: { replace: vi.fn() },
      opener: window,
    } as unknown as Window);

    await openChannelBindingWindow(async () => null);

    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps the binding attempt available when popups are blocked", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const startBinding = vi.fn().mockResolvedValue({
      value: "https://t.me/ShopkeeperBot?start=token",
      expiresAt: Date.now() + 60_000,
    });

    await expect(openChannelBindingWindow(startBinding)).resolves.toBeUndefined();
    expect(startBinding).toHaveBeenCalledOnce();
  });
});
