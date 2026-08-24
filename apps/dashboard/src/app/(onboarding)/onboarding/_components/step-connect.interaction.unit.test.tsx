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

  it("surfaces a malformed iMessage response as a retryable UI error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      token: "missing-expiration",
    }), { status: 200 })));

    await act(async () => root.render(
      <StepConnect
        imessageHandle="+15551234567"
        imessageStatus={undefined}
        onRefreshImessage={() => undefined}
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
