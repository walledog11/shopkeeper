import { describe, expect, it } from "vitest";
import {
  createDeterministicBarrier,
  createFailureInjector,
  InjectedPhaseFailure,
} from "./failure-harness.js";

describe("deterministic failure harness", () => {
  it("holds every caller until the test releases the barrier", async () => {
    const barrier = createDeterministicBarrier(2);
    const completed: number[] = [];
    const callers = [1, 2].map(async (caller) => {
      await barrier.arrive();
      completed.push(caller);
    });

    await barrier.waitForArrivals();
    expect(barrier.arrivals).toBe(2);
    expect(completed).toEqual([]);

    barrier.release();
    await Promise.all(callers);
    expect(completed.sort()).toEqual([1, 2]);
  });

  it("throws once at each selected named phase", () => {
    const injector = createFailureInjector(["after-provider", "before-commit"]);

    expect(() => injector.checkpoint("before-provider")).not.toThrow();
    expect(() => injector.checkpoint("after-provider")).toThrow(InjectedPhaseFailure);
    expect(() => injector.checkpoint("after-provider")).not.toThrow();
    expect(injector.pending()).toEqual(["before-commit"]);
  });
});
