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
    spentShopCents: Math.round(input.amount * 100),
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
      result: "Unknown: the provider action completed but its compensation budget record could not be finalized.",
    });
    expect(mockCommitDailyRefundSpendReservation).toHaveBeenCalledWith("reservation_1", 600);
    expect(mockMarkDailyRefundSpendReservationUnknown).toHaveBeenCalledWith(
      "reservation_1",
      "Unknown: the provider action completed but its compensation budget record could not be finalized.",
    );
    expect(mockReleaseDailyRefundSpendReservation).not.toHaveBeenCalled();
  });
});

describe("actionAuthorityBlock", () => {
  function blockedCtx(): BaseAgentContext {
    return {
      ...threadlessCtx(vi.fn()),
      shopify: { shop: "test.myshopify.com", accessToken: "shpat_test", grantedScopes: null },
      actionAuthorityBlock: {
        code: "adjudicated_item_missing",
        message: "the merchant approved a plan that is no longer queued.",
      },
    } as BaseAgentContext;
  }

  // The 2026-09-10 incident: the merchant's "Yes" named a plan the queue no
  // longer had, and the model answered the failed approval by attempting the
  // refund itself. No plan, no execution claim, no approver.
  it("refuses a registry action tool once the turn's authority is withdrawn", async () => {
    const result = await executeToolWithStatus(
      "create_refund",
      { order_id: "456", amount: "20.00" },
      blockedCtx(),
    );

    expect(result.status).toBe("policy_block");
    expect(result.result).toContain("no longer queued");
  });

  it("still allows read tools, which cannot commit anything", async () => {
    const result = await executeToolWithStatus("search_kb", { query: "returns" }, blockedCtx());

    expect(result.status).not.toBe("policy_block");
  });

  // Every operator control tool is category "action" too. Blocking them would
  // remove the correct recovery when a bare "yes" was answering a question
  // rather than approving a plan.
  it("still allows a module control tool, which is the adjudication surface", async () => {
    const controlTool = defineTool({
      name: "test_answer_operator_question",
      description: "Test-only operator control tool.",
      fields: {},
      category: "action",
      group: "thread",
      capabilities: [],
      label: "Answered question",
      planStepLabel: "Answer question",
      policy: { categoryPermission: false },
      execute: async () => ({ status: "ok" as const, message: "Answered." }),
    });

    const result = await executeToolWithStatus(
      "test_answer_operator_question",
      {},
      blockedCtx(),
      undefined,
      { test_answer_operator_question: controlTool },
    );

    expect(result.status).toBe("success");
  });
});
