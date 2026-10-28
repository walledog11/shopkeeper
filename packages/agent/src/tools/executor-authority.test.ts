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

describe("actionAuthority", () => {
  function blockedCtx(): BaseAgentContext {
    return {
      ...threadlessCtx(vi.fn()),
      shopify: { shop: "test.myshopify.com", accessToken: "shpat_test", grantedScopes: null },
      actionAuthority: {
        block: {
          code: "adjudicated_item_missing",
          message: "the merchant approved a plan that is no longer queued.",
        },
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

describe("customer-record execution identity", () => {
  const linkedSupportCtx = {
    orgId: "org_1",
    orgName: "Test Store",
    recentMessages: [],
    shopify: {
      shop: "test.myshopify.com",
      accessToken: "token",
      grantedScopes: ["write_customers"],
    },
    escalate: vi.fn(),
    thread: {
      id: "thread_1", status: "open", channelType: "email", tag: null,
      aiSummary: null, shopifyCustomerId: "1234",
    },
    customer: { id: "customer_1", name: "Jane", platformId: "jane@example.com" },
    openThreadCount: 1,
    recentOrders: [],
    linkedShopifyCustomerName: "Jane",
    kbArticles: [],
    merchantPreferences: [],
  } as BaseAgentContext;

  it.each([
    ['get_order_by_name', { order_name: '#9001' }],
    ['create_refund', { order_id: '9001', amount: '10.00' }],
  ])('blocks %s for an order owned by another customer before reading details or spending', async (name, input) => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      order: { id: 9001, customer: { id: 9999 } },
      orders: [{ id: 9001, customer: { id: 9999 } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const ctx = { ...linkedSupportCtx, shopify: {
      ...linkedSupportCtx.shopify!, grantedScopes: ['read_orders', 'write_orders'],
    } };
    const result = await executeToolWithStatus(name, input, ctx);
    expect(result.status).toBe('policy_block');
    expect(fetch).toHaveBeenCalledTimes(1);
    const requested = new URL(String(fetch.mock.calls[0][0]));
    expect(requested.searchParams.get('fields')).toBe('id,customer');
    expect(mockReserveDailyRefundSpend).not.toHaveBeenCalled();
  });

  it('blocks store-wide customer searches in customer conversations without a provider call', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const result = await executeToolWithStatus('find_customer', { by: 'query', value: 'victim@example.com' }, {
      ...linkedSupportCtx,
      shopify: { ...linkedSupportCtx.shopify!, grantedScopes: ['read_customers'] },
    });
    expect(result.status).toBe('policy_block');
    expect(fetch).not.toHaveBeenCalled();
  });

  describe("with no Shopify customer linked to the thread", () => {
    const linked = linkedSupportCtx as BaseAgentContext & { thread: Record<string, unknown> };
    const unlinkedCtx = {
      ...linked,
      thread: { ...linked.thread, channelType: "instagram", shopifyCustomerId: null },
      shopify: { ...linked.shopify!, grantedScopes: ["read_orders", "write_orders"] },
    } as BaseAgentContext;

    it("still reads the order the sender names, so the merchant gets a plan to review", async () => {
      const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ orders: [] }), { status: 200 }));
      vi.stubGlobal("fetch", fetch);
      const result = await executeToolWithStatus("get_order_by_name", { order_name: "#9001" }, unlinkedCtx);
      expect(result.status).not.toBe("policy_block");
      expect(fetch).toHaveBeenCalled();
    });

    it("refuses a write nobody approved before any provider call or spend", async () => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const result = await executeToolWithStatus("create_refund", { order_id: "9001", amount: "10.00" }, unlinkedCtx);
      expect(result.status).toBe("policy_block");
      expect(result.result).toContain("could not be verified");
      expect(fetch).not.toHaveBeenCalled();
      expect(mockReserveDailyRefundSpend).not.toHaveBeenCalled();
    });

    it("lets the write through once the merchant has approved that exact call", async () => {
      const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ errors: "Not Found" }), { status: 404 }));
      vi.stubGlobal("fetch", fetch);
      const result = await executeToolWithStatus(
        "create_refund",
        { order_id: "9001", amount: "10.00" },
        unlinkedCtx,
        undefined,
        undefined,
        { merchantApproved: true },
      );
      expect(result.result).not.toContain("could not be verified");
      expect(fetch).toHaveBeenCalled();
    });
  });

  it.each([
    ["update_shopify_customer_info", { customer_id: "9999", email: "other@example.com" }],
    ["add_shopify_customer_note", { customer_id: "9999", note: "Wrong customer" }],
  ])("refuses %s when the conversation is now linked to another customer", async (tool, input) => {
    const result = await executeToolWithStatus(tool, input, linkedSupportCtx);

    expect(result).toMatchObject({ status: "policy_block" });
    expect(result.result).toContain("linked to this conversation changed");
    expect(result.result).toContain("9999");
  });
});
