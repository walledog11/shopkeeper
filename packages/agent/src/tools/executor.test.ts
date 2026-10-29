import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeToolWithStatus } from "./executor.js";
import type { BaseAgentContext } from "../agent-context.js";
import { defineTool } from "./registry/index.js";

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

// The model's relevance judgment is not under test here; every candidate answers.
vi.mock("../kb-relevance.js", () => ({
  selectAnsweringKbArticles: vi.fn(async ({ articles }: { articles: unknown[] }) => [...articles]),
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

afterEach(() => vi.unstubAllGlobals());

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

describe("receipt validation", () => {
  it("turns a missing required receipt into unknown when stable identities were supplied", async () => {
    const missingReceiptTool = defineTool({
      name: "test_missing_receipt",
      description: "Omits required execution evidence.",
      fields: {},
      category: "action",
      group: "order",
      capabilities: ["shopify"],
      label: "Missing receipt",
      planStepLabel: "Missing receipt",
      requiredReceiptVersion: 1,
      execute: async () => ({ status: "ok" as const, message: "Provider said yes." }),
    });
    const ctx = {
      ...threadlessCtx(vi.fn()),
      shopify: {
        shop: "test.myshopify.com",
        accessToken: "token",
        operationId: "operation-1",
        executionId: "execution-1",
      },
    } as BaseAgentContext;

    const result = await executeToolWithStatus(
      missingReceiptTool.name,
      {},
      ctx,
      undefined,
      { [missingReceiptTool.name]: missingReceiptTool },
    );

    expect(result.status).toBe("unknown");
    expect(result.result).toContain("invalid execution receipt");
    expect(result.receipt).toBeUndefined();
  });

  it("keeps taskless compatibility calls working while identities are absent", async () => {
    const compatibilityTool = defineTool({
      name: "test_legacy_receipt_compatibility",
      description: "Represents a taskless legacy execution.",
      fields: {},
      category: "action",
      group: "order",
      capabilities: [],
      label: "Legacy result",
      planStepLabel: "Legacy result",
      requiredReceiptVersion: 1,
      execute: async () => ({ status: "ok" as const, message: "Legacy success." }),
    });

    const result = await executeToolWithStatus(
      compatibilityTool.name,
      {},
      threadlessCtx(vi.fn()),
      undefined,
      { [compatibilityTool.name]: compatibilityTool },
    );

    expect(result).toEqual({ status: "success", result: "Legacy success." });
  });

  it("turns a malformed success receipt into unknown before it can be journaled as success", async () => {
    const malformedReceiptTool = defineTool({
      name: "test_malformed_receipt",
      description: "Returns malformed evidence.",
      fields: {},
      category: "action",
      group: "order",
      capabilities: [],
      label: "Malformed receipt",
      planStepLabel: "Malformed receipt",
      policy: {},
      execute: async () => ({
        status: "ok" as const,
        message: "Provider said yes.",
        receipt: {
          version: 1,
          operationId: "wrong-operation",
          executionId: "execution-1",
          tool: "create_refund",
          target: { kind: "order", id: "order-1" },
          observedAt: "not-a-date",
          outcome: "succeeded",
          providerReference: "refund-1",
          facts: {},
        } as never,
      }),
    });
    const ctx = {
      ...threadlessCtx(vi.fn()),
      shopify: { shop: "test.myshopify.com", accessToken: "token", operationId: "operation-1" },
    } as BaseAgentContext;

    const result = await executeToolWithStatus(
      malformedReceiptTool.name,
      {},
      ctx,
      undefined,
      { [malformedReceiptTool.name]: malformedReceiptTool },
    );

    expect(result.status).toBe("unknown");
    expect(result.result).toContain("invalid execution receipt");
    expect(result.receipt).toBeUndefined();
  });
});

// Selection decides what the model is offered; execution decides what may run.
// Discovery makes the first set smaller and expandable, which is only safe
// because the second check is independent of it — so a tool call the selection
// never offered, fabricated or hallucinated, must be refused here on the
// authority of the turn alone.
describe("execution refuses a fabricated tool call in every authority mode", () => {
  function storefrontCtx(
    authState: "guest" | "verified",
    verifiedOrders: { orderName: string; orderId: string }[] = [],
  ): BaseAgentContext {
    return {
      orgId: "org_1",
      orgName: "Test Store",
      authState,
      verifiedOrders,
      recentMessages: [],
      shopify: { shop: "test.myshopify.com", accessToken: "token" },
      escalate: vi.fn(),
    };
  }

  const supportCtx = (): BaseAgentContext => ({
    orgId: "org_1",
    orgName: "Test Store",
    recentMessages: [],
    shopify: { shop: "test.myshopify.com", accessToken: "token" },
    escalate: vi.fn(),
  });

  it("rejects an operator module tool named from a support turn", async () => {
    // create_flash_sale is a gateway module tool. Discovery cannot return it
    // because it is not in the registry; execution cannot run it because the
    // support turn supplies no module tools. Both halves, not just the first.
    const result = await executeToolWithStatus("create_flash_sale", { percent: 90 }, supportCtx());

    expect(result.status).toBe("error");
    expect(result.result).toContain('unknown tool "create_flash_sale"');
  });

  it.each([
    ["create_refund", { order_id: "123", amount: "10.00" }],
    ["cancel_order", { order_id: "123" }],
    ["find_customer", { email: "shopper@example.com" }],
    ["get_shopify_orders", { customer_id: "456" }],
    ["get_order_by_name", { order_name: "#1025" }],
  ])("refuses %s for an anonymous storefront visitor", async (name, args) => {
    const result = await executeToolWithStatus(name, args, storefrontCtx("guest"));

    // Policy-blocked, not attempted: the guard runs ahead of the provider even
    // though this context carries a usable Shopify token.
    expect(result.status).toBe("policy_block");
  });

  it("refuses a mutation for a verified visitor and scopes their reads to the order they proved", async () => {
    const ctx = storefrontCtx("verified", [{ orderName: "#1025", orderId: "1025" }]);

    expect((await executeToolWithStatus("create_refund", { order_id: "1025", amount: "10.00" }, ctx)).status)
      .toBe("policy_block");
    expect((await executeToolWithStatus("get_order_by_name", { order_name: "#1026" }, ctx)).status)
      .toBe("policy_block");
    expect((await executeToolWithStatus("get_order_tracking", { order_id: "1026" }, ctx)).status)
      .toBe("policy_block");
  });

  it("refuses a forbidden call without disclosing the tool's arguments", async () => {
    // Post-parse this answered "input.by is required" — a refusal that still
    // tells the shopper find_customer exists and what it takes. Whether they may
    // call it at all does not depend on the arguments being well-formed.
    for (const args of [{}, { email: "shopper@example.com" }, { by: "email", value: "x" }]) {
      const result = await executeToolWithStatus("find_customer", args, storefrontCtx("guest"));

      expect(result.status).toBe("policy_block");
      expect(result.result).not.toContain("input.");
      expect(result.result).not.toContain("invalid arguments");
    }
  });

  it("refuses a support tool whose category the workspace turned off", async () => {
    const result = await executeToolWithStatus(
      "create_refund",
      { order_id: "123", amount: "10.00" },
      supportCtx(),
      { toolsEnabled: { action: false, communication: true, internal: true, read: true } },
    );

    expect(result.status).toBe("policy_block");
    expect(result.result).toContain("disabled by the workspace owner");
  });
});
