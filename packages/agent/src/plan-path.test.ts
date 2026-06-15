import { describe, expect, it } from "vitest";
import { derivePlanPath } from "./plan-path.js";

describe("derivePlanPath", () => {
  it("returns fast-path when a fast path short-circuits planning", () => {
    expect(derivePlanPath({ fastPath: true, ranReplan: false, ranReplyDraft: false })).toBe("fast-path");
  });

  it("returns 1-call for initial-only planning", () => {
    expect(derivePlanPath({ ranReplan: false, ranReplyDraft: false })).toBe("1-call");
  });

  it("returns 2-call-read for initial + reply draft", () => {
    expect(derivePlanPath({ ranReplan: false, ranReplyDraft: true })).toBe("2-call-read");
  });

  it("returns 2-call-mutative for initial + replan", () => {
    expect(derivePlanPath({ ranReplan: true, ranReplyDraft: false })).toBe("2-call-mutative");
  });

  it("returns 3-call for initial + replan + reply draft", () => {
    expect(derivePlanPath({ ranReplan: true, ranReplyDraft: true })).toBe("3-call");
  });
});
