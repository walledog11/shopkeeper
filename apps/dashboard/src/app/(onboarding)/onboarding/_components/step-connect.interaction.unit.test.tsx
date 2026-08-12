// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StepConnect } from "./step-connect";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("StepConnect interactions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens Telegram synchronously and retains a visible fallback link", async () => {
    const replace = vi.fn();
    const pendingWindow = {
      close: vi.fn(),
      location: { replace },
      opener: window,
    } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(pendingWindow);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      url: "https://t.me/ShopkeeperBot?start=token",
      expiresInSeconds: 60,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => root.render(
      <StepConnect
        imessageHandle={null}
        imessageStatus={undefined}
        onRefreshImessage={() => undefined}
        onRefreshTelegram={() => undefined}
        telegramBotUsername="ShopkeeperBot"
        telegramStatus={undefined}
      />,
    ));

    const button = Array.from(container.querySelectorAll("button"))
      .find((candidate) => candidate.textContent?.includes("Link Telegram"));
    expect(button).toBeDefined();

    await act(async () => {
      button?.click();
      await vi.waitFor(() => expect(replace).toHaveBeenCalledOnce());
    });

    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(container.querySelector(`a[href="https://t.me/ShopkeeperBot?start=token"]`)).not.toBeNull();
  });

  it("surfaces a malformed iMessage response as a retryable UI error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      token: "missing-expiration",
    }), { status: 200 })));

    await act(async () => root.render(
      <StepConnect
        imessageHandle="+15551234567"
        imessageStatus={undefined}
        onRefreshImessage={() => undefined}
        onRefreshTelegram={() => undefined}
        telegramBotUsername={null}
        telegramStatus={undefined}
      />,
    ));

    const button = Array.from(container.querySelectorAll("button"))
      .find((candidate) => candidate.textContent?.includes("Link my iPhone"));
    expect(button).toBeDefined();

    await act(async () => {
      button?.click();
      await Promise.resolve();
    });
    await vi.waitFor(async () => {
      await act(async () => {
        await Promise.resolve();
        expect(container.textContent).toContain("Couldn't create a connect code.");
      });
    });
  });
});
