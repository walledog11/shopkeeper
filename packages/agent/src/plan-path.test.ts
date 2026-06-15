import { describe, expect, it } from "vitest";
import { derivePlanPath } from "./plan-path.js";

describe("derivePlanPath", () => {
  it("returns fast-path when a fast path short-circuits planning", () => {
    expect(derivePlanPath({ fastPath: true, ranReplan: false })).toBe("fast-path");
  });

  it("returns 1-call for initial-only planning", () => {
    expect(derivePlanPath({ ranReplan: false })).toBe("1-call");
  });

  it("returns 2-call-mutative for initial + replan", () => {
    expect(derivePlanPath({ ranReplan: true })).toBe("2-call-mutative");
  });
});
