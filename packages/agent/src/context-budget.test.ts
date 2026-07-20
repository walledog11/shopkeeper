import { describe, expect, it } from "vitest";
import {
  CONTEXT_BUDGETS,
  budgetKbArticles,
  budgetRecentMessages,
  buildBoundedClassifierConversation,
  buildBoundedEmailClassifierInput,
  resolveContextBudgetMode,
  truncateContextText,
} from "./context-budget.js";

describe("context budgets", () => {
  it("keeps the newest messages in chronological order within count and character limits", () => {
    const input = Array.from({ length: 25 }, (_, index) => ({
      senderType: index % 2 === 0 ? "customer" : "agent",
      contentText: `message-${index}-${"x".repeat(2_000)}`,
    }));

    const result = budgetRecentMessages(input, {
      maxCount: 4,
      maxTotalChars: 4_500,
      maxMessageChars: 3_000,
    });

    expect(result.messages.length).toBeLessThanOrEqual(4);
    expect(result.messages.at(-1)?.contentText).toContain("message-24");
    expect(result.messages.map((message) => message.contentText).join("").length).toBeLessThanOrEqual(4_500);
    expect(result.stats.truncated).toBe(true);
  });

  it("retains an attachment-only newest message even when the text budget is exhausted", () => {
    const result = budgetRecentMessages([
      { senderType: "customer", contentText: "x".repeat(20) },
      {
        senderType: "customer",
        contentText: null,
        attachments: [{ type: "image", reference: "image-1", status: "unavailable" }],
      },
    ], { maxTotalChars: 1, maxMessageChars: 1 });

    expect(result.messages.at(-1)?.attachments).toHaveLength(1);
    expect(result.stats.afterChars).toBeLessThanOrEqual(1);
  });

  it("caps KB article count, individual bodies, and total text", () => {
    const result = budgetKbArticles(Array.from({ length: 5 }, (_, index) => ({
      id: `article-${index}`,
      title: `Title ${index}`,
      body: "b".repeat(10_000),
    })));

    expect(result.articles).toHaveLength(CONTEXT_BUDGETS.kbArticleCount);
    expect(result.articles.every((article) => article.body.length <= CONTEXT_BUDGETS.kbArticleBodyChars)).toBe(true);
    expect(result.stats.afterChars).toBeLessThanOrEqual(CONTEXT_BUDGETS.kbTotalChars);
    expect(result.stats.truncated).toBe(true);
  });

  it("builds classifier input from prior summary plus a bounded recent window", () => {
    const result = buildBoundedClassifierConversation(
      Array.from({ length: 40 }, (_, index) => ({
        senderType: "customer",
        contentText: `request-${index}-${"z".repeat(2_000)}`,
      })),
      "Earlier context ".repeat(200),
    );

    expect(result.text).toContain("PRIOR SUMMARY:");
    expect(result.text).toContain("request-39");
    expect(result.text).not.toContain("request-0-");
    expect(result.text.length).toBeLessThanOrEqual(CONTEXT_BUDGETS.classifierInputChars);
  });

  it("caps initial email classification input", () => {
    const input = buildBoundedEmailClassifierInput("s".repeat(1_000), "b".repeat(30_000));
    expect(input.length).toBeLessThanOrEqual(CONTEXT_BUDGETS.classifierInputChars);
    expect(input).toContain("Subject:");
    expect(input).toContain("Body:");
  });

  it("parses rollout mode and rejects configuration typos", () => {
    expect(resolveContextBudgetMode(undefined)).toBe("off");
    expect(resolveContextBudgetMode("shadow")).toBe("shadow");
    expect(resolveContextBudgetMode("enforce")).toBe("enforce");
    expect(() => resolveContextBudgetMode("enabled")).toThrow(/off, shadow, or enforce/);
  });

  it("uses an explicit marker without exceeding the requested length", () => {
    expect(truncateContextText("abcdefghij", 8)).toHaveLength(8);
    expect(truncateContextText("short", 8)).toBe("short");
  });
});
