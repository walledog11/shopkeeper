import { beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_LEARNED_KB_TAG } from "./kb-learned.js";

const {
  mockFindFirst,
  mockCreateKb,
  mockFindMany,
  mockUpdate,
  mockCreateArticle,
  mockCreateCitation,
} = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockCreateKb: vi.fn(),
  mockFindMany: vi.fn(),
  mockUpdate: vi.fn(),
  mockCreateArticle: vi.fn(),
  mockCreateCitation: vi.fn(),
}));

vi.mock("@shopkeeper/db", () => ({
  db: {
    knowledgeBase: {
      findFirst: mockFindFirst,
      create: mockCreateKb,
    },
    kbArticle: {
      findMany: mockFindMany,
      create: mockCreateArticle,
      update: mockUpdate,
    },
    kbCitation: {
      create: mockCreateCitation,
    },
  },
}));

import {
  appendMerchantAnswerKbBody,
  buildMerchantAnswerKbArticleContent,
  buildMerchantAnswerKbBody,
  buildMerchantAnswerContextLine,
  deriveMerchantAnswerKbTitle,
  deriveMerchantAnswerTopicTags,
  pickSimilarAgentLearnedArticle,
  saveMerchantAnswerToKb,
} from "./merchant-answer-kb.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockFindFirst.mockResolvedValue(null);
  mockCreateKb.mockResolvedValue({ id: "kb-shipping" });
  mockFindMany.mockResolvedValue([]);
  mockCreateArticle.mockResolvedValue({
    id: "article-new",
    title: "International shipping",
    body: "Q: Do we ship globally?\nA: Yes.\nContext: Customer asked via Email.",
  });
  mockCreateCitation.mockResolvedValue({ id: "citation-1" });
});

describe("merchant answer kb content", () => {
  it("derives shipping title and topic tags from policy questions", () => {
    expect(deriveMerchantAnswerKbTitle("Do we ship globally?", "Yes")).toBe("International shipping");
    expect(deriveMerchantAnswerTopicTags("Do we ship to Canada?", "Yes")).toContain("shipping");
  });

  it("builds Q+A+context article content with agent-learned tags", () => {
    const content = buildMerchantAnswerKbArticleContent({
      question: "Do we ship globally?",
      answer: "Yes — $15 flat rate to Canada and UK.",
      threadTag: "Support",
      channelType: "email",
      threadSummary: "global availability",
    });

    expect(content.title).toBe("International shipping");
    expect(content.body).toContain("Q: Do we ship globally?");
    expect(content.body).toContain("A: Yes — $15 flat rate to Canada and UK.");
    expect(content.body).toContain("Context: Customer asked via Email, thread about global availability.");
    expect(content.tags).toEqual([AGENT_LEARNED_KB_TAG, "shipping"]);
  });

  it("buildMerchantAnswerContextLine falls back to channel-only context", () => {
    expect(buildMerchantAnswerContextLine({ channelType: "ig_dm" }))
      .toBe("Customer asked via Instagram.");
  });

  it("appendMerchantAnswerKbBody separates sections", () => {
    const existing = buildMerchantAnswerKbBody({
      question: "Old question",
      answer: "Old answer",
      contextLine: "Customer asked via Email.",
    });
    const next = buildMerchantAnswerKbBody({
      question: "New question",
      answer: "New answer",
      contextLine: "Customer asked via Instagram.",
    });

    expect(appendMerchantAnswerKbBody(existing, next)).toContain("---");
    expect(appendMerchantAnswerKbBody(existing, next)).toContain("New question");
  });

  it("pickSimilarAgentLearnedArticle prefers exact title matches", () => {
    const candidates = [
      { id: "1", title: "Discount policy", tags: [AGENT_LEARNED_KB_TAG, "discounts"] },
      { id: "2", title: "International shipping", tags: [AGENT_LEARNED_KB_TAG, "shipping"] },
    ];

    expect(pickSimilarAgentLearnedArticle(candidates, "International shipping", ["shipping"])?.id)
      .toBe("2");
  });
});

describe("saveMerchantAnswerToKb", () => {
  it("creates a new article and citation when no similar article exists", async () => {
    const result = await saveMerchantAnswerToKb({
      organizationId: "org-1",
      threadId: "thread-1",
      question: "Do we ship globally?",
      answer: "Yes — worldwide for $15.",
      threadTag: "Support",
      channelType: "email",
      threadSummary: "global shipping",
    });

    expect(result.created).toBe(true);
    expect(result.updated).toBe(false);
    expect(mockCreateKb).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: "org-1",
        name: "Shipping",
        source: "user",
      }),
    }));
    expect(mockCreateArticle).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: "org-1",
        knowledgeBaseId: "kb-shipping",
        title: "International shipping",
        tags: expect.arrayContaining([AGENT_LEARNED_KB_TAG, "shipping"]),
      }),
    }));
    expect(mockCreateCitation).toHaveBeenCalledWith({
      data: {
        organizationId: "org-1",
        kbArticleId: "article-new",
        threadId: "thread-1",
      },
    });
  });

  it("updates an existing similar article and writes a citation", async () => {
    mockFindMany.mockResolvedValueOnce([{
      id: "article-existing",
      title: "International shipping",
      body: "Q: Old\nA: Old\nContext: Customer asked via Email.",
      tags: [AGENT_LEARNED_KB_TAG, "shipping"],
    }]);
    mockUpdate.mockResolvedValueOnce({
      id: "article-existing",
      title: "International shipping",
      body: "merged",
    });

    const result = await saveMerchantAnswerToKb({
      organizationId: "org-1",
      threadId: "thread-2",
      question: "Do you ship to Canada?",
      answer: "Yes — $15 flat rate.",
      channelType: "email",
    });

    expect(result.created).toBe(false);
    expect(result.updated).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockCreateCitation).toHaveBeenCalledWith({
      data: {
        organizationId: "org-1",
        kbArticleId: "article-existing",
        threadId: "thread-2",
      },
    });
    expect(mockCreateArticle).not.toHaveBeenCalled();
  });
});
