// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSingleFlightOperation } from "./useSingleFlightOperation";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("useSingleFlightOperation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it("coalesces concurrent calls and preserves typed failure details", async () => {
    let reject!: (error: unknown) => void;
    const request = vi.fn(() => new Promise<string>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    }));
    let operation!: ReturnType<typeof useSingleFlightOperation<[], string>>;

    function Probe() {
      const value = useSingleFlightOperation(request, "Stable message");
      useEffect(() => { operation = value; }, [value]);
      return null;
    }
    await act(async () => root.render(<Probe />));

    let first!: Promise<string>;
    let second!: Promise<string>;
    act(() => {
      first = operation.run();
      second = operation.run();
    });
    expect(first).toBe(second);
    expect(operation.state.status).toBe("pending");
    expect(request).not.toHaveBeenCalled();

    const failure = new Error("internal detail");
    await act(async () => {
      await Promise.resolve();
      reject(failure);
      await expect(first).rejects.toBe(failure);
    });
    expect(request).toHaveBeenCalledOnce();
    expect(operation.state).toEqual({
      status: "failed",
      error: failure,
      message: "Stable message",
    });
  });

  it("does not publish completion after unmount", async () => {
    let resolve!: (value: boolean) => void;
    const request = () => new Promise<boolean>((resolvePromise) => { resolve = resolvePromise; });
    let run!: () => Promise<boolean>;

    function Probe() {
      const operation = useSingleFlightOperation(request, "Failed");
      useEffect(() => { run = operation.run; }, [operation.run]);
      return null;
    }
    await act(async () => root.render(<Probe />));
    const running = run();
    await act(async () => root.unmount());
    await act(async () => {
      resolve(true);
      await expect(running).resolves.toBe(true);
    });
    root = createRoot(container);
  });
});
