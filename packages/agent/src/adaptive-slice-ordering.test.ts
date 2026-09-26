// Package 3, step 1: the deterministic bed for the adaptive slice. A fake
// provider and scripted model outputs pin the loop's *ordering* — read, propose,
// execute, observe, respond — so the steps that follow can change how the loop
// suspends without live-model variability deciding whether they worked.
//
// Ordering only. Approval binding, revision checks and receipt shape are owned
// by task-approval and the receipt parsers, and are asserted beside those.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_SETTINGS_DEFAULTS } from "./settings.js";
import { planAgent } from "./planner.js";
import { runAgent } from "./run.js";
import { TOOL_CATEGORIES } from "./tools/registry/index.js";
import { jsonResponse } from "./testing/json-response.js";
import type { AgentContext } from "./agent-context.js";

const {
  mockCreate,
  mockSendReply,
  mockReserveDailyRefundSpend,
  mockKbSearch,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockSendReply: vi.fn(),
  mockReserveDailyRefundSpend: vi.fn(),
  mockKbSearch: vi.fn(),
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
    kbArticle: { findMany: mockKbSearch },
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
      channelType: "operator",
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
  mockKbSearch.mockReset().mockResolvedValue([]);
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

// The approved proposal: the write and the exact reply the merchant was shown.
const APPROVED_REFUND = {
  id: "t2",
  name: "create_refund",
  input: { order_id: "456", amount: "20.00", currency: "USD", reason: "Damaged" },
};
const APPROVED_REPLY = {
  id: "t3",
  name: "send_reply",
  input: { text: "Your refund for the damaged item is on its way." },
};

function supportCtx() {
  return makeCtx({
    thread: {
      id: "thread_1",
      status: "open",
      channelType: "email",
      tag: "Support",
      aiSummary: null,
      shopifyCustomerId: null,
      requestSourceMessageId: "message_1",
      latestCustomerMessageId: "message_1",
    },
  } as unknown as Partial<AgentContext>);
}

const LIVE_SETTINGS = {
  ...AGENT_SETTINGS_DEFAULTS,
  autonomyTier: "trusted" as const,
  autoExecuteMode: "live" as const,
  maxRefundAmount: 100,
};

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

// Package 3, step 5, as revised by decision A of the overhaul plan: the approved
// proposal runs on the existing claim and journal, and the customer gets the
// exact reply the merchant approved with it. Nothing is composed afterwards.
describe("running an approved exact-draft proposal", () => {
  it("commits the approved write, then sends the approved reply verbatim without asking the model", async () => {
    const result = await runAgent(
      supportCtx(),
      "Handle the refund request.",
      [APPROVED_REFUND, APPROVED_REPLY],
      LIVE_SETTINGS,
    );

    // The money moves before the customer is written to.
    expect(events).toEqual([
      "provider:read_order",
      "provider:calculate_refund",
      "provider:commit_refund",
      "io:send_reply",
    ]);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSendReply.mock.calls[0]?.[0]).toMatchObject(APPROVED_REPLY.input);
    expect(result.actionsPerformed.map(action => action.tool))
      .toEqual(["create_refund", "send_reply"]);
  });

  it("sends nothing on a proposal that authorizes no message", async () => {
    const result = await runAgent(supportCtx(), "Handle the refund request.", [APPROVED_REFUND], LIVE_SETTINGS);

    expect(events).toContain("provider:commit_refund");
    expect(events).not.toContain("io:send_reply");
    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.actionsPerformed.map(action => action.tool)).toEqual(["create_refund"]);
  });

  it("sends nothing when the approved write did not commit", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const href = typeof url === "string" ? url : url.toString();
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
        events.push("provider:refund_rejected");
        return jsonResponse({
          data: { refundCreate: { refund: null, userErrors: [{ field: ["input"], message: "Refund exceeds the refundable amount." }] } },
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

    const result = await runAgent(
      supportCtx(),
      "Handle the refund request.",
      [APPROVED_REFUND, APPROVED_REPLY],
      LIVE_SETTINGS,
    );

    // A definite failure stops the batch before the approved reply, which was
    // written for the write succeeding.
    expect(result.actionsPerformed).toHaveLength(1);
    expect(result.actionsPerformed[0]).toMatchObject({ tool: "create_refund", status: "error" });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(events).not.toContain("io:send_reply");
  });
});

