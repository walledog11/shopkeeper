import { describe, expect, it } from "vitest";
import { AGENT_LEARNED_KB_TAG } from "./kb-learned.js";
import {
  classifyMemoryArticleSource,
  isMemoryTopicTag,
  memoryOverrideTargetId,
  memoryOverrideTargetTag,
  resolveEffectiveMemoryArticles,
  resolveTopicFolderName,
} from "./kb-memory.js";

describe("kb-memory", () => {
  it("routes merchant answers to topic folders when possible", () => {
    expect(resolveTopicFolderName(["shipping"])).toBe("Shipping");
    expect(resolveTopicFolderName(["returns"])).toBe("Returns");
    expect(resolveTopicFolderName(["discounts"])).toBe("Discounts");
    expect(resolveTopicFolderName(["wholesale"])).toBe("Wholesale");
    expect(resolveTopicFolderName([])).toBe("Learned");
    expect(resolveTopicFolderName(["Support"])).toBe("Learned");
  });

  it("classifies article sources for memory UI", () => {
    expect(classifyMemoryArticleSource({
      baseSource: "shopify",
      tags: ["returns"],
    })).toBe("shopify");

    expect(classifyMemoryArticleSource({
      baseSource: "user",
      tags: [AGENT_LEARNED_KB_TAG, "shipping"],
    })).toBe("learned");

    expect(classifyMemoryArticleSource({
      baseSource: "user",
      tags: ["returns"],
    })).toBe("manual");
  });

  it("recognizes known memory topic tags", () => {
    expect(isMemoryTopicTag("shipping")).toBe(true);
    expect(isMemoryTopicTag("Support")).toBe(false);
  });

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
