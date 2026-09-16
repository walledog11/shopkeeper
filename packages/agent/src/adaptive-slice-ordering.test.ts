// Package 3, step 1: the deterministic bed for the adaptive slice. A fake
// provider and scripted model outputs pin the loop's *ordering* — read, propose,
// execute, observe, respond — so the steps that follow can change how the loop
// suspends without live-model variability deciding whether they worked.
//
// Ordering only. Approval binding, revision checks and receipt shape are owned
// by task-approval and the receipt parsers, and are asserted beside those.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_SETTINGS_DEFAULTS } from "./settings.js";
import { runAgent } from "./run.js";
import { jsonResponse } from "./testing/json-response.js";
import type { AgentContext } from "./agent-context.js";

const {
  mockCreate,
  mockSendReply,
  mockReserveDailyRefundSpend,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockSendReply: vi.fn(),
  mockReserveDailyRefundSpend: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    messages = { create: mockCreate };
  },
}));

vi.mock("@shopkeeper/db", () => ({
  reserveDailyRefundSpend: mockReserveDailyRefundSpend,
  commitDailyRefundSpendReservation: vi.fn().mockResolvedValue(undefined),
  releaseDailyRefundSpendReservation: vi.fn().mockResolvedValue(undefined),
  markDailyRefundSpendReservationUnknown: vi.fn().mockResolvedValue(undefined),
  recordReturnWatch: vi.fn(),
  db: {
    kbArticle: { findMany: vi.fn().mockResolvedValue([]) },
    kbCitation: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  },
}));

vi.mock("./spend.js", () => ({
  enforceSpendCap: vi.fn().mockResolvedValue(undefined),
  recordSpend: vi.fn().mockResolvedValue(undefined),
  getDailySpendNano: vi.fn().mockResolvedValue(0),
}));

vi.mock("./agent-actions.js", () => ({
  beginAgentActionAttempt: vi.fn().mockResolvedValue({ id: "action_1", operationId: "operation_1" }),
  authorizeAgentActionDispatch: vi.fn().mockResolvedValue(undefined),
  markAgentActionSubmitted: vi.fn().mockResolvedValue(undefined),
  recordAgentActionsBatch: vi.fn().mockResolvedValue([{ id: "action_1" }]),
  summarizeJournaledActions: vi.fn().mockResolvedValue(undefined),
  completeAgentActionAttempt: vi.fn().mockResolvedValue(undefined),
  recordAgentTurnUsage: vi.fn().mockResolvedValue(undefined),
  recordAgentAction: vi.fn().mockResolvedValue(undefined),
  hashPlan: vi.fn().mockReturnValue("hash"),
  hashInstruction: vi.fn().mockReturnValue("hash"),
}));

const USAGE = { input_tokens: 10, output_tokens: 10 };

// One entry per observable event, in the order it happened. This is the
// assertion surface: the slice is about sequence, not about any single call.
let events: string[] = [];

function toolUse(id: string, name: string, input: unknown) {
  return { stop_reason: "tool_use", content: [{ type: "tool_use", id, name, input }], usage: USAGE };
}

// The fake provider. Routed by URL rather than call order so an extra read
// inserted by a later step does not silently shift every later expectation onto
// the wrong response.
function installFakeShopify() {
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
    const href = typeof url === "string" ? url : url.toString();
    if (href.includes("orders.json")) {
      events.push("provider:list_orders");
      return jsonResponse({
        orders: [{
          id: 456,
          name: "#1011",
          currency: "USD",
          total_price: "20.00",
          financial_status: "paid",
          fulfillment_status: "fulfilled",
          created_at: "2026-05-14T12:00:00-07:00",
          line_items: [{ id: 11, title: "Hat", quantity: 1, current_quantity: 1 }],
        }],
      }, { headers: { "retry-after": "0" } });
    }
    if (href.includes("/refunds/calculate")) {
      events.push("provider:calculate_refund");
      return jsonResponse({
        refund: {
          currency: "USD",
          refund_line_items: [{ line_item_id: 11, quantity: 1, restock_type: "no_restock" }],
          transactions: [{ kind: "suggested_refund", gateway: "shopify_payments", parent_id: 222, amount: "20.00", maximum_refundable: "20.00" }],
        },
      }, { headers: { "retry-after": "0" } });
    }
    if (href.includes("/graphql")) {
      events.push("provider:commit_refund");
      return jsonResponse({
        data: {
          refundCreate: {
            refund: {
              id: "gid://shopify/Refund/9001",
              totalRefundedSet: { presentmentMoney: { amount: "20.00" } },
              transactions: { nodes: [{ id: "gid://shopify/OrderTransaction/7001", status: "SUCCESS" }] },
            },
            userErrors: [],
          },
        },
      }, { headers: { "retry-after": "0" } });
    }
    events.push("provider:read_order");
    return jsonResponse({
      order: {
        id: 456,
        name: "#1011",
        currency: "USD",
        total_price: "20.00",
        financial_status: "paid",
        refunds: [],
        line_items: [{ id: 11, title: "Hat", quantity: 1, current_quantity: 1 }],
      },
    }, { headers: { "retry-after": "0" } });
  }));
}