// Package 3, step 6: the compound case. Not a whole-order refund a fixture could
// have anticipated — the order and the store's policy are read, one line of the
// order is refunded, and the completion reports the figure Shopify priced rather
// than one the model named. The merchant changing the instruction before
// approving, and the provider refusing the write, are the two branches on it.
describe("a compound task: read the order and the policy, refund one line, report it", () => {
  const COMPOUND_ORDER = {
    id: 456,
    name: "#1011",
    currency: "USD",
    total_price: "30.00",
    financial_status: "paid",
    fulfillment_status: "fulfilled",
    created_at: "2026-05-14T12:00:00-07:00",
    refunds: [],
    line_items: [
      { id: 11, title: "Linen napkin", quantity: 2, current_quantity: 2, price: "8.50" },
      { id: 12, title: "Tablecloth", quantity: 1, current_quantity: 1, price: "13.00" },
    ],
  };

  const NAPKIN_POLICY = {
    id: "kb_1",
    title: "Damaged items",
    body: "Refund the damaged item on its own; the rest of the order stands.",
    tags: [],
  };

  // The model proposes one napkin without naming money. Capture mode asks
  // Shopify for the quote and binds it into the immutable approval proposal.
  const PARTIAL_REFUND_PROPOSAL = {
    id: "t3",
    name: "create_partial_refund",
    input: { order_id: "456", items: [{ line_item_id: "11", quantity: 1 }], reason: "One napkin arrived torn" },
  };

  // What the commit was actually asked to refund, captured from the mutation.
  interface CommittedRefund {
    refundLineItems?: { lineItemId: string; quantity: number; restockType: string }[];
    transactions?: { amount: string }[];
  }
  interface ProviderRequestBody {
    refund?: { refund_line_items?: { line_item_id: string; quantity: number }[] };
    variables?: { input?: CommittedRefund };
  }
  let committedRefund: CommittedRefund | null = null;

  // Shopify prices the selection, so the fake prices it too: the amount follows
  // the quantity asked for. A fake answering the same figure to every selection
  // would let a revised proposal pass while the original one was committed.
  function installCompoundShopify(options: { commit?: "refused" } = {}) {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = typeof url === "string" ? url : url.toString();
      const body = typeof init?.body === "string"
        ? JSON.parse(init.body) as ProviderRequestBody
        : null;
      if (href.includes("orders.json")) {
        events.push("provider:lookup_order");
        return jsonResponse({ orders: [COMPOUND_ORDER] }, { headers: { "retry-after": "0" } });
      }
      if (href.includes("/refunds/calculate")) {
        events.push("provider:calculate_refund");
        const lines = body?.refund?.refund_line_items ?? [];
        const units = lines.reduce((total, line) => total + Number(line.quantity ?? 0), 0);
        return jsonResponse({
          refund: {
            currency: "USD",
            refund_line_items: lines.map(line => ({ ...line, restock_type: "no_restock" })),
            transactions: [{
              kind: "suggested_refund",
              gateway: "shopify_payments",
              parent_id: 222,
              amount: (units * 8.5).toFixed(2),
              maximum_refundable: "30.00",
            }],
          },
        }, { headers: { "retry-after": "0" } });
      }
      if (href.includes("/graphql")) {
        committedRefund = body?.variables?.input ?? null;
        if (options.commit === "refused") {
          events.push("provider:refund_refused");
          return jsonResponse({
            data: {
              refundCreate: {
                refund: null,
                userErrors: [{ field: ["refundLineItems"], message: "That line item is not refundable." }],
              },
            },
          }, { headers: { "retry-after": "0" } });
        }
        events.push("provider:commit_refund");
        return jsonResponse({
          data: {
            refundCreate: {
              refund: {
                id: "gid://shopify/Refund/9002",
                totalRefundedSet: { presentmentMoney: { amount: committedRefund?.transactions?.[0]?.amount ?? "0.00" } },
                transactions: { nodes: [{ id: "gid://shopify/OrderTransaction/7002", status: "SUCCESS" }] },
              },
              userErrors: [],
            },
          },
        }, { headers: { "retry-after": "0" } });
      }
      events.push("provider:read_order");
      return jsonResponse({ order: COMPOUND_ORDER }, { headers: { "retry-after": "0" } });
    }));
  }

  beforeEach(() => {
    committedRefund = null;
    installCompoundShopify();
    // The executor runs two KB queries: the search itself and the memory-override
    // sweep behind it. Only the first is the policy read.
    mockKbSearch.mockImplementation(async (args: { where?: { OR?: unknown } }) => {
      if (!args?.where?.OR) return [];
      events.push("read:policy");
      return [NAPKIN_POLICY];
    });
  });

  function proposedActions(plan: { rawToolCalls: { id: string; name: string; input: unknown }[] }) {
    return plan.rawToolCalls.filter(call => TOOL_CATEGORIES[call.name] === "action");
  }
  // What an approval runs: every call the card shows except the reads, which
  // already ran during planning.
  function approvedCalls(plan: { rawToolCalls: { id: string; name: string; input: unknown }[] }) {
    return plan.rawToolCalls.filter(call => TOOL_CATEGORIES[call.name] !== "read");
  }

  it("reads the order and the policy, proposes one line with its reply, and sends that reply once it commits", async () => {
    mockCreate
      .mockImplementationOnce(async () => {
        events.push("model:plan_1");
        return toolUse("t1", "get_order_by_name", { order_name: "#1011" });
      })
      .mockImplementationOnce(async () => {
        events.push("model:plan_2");
        return toolUse("t2", "search_kb", { query: "damaged item refund policy" });
      })
      .mockImplementationOnce(async () => {
        events.push("model:plan_3");
        return toolUse("t3", "create_partial_refund", PARTIAL_REFUND_PROPOSAL.input);
      })
      .mockImplementationOnce(async () => {
        events.push("model:plan_4");
        return toolUse("t4", "send_reply", { text: "We're refunding the torn napkin." });
      });

    const ctx = supportCtx();
    const instruction = "One of the napkins arrived torn - sort it out.";
    const plan = await planAgent(ctx, instruction, LIVE_SETTINGS, { exactDraftProposal: true });

    // Planning investigated, proposed one line, and drafted the reply the
    // merchant approves with it.
    expect(plan.rawToolCalls.map(call => call.name))
      .toEqual(["get_order_by_name", "search_kb", "create_partial_refund", "send_reply"]);
    expect(plan.communication).toMatchObject({ mode: "exact_draft", draft: "We're refunding the torn napkin." });
    expect(proposedActions(plan)[0]?.input).toMatchObject({
      approval_amount: "8.50",
      approval_currency: "USD",
    });

    const result = await runAgent(ctx, instruction, approvedCalls(plan), LIVE_SETTINGS);

    expect(events).toEqual([
      "model:plan_1",
      "provider:lookup_order",
      "model:plan_2",
      "read:policy",
      "model:plan_3",
      "model:plan_4",
      "provider:read_order",
      "provider:calculate_refund",
      "provider:read_order",
      "provider:calculate_refund",
      "provider:commit_refund",
      "io:send_reply",
    ]);
    expect(result.actionsPerformed.map(action => action.tool))
      .toEqual(["create_partial_refund", "send_reply"]);
    expect(mockSendReply.mock.calls[0]?.[0]).toMatchObject({ text: "We're refunding the torn napkin." });

    // One line of three units, priced by Shopify. Putting that figure into the
    // approved reply is the receipt-bound placeholder work that follows.
    expect(committedRefund?.refundLineItems)
      .toEqual([{ lineItemId: "gid://shopify/LineItem/11", quantity: 1, restockType: "NO_RESTOCK" }]);
    expect(committedRefund?.transactions?.[0]?.amount).toBe("8.50");
  });

  it("commits the proposal the merchant revised to, not the one it replaced", async () => {
    mockCreate
      .mockImplementationOnce(async () => {
        events.push("model:plan_1");
        return toolUse("t1", "get_order_by_name", { order_name: "#1011" });
      })
      .mockImplementationOnce(async () => {
        events.push("model:plan_2");
        return toolUse("t3", "create_partial_refund", PARTIAL_REFUND_PROPOSAL.input);
      })
      .mockImplementationOnce(async () => {
        events.push("model:plan_3");
        return toolUse("t4", "send_reply", { text: "We're refunding the torn napkin." });
      })
      .mockImplementationOnce(async () => {
        events.push("model:replan_1");
        return toolUse("t5", "create_partial_refund", {
          order_id: "456",
          items: [{ line_item_id: "11", quantity: 2 }],
          reason: "Both napkins arrived torn",
        });
      })
      .mockImplementationOnce(async () => {
        events.push("model:replan_2");
        return toolUse("t6", "send_reply", { text: "We're refunding both napkins." });
      });

    const ctx = supportCtx();
    const first = await planAgent(ctx, "One of the napkins arrived torn - sort it out.", LIVE_SETTINGS, {
      exactDraftProposal: true,
    });
    // The merchant changes the instruction instead of approving what they were
    // shown, so the proposal they approve is the one planned from the new one.
    const revisedInstruction = "Both napkins were torn - refund both of them.";
    const revised = await planAgent(ctx, revisedInstruction, LIVE_SETTINGS, { exactDraftProposal: true });

    const result = await runAgent(ctx, revisedInstruction, approvedCalls(revised), LIVE_SETTINGS);

    // The superseded proposal named and quoted one napkin but never committed
    // anything; the money that moved is the revised selection's approved quote,
    // and the reply sent is the revised one.
    expect(proposedActions(first)[0]?.input).toMatchObject({ items: [{ line_item_id: "11", quantity: 1 }] });
    expect(events.filter(event => event === "provider:commit_refund")).toHaveLength(1);
    expect(committedRefund?.refundLineItems)
      .toEqual([{ lineItemId: "gid://shopify/LineItem/11", quantity: 2, restockType: "NO_RESTOCK" }]);
    expect(committedRefund?.transactions?.[0]?.amount).toBe("17.00");
    expect(result.actionsPerformed.map(action => action.tool))
      .toEqual(["create_partial_refund", "send_reply"]);
    expect(mockSendReply).toHaveBeenCalledTimes(1);
    expect(mockSendReply.mock.calls[0]?.[0]).toMatchObject({ text: "We're refunding both napkins." });
  });

  it("tells the customer nothing when the provider refuses the refund", async () => {
    installCompoundShopify({ commit: "refused" });
    mockCreate.mockImplementation(async () => {
      events.push("model:call");
      return { stop_reason: "end_turn", content: [{ type: "text", text: "Done." }], usage: USAGE };
    });

    const result = await runAgent(
      supportCtx(),
      "One of the napkins arrived torn - sort it out.",
      [PARTIAL_REFUND_PROPOSAL, { id: "t4", name: "send_reply", input: { text: "We're refunding the torn napkin." } }],
      LIVE_SETTINGS,
    );

    // The approved reply was written for the refund going through, so a refused
    // refund stops the batch before it and the customer hears nothing.
    expect(events).toContain("provider:refund_refused");
    expect(mockCreate).not.toHaveBeenCalled();
    expect(events).not.toContain("io:send_reply");
    expect(result.actionsPerformed).toHaveLength(1);
    expect(result.actionsPerformed[0]).toMatchObject({ tool: "create_partial_refund", status: "error" });
  });
});
