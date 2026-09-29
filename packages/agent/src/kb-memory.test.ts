import { describe, expect, it } from "vitest";
import {
  memoryOverrideTargetId,
  memoryOverrideTargetTag,
  resolveEffectiveMemoryArticles,
} from "./kb-memory.js";

describe("kb-memory", () => {
  it("keeps merchant corrections and suppresses the context they override", () => {
    const original = { id: "shopify-1", tags: ["returns"] };
    const correction = {
      id: "correction-1",
      tags: ["merchant-override", memoryOverrideTargetTag(original.id)],
    };

    expect(memoryOverrideTargetId(correction.tags)).toBe(original.id);
    expect(resolveEffectiveMemoryArticles([original, correction])).toEqual([correction]);
  });
});
