// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useChannelBindingAttempt,
  type ChannelBindingState,
} from "./useChannelBindingAttempt";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("useChannelBindingAttempt", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest!: ReturnType<typeof useChannelBindingAttempt>;
  let connectionCount = 0;
  const requestBinding = vi.fn();
  const refreshStatus = vi.fn();

  function Probe() {
    const value = useChannelBindingAttempt({
      connectionCount,
      requestBinding,
      refreshStatus,
      requestFailureMessage: "Couldn't start binding.",
      refreshFailureMessage: "Couldn't verify the connection.",
      pollIntervalMs: 1_000,
      maxPollIntervalMs: 4_000,
      maxRefreshFailures: 3,
    });
    useEffect(() => { latest = value; }, [value]);
    return null;
  }

  async function render() {
    await act(async () => root.render(<Probe />));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    vi.clearAllMocks();
    connectionCount = 0;
    requestBinding.mockResolvedValue({
      value: "connect-value",
      expiresAt: Date.now() + 60_000,
    });
    refreshStatus.mockResolvedValue(undefined);
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.useRealTimers();
  });

  it("coalesces duplicate starts and enters the awaiting state", async () => {
    await render();

    await act(async () => {
      const first = latest.start();
      const second = latest.start();
      expect(first).toBe(second);
      await first;
    });

    expect(requestBinding).toHaveBeenCalledOnce();
    expect(latest.state).toMatchObject({
      status: "awaiting_connection",
      connectionCountAtStart: 0,
    });
  });

  it("polls while awaiting and stops after the connection count grows", async () => {
    await render();
    await act(async () => { await latest.start(); });

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(refreshStatus).toHaveBeenCalledOnce();

    connectionCount = 1;
    await render();
    expect(latest.state.status).toBe("connected");

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(refreshStatus).toHaveBeenCalledOnce();
  });

  it("backs off refresh failures and stops after the configured bound", async () => {
    refreshStatus.mockRejectedValue(new Error("offline"));
    await render();
    await act(async () => { await latest.start(); });

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });

    expect(refreshStatus).toHaveBeenCalledTimes(3);
    expect(latest.state).toMatchObject({
      status: "failed",
      message: "Couldn't verify the connection.",
    });
  });

  it("expires an attempt and stops polling", async () => {
    requestBinding.mockResolvedValue({
      value: "short-lived",
      expiresAt: Date.now() + 500,
    });
    await render();
    await act(async () => { await latest.start(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    expect((latest.state as ChannelBindingState).status).toBe("expired");
    expect(refreshStatus).not.toHaveBeenCalled();
  });

  it("aborts an in-flight request when unmounted", async () => {
    let capturedSignal: AbortSignal | undefined;
    requestBinding.mockImplementation((signal: AbortSignal) => {
      capturedSignal = signal;
      return new Promise(() => undefined);
    });
    await render();

    void latest.start();
    await act(async () => root.unmount());

    expect(capturedSignal?.aborted).toBe(true);
    root = createRoot(container);
  });
});
