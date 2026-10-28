import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const goodwillSpendTool = defineTool({
  name: "test_goodwill_spend",
  description: "Test-only goodwill spend tool.",
  fields: { amount: numberArg("Amount in dollars.", { required: true }) },
  category: "action",
  group: "order",
  capabilities: [],
  label: "Test goodwill spend",
  planStepLabel: "Test goodwill spend",
  policy: { dailyRefundSpendLimit: "input" },
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

afterEach(() => vi.unstubAllGlobals());

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

// The other half of the same budget: a tool whose amount only exists once the
// provider has priced it reserves from inside its own execution.
const providerPricedSpendTool = defineTool({
  name: "test_provider_priced_spend",
  description: "Test-only compensation the provider prices.",
  fields: { units: numberArg("How many units come back.", { required: true }) },
  category: "action",
  group: "order",
  capabilities: [],
  label: "Test provider-priced spend",
  planStepLabel: "Test provider-priced spend",
  policy: { dailyRefundSpendLimit: "provider" },
  execute: async (input: { units: number }, ctx) => {
    const calculatedCents = input.units * 800;
    if (calculatedCents <= 0) {
      return { status: "policy_block" as const, message: "Error: nothing to refund." };
    }
    const reserved = await ctx.shopify!.reserveCompensation!(calculatedCents);
    if (reserved.kind === "refused") return reserved.result;
    return { status: "ok" as const, message: "Refunded.", spentCents: calculatedCents };
  },
});

describe("provider-priced spend reservation", () => {
  function spendCtx(): BaseAgentContext {
    return {
      ...threadlessCtx(vi.fn()),
      shopify: {
        shop: "test.myshopify.com",
        accessToken: "token",
        operationId: "execution_1:refund_1",
      },
    };
  }

  it("reserves the figure the tool priced and commits what it spent", async () => {
    const result = await executeToolWithStatus(
      providerPricedSpendTool.name,
      { units: 2 },
      spendCtx(),
      undefined,
      { [providerPricedSpendTool.name]: providerPricedSpendTool },
    );

    expect(result.status).toBe("success");
    expect(mockReserveDailyRefundSpend).toHaveBeenCalledWith(expect.objectContaining({
      operationKey: "execution_1:refund_1",
      tool: providerPricedSpendTool.name,
      requestedCents: 1_600,
    }));
    expect(mockCommitDailyRefundSpendReservation).toHaveBeenCalledWith("reservation_1", 1_600);
  });

  it("passes a refused budget back as the tool's own result", async () => {
    mockReserveDailyRefundSpend.mockResolvedValueOnce({ kind: "blocked", remainingCents: 250 });

    const result = await executeToolWithStatus(
      providerPricedSpendTool.name,
      { units: 2 },
      spendCtx(),
      undefined,
      { [providerPricedSpendTool.name]: providerPricedSpendTool },
    );

    expect(result.result).toContain("daily compensation cap");
    // A cap is a policy refusal whichever kind of tool reserved: the tool passes the
    // refusal back as its own result, and its status is what the caller reports.
    expect(result.status).toBe("policy_block");
    // Nothing was reserved, so there is nothing to release or commit.
    expect(mockCommitDailyRefundSpendReservation).not.toHaveBeenCalled();
    expect(mockReleaseDailyRefundSpendReservation).not.toHaveBeenCalled();
  });

  it("settles nothing when the tool stopped before it priced anything", async () => {
    const result = await executeToolWithStatus(
      providerPricedSpendTool.name,
      { units: 0 },
      spendCtx(),
      undefined,
      { [providerPricedSpendTool.name]: providerPricedSpendTool },
    );

    expect(result.status).toBe("policy_block");
    expect(mockReserveDailyRefundSpend).not.toHaveBeenCalled();
    expect(mockCommitDailyRefundSpendReservation).not.toHaveBeenCalled();
    expect(mockReleaseDailyRefundSpendReservation).not.toHaveBeenCalled();
    expect(mockMarkDailyRefundSpendReservationUnknown).not.toHaveBeenCalled();
  });
});
