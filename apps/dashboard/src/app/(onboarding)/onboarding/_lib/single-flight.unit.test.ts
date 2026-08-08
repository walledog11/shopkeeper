import { describe, expect, it, vi } from "vitest";
import { runSingleFlight, type SingleFlightRef } from "./single-flight";

describe("runSingleFlight", () => {
  it("shares an in-flight operation and allows a new operation after it settles", async () => {
    const ref: SingleFlightRef<boolean> = { current: null };
    const operation = vi.fn(async () => true);

    const first = runSingleFlight(ref, operation);
    const concurrent = runSingleFlight(ref, operation);

    expect(concurrent).toBe(first);
    await expect(first).resolves.toBe(true);
    expect(operation).toHaveBeenCalledTimes(1);

    await expect(runSingleFlight(ref, operation)).resolves.toBe(true);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("clears the in-flight operation after a failure", async () => {
    const ref: SingleFlightRef<boolean> = { current: null };
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValueOnce(true);

    await expect(runSingleFlight(ref, operation)).rejects.toThrow("failed");
    await expect(runSingleFlight(ref, operation)).resolves.toBe(true);
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
