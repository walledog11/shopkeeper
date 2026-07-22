import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeToolWithStatus } from "./executor.js";
import type { BaseAgentContext } from "../agent-context.js";
import { defineTool, numberArg } from "./registry/index.js";

const {
  mockFindKbArticles,
  mockCreateKbCitations,
  mockReserveDailyRefundSpend,
  mockCommitDailyRefundSpendReservation,
  mockReleaseDailyRefundSpendReservation,
  mockMarkDailyRefundSpendReservationUnknown,
} = vi.hoisted(() => ({
  mockFindKbArticles: vi.fn(),
  mockCreateKbCitations: vi.fn(),
  mockReserveDailyRefundSpend: vi.fn(),
  mockCommitDailyRefundSpendReservation: vi.fn(),
  mockReleaseDailyRefundSpendReservation: vi.fn(),
  mockMarkDailyRefundSpendReservationUnknown: vi.fn(),
}));

vi.mock("@shopkeeper/db", () => ({
  db: {
    kbArticle: { findMany: mockFindKbArticles },
    kbCitation: { createMany: mockCreateKbCitations },
  },
  reserveDailyRefundSpend: mockReserveDailyRefundSpend,
  commitDailyRefundSpendReservation: mockCommitDailyRefundSpendReservation,
  releaseDailyRefundSpendReservation: mockReleaseDailyRefundSpendReservation,
  markDailyRefundSpendReservationUnknown: mockMarkDailyRefundSpendReservationUnknown,
  recordReturnWatch: vi.fn(),
}));

function threadlessCtx(escalate: (reason: string) => Promise<void>): BaseAgentContext {
  return {
    orgId: "org_1",
    orgName: "Test Store",
    recentMessages: [],
    shopify: null,
    escalate,
  };
}

const goodwillSpendTool = defineTool({
  name: "test_goodwill_spend",
  description: "Test-only goodwill spend tool.",
  fields: { amount: numberArg("Amount in dollars.", { required: true }) },
  category: "action",
  group: "order",
  capabilities: [],
  label: "Test goodwill spend",
  planStepLabel: "Test goodwill spend",
  policy: { dailyRefundSpendLimit: true },
  execute: async (input: { amount: number }) => ({
    status: "ok" as const,
    message: "Goodwill issued.",
    spentCents: Math.round(input.amount * 100),
  }),
});

beforeEach(() => {
  mockFindKbArticles.mockReset();
  mockCreateKbCitations.mockReset();
  mockReserveDailyRefundSpend.mockReset();
  mockCommitDailyRefundSpendReservation.mockReset();
  mockReleaseDailyRefundSpendReservation.mockReset();
  mockMarkDailyRefundSpendReservationUnknown.mockReset();
  mockFindKbArticles.mockResolvedValue([]);
  mockCreateKbCitations.mockResolvedValue({ count: 0 });
  mockReserveDailyRefundSpend.mockResolvedValue({
    kind: "reserved",
    reservation: { id: "reservation_1", status: "reserved" },
  });
  mockCommitDailyRefundSpendReservation.mockResolvedValue(undefined);
  mockReleaseDailyRefundSpendReservation.mockResolvedValue(undefined);
  mockMarkDailyRefundSpendReservationUnknown.mockResolvedValue(undefined);
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

describe("goodwill spend reservation finalization", () => {
  it("returns unknown and preserves the reservation when budget finalization fails after provider success", async () => {
    mockCommitDailyRefundSpendReservation.mockRejectedValueOnce(new Error("database unavailable"));
    const ctx: BaseAgentContext = {
      ...threadlessCtx(vi.fn()),
      shopify: {
        shop: "test.myshopify.com",
        accessToken: "token",
        operationId: "execution_1:goodwill_1",
      },
    };

    const result = await executeToolWithStatus(
      goodwillSpendTool.name,
      { amount: 6 },
      ctx,
      undefined,
      { [goodwillSpendTool.name]: goodwillSpendTool },
    );

    expect(result).toEqual({
      status: "unknown",
      result: "Unknown: the provider action completed but its goodwill budget record could not be finalized.",
    });
    expect(mockCommitDailyRefundSpendReservation).toHaveBeenCalledWith("reservation_1", 600);
    expect(mockMarkDailyRefundSpendReservationUnknown).toHaveBeenCalledWith(
      "reservation_1",
      "Unknown: the provider action completed but its goodwill budget record could not be finalized.",
    );
    expect(mockReleaseDailyRefundSpendReservation).not.toHaveBeenCalled();
  });
});