function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    orgId: "org_1",
    orgName: "Test Store",
    customer: { id: "customer_1", name: "Jane", platformId: "jane@test.com" },
    recentMessages: [{ senderType: "customer", contentText: "Please refund order #1011." }],
    openThreadCount: 1,
    shopify: { shop: "test-store.myshopify.com", accessToken: "shpat_test", grantedScopes: ["write_orders"] },
    recentOrders: [],
    linkedShopifyCustomerName: null,
    kbArticles: [],
    merchantPreferences: [],
    thread: {
      id: "thread_1",
      status: "open",
      channelType: "dashboard_agent",
      tag: "Support",
      aiSummary: null,
      shopifyCustomerId: null,
      requestSourceMessageId: "message_1",
      latestCustomerMessageId: "message_1",
    },
    io: {
      addInternalNote: vi.fn().mockResolvedValue({ status: "ok", message: "Note added." }),
      sendReply: mockSendReply,
      sendEmail: vi.fn().mockResolvedValue({ status: "ok", message: "Email sent." }),
      updateThreadStatus: vi.fn().mockResolvedValue({ status: "ok", message: "Status updated." }),
      updateThreadTag: vi.fn().mockResolvedValue({ status: "ok", message: "Tag updated." }),
    },
    escalate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as AgentContext;
}

beforeEach(() => {
  events = [];
  mockCreate.mockReset();
  // `send_reply` declares requiredReceiptVersion 1, so the sink owes a receipt;
  // a bare ok would be rejected before the ordering could be observed.
  mockSendReply.mockReset().mockImplementation(async (_input: unknown, execution?: { operationId: string; executionId: string }) => {
    events.push("io:send_reply");
    return {
      status: "ok",
      message: "Reply sent.",
      receipt: {
        version: 1 as const,
        operationId: execution?.operationId ?? "operation_1",
        executionId: execution?.executionId ?? "execution_1",
        tool: "send_reply" as const,
        target: { kind: "thread", id: "thread_1" },
        observedAt: "2026-09-16T07:00:00.000Z",
        providerReference: "message_1",
        outcome: "succeeded" as const,
        facts: {
          logicalResponseId: "message_1",
          messageId: "message_1",
          threadId: "thread_1",
          destination: { kind: "thread" as const, id: "thread_1" },
          contentSha256: "b".repeat(64),
          deliveryState: "sent" as const,
          providerMessageId: null,
        },
      },
    };
  });
  mockReserveDailyRefundSpend.mockResolvedValue({
    kind: "reserved",
    reservation: { id: "reservation_1", status: "reserved" },
  });
  installFakeShopify();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("adaptive slice loop ordering", () => {
  it("reads, refunds, observes the receipt, then composes from it", async () => {
    // Scripted model: read the order, propose the refund, then answer. Each
    // turn records when the model was asked, so the interleaving with provider
    // calls is visible in one list.
    mockCreate
      .mockImplementationOnce(async () => {
        events.push("model:call_1");
        return toolUse("t1", "get_shopify_orders", { customer_id: "10000001011" });
      })
      .mockImplementationOnce(async () => {
        events.push("model:call_2");
        return toolUse("t2", "create_refund", { order_id: "456", amount: "20.00", currency: "USD", reason: "Damaged" });
      })
      .mockImplementationOnce(async () => {
        events.push("model:call_3");
        return toolUse("t3", "send_reply", { text: "Your $20.00 refund is on its way." });
      })
      .mockImplementationOnce(async () => {
        events.push("model:call_4");
        return { stop_reason: "end_turn", content: [{ type: "text", text: "Done." }], usage: USAGE };
      });

    const result = await runAgent(
      makeCtx(),
      "Handle the refund request.",
      undefined,
      { ...AGENT_SETTINGS_DEFAULTS, autonomyTier: "trusted", autoExecuteMode: "live", maxRefundAmount: 100 },
    );

    // The whole point of the slice: the order is read before any money moves,
    // the refund commits before the customer is told anything, and the model is
    // asked to compose only after the committed receipt came back.
    expect(events).toEqual([
      "model:call_1",
      "provider:list_orders",
      "model:call_2",
      "provider:read_order",
      "provider:calculate_refund",
      "provider:commit_refund",
      "model:call_3",
      "io:send_reply",
      "model:call_4",
    ]);

    expect(result.actionsPerformed.map(action => action.tool))
      .toEqual(["get_shopify_orders", "create_refund", "send_reply"]);
  });

  it("does not compose a completion when the refund did not commit", async () => {
    // Same script, but the provider rejects the commit. The reply must not be
    // the one the model would have written for a success.
    mockCreate
      .mockImplementationOnce(async () => {
        events.push("model:call_1");
        return toolUse("t1", "get_shopify_orders", { customer_id: "10000001011" });
      })
      .mockImplementationOnce(async () => {
        events.push("model:call_2");
        return toolUse("t2", "create_refund", { order_id: "456", amount: "20.00", currency: "USD", reason: "Damaged" });
      })
      .mockImplementationOnce(async () => {
        events.push("model:call_3");
        return toolUse("t3", "escalate_to_human", { reason: "The refund did not go through." });
      });

    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const href = typeof url === "string" ? url : url.toString();
      if (href.includes("orders.json")) {
        events.push("provider:list_orders");
        return jsonResponse({ orders: [] }, { headers: { "retry-after": "0" } });
      }
      events.push("provider:read_order_failed");
      return jsonResponse({ errors: "Not Found" }, { status: 404, headers: { "retry-after": "0" } });
    }));

    const result = await runAgent(
      makeCtx(),
      "Handle the refund request.",
      undefined,
      { ...AGENT_SETTINGS_DEFAULTS, autonomyTier: "trusted", autoExecuteMode: "live", maxRefundAmount: 100 },
    );

    expect(events).not.toContain("provider:commit_refund");
    expect(events).not.toContain("io:send_reply");
    expect(result.actionsPerformed.map(action => action.tool)).not.toContain("send_reply");
  });
});
