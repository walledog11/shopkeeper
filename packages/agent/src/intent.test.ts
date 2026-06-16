import { describe, expect, it } from "vitest";
import {
  hasContradictoryInstructionSignals,
  hasMutativePlanningSignals,
} from "./intent.js";

describe("hasContradictoryInstructionSignals", () => {
  it("detects cancel + address change + refund pivots", () => {
    expect(hasContradictoryInstructionSignals(
      "Cancel order #1103 right now. Actually no — change the shipping address to 5 Oak Street and rush it overnight. Wait, scratch all that, just refund me but still send the item too.",
    )).toBe(true);
  });

  it("detects refund-but-still-ship without pivots", () => {
    expect(hasContradictoryInstructionSignals("Please refund me but still send the item too.")).toBe(true);
  });

  it("ignores a single clear mutative request", () => {
    expect(hasContradictoryInstructionSignals("Please cancel order #1105 before it ships.")).toBe(false);
  });
});

describe("hasMutativePlanningSignals", () => {
  it("treats cancel requests as mutative", () => {
    expect(hasMutativePlanningSignals("Please cancel order #1105 before it ships.")).toBe(true);
  });
});
