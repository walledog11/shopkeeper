import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeToolWithStatus } from "./executor.js";
import type { BaseAgentContext } from "../agent-context.js";

const {
  mockFindKbArticles,
  mockCreateKbCitations,
  mockGetDailyRefundSpendCents,
  mockIncrementDailyRefundSpendCents,
} = vi.hoisted(() => ({
  mockFindKbArticles: vi.fn(),
  mockCreateKbCitations: vi.fn(),
  mockGetDailyRefundSpendCents: vi.fn(),
  mockIncrementDailyRefundSpendCents: vi.fn(),
}));

vi.mock("@shopkeeper/db", () => ({
  db: {
    kbArticle: { findMany: mockFindKbArticles },
    kbCitation: { createMany: mockCreateKbCitations },
  },
  getDailyRefundSpendCents: mockGetDailyRefundSpendCents,
  incrementDailyRefundSpendCents: mockIncrementDailyRefundSpendCents,
}));

function threadlessCtx(escalate: (reason: string) => Promise<void>): BaseAgentContext {
  return {
    orgId: "org_1",
    orgName: "Test Store",
    customerMemory: null,
    recentMessages: [],
    shopify: null,
    escalate,
  };
}

beforeEach(() => {
  mockFindKbArticles.mockReset();
  mockCreateKbCitations.mockReset();
  mockGetDailyRefundSpendCents.mockReset();
  mockIncrementDailyRefundSpendCents.mockReset();
  mockFindKbArticles.mockResolvedValue([]);
  mockCreateKbCitations.mockResolvedValue({ count: 0 });
  mockGetDailyRefundSpendCents.mockResolvedValue(0);
  mockIncrementDailyRefundSpendCents.mockResolvedValue(undefined);
});

describe("executeToolWithStatus on a thread-less BaseAgentContext", () => {
  it("returns the no-Shopify error for a Shopify read without throwing", async () => {
    const ctx = threadlessCtx(vi.fn());

    const result = await executeToolWithStatus(
      "get_shopify_orders",
      { customer_id: "customer_1" },
      ctx,
    );

    expect(result.status).toBe("error");
    expect(result.result).toBe("Error: no Shopify integration connected.");
  });

  it("returns matching KB articles without writing a kbCitation when there is no thread", async () => {
    mockFindKbArticles.mockResolvedValueOnce([{
      id: "kb_1",
      title: "Returns policy",
      body: "We accept returns within 30 days.",
      tags: [],
    }]);

    const ctx = threadlessCtx(vi.fn());
    const result = await executeToolWithStatus("search_kb", { query: "returns" }, ctx);

    expect(result.status).toBe("success");
    expect(result.result).toContain("Returns policy");
    expect(mockFindKbArticles).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: "org_1",
        OR: [
          { title: { contains: "returns", mode: "insensitive" } },
          { body: { contains: "returns", mode: "insensitive" } },
        ],
      }),
    }));
    expect(mockCreateKbCitations).not.toHaveBeenCalled();
  });

  it("returns the no-thread error for a thread-coupled tool when no io sink is injected", async () => {
    const ctx = threadlessCtx(vi.fn());

    const result = await executeToolWithStatus("send_reply", { text: "hello" }, ctx);

    expect(result.status).toBe("error");
    expect(result.result).toBe("Error: this tool requires a conversation thread.");
  });

  it("routes a thread-coupled tool through the injected io sink when present", async () => {
    const sendReply = vi.fn().mockResolvedValue({ status: "ok", message: "Reply sent." });
    const ctx: BaseAgentContext = {
      ...threadlessCtx(vi.fn()),
      io: {
        addInternalNote: vi.fn(),
        sendReply,
        sendEmail: vi.fn(),
        updateThreadStatus: vi.fn(),
        updateThreadTag: vi.fn(),
      },
    };

    const result = await executeToolWithStatus("send_reply", { text: "hello" }, ctx);

    expect(result.status).toBe("success");
    expect(result.result).toBe("Reply sent.");
    expect(sendReply).toHaveBeenCalledWith({ text: "hello" });
  });

  it("routes escalate_to_human through the injected sink", async () => {
    const escalate = vi.fn().mockResolvedValue(undefined);
    const ctx = threadlessCtx(escalate);

    const result = await executeToolWithStatus(
      "escalate_to_human",
      { reason: "Suspected fraudulent order." },
      ctx,
    );

    expect(result.status).toBe("escalated");
    expect(escalate).toHaveBeenCalledWith("Suspected fraudulent order.");
  });
});
