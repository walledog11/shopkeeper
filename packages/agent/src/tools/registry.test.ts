import { describe, expect, it, vi } from "vitest";
import { AGENT_SETTINGS_DEFAULTS } from "../settings.js";
import type { BaseAgentContext } from "../agent-context.js";
import { toolOk } from "./result.js";
import {
  AGENT_TOOLS,
  TOOL_CATEGORIES,
  TOOL_DEFINITIONS,
  TOOL_GROUPS,
  TOOL_LABELS,
  READ_TOOL_NAMES,
  ToolInputValidationError,
  getToolDefinition,
  toolNamesForGroups,
  type ToolExecutionDeps,
  type ToolName,
} from "./registry/index.js";

const VALID_TOOL_INPUTS: Record<ToolName, unknown> = {
  search_kb: { query: "returns policy" },
  search_shopify_products: { query: "pencil half zip", limit: 3 },
  search_shopify_customers: { query: "jane@example.com", limit: 2 },
  get_shopify_customer: { customer_id: "1001" },
  update_shopify_customer_info: { customer_id: "1001", email: "jane@example.com" },
  get_shopify_orders: { customer_id: "1001" },
  update_shopify_order_address: {
    order_id: "2001",
    customer_id: "1001",
    address1: "123 Main St",
    city: "New York",
    province: "NY",
    zip: "10001",
    country: "United States",
  },
  add_shopify_customer_note: { customer_id: "1001", note: "VIP customer" },
  get_order_by_name: { order_name: "#1234" },
  get_order_tracking: { order_id: "2001" },
  create_refund: { order_id: "2001", amount: "19.99", reason: "Damaged item" },
  cancel_order: { order_id: "2001", reason: "customer", restock: true },
  create_shopify_order: {
    email: "jane@example.com",
    first_name: "Jane",
    last_name: "Smith",
    address1: "123 Main St",
    city: "New York",
    province: "NY",
    zip: "10001",
    country: "United States",
    line_items: [{ variant_id: "3001", quantity: 1 }],
  },
  edit_shopify_order: { order_id: "2001", variant_id: "3002", quantity: 1 },
  issue_discount: { percentage: 10, reason: "Shipping delay" },
  create_return: { order_id: "2001", variant_id: "3002", reason: "defective" },
  create_exchange: { order_id: "2001", variant_id: "3002", exchange_variant_id: "3003", quantity: 1, reason: "too_small" },
  issue_store_credit: { customer_id: "1001", amount: "25.00" },
  create_gift_card: { amount: "25.00", customer_id: "1001", reason: "Damaged item" },
  attach_return_label: { order_id: "2001", label_url: "https://labels.example.com/rma-2001.pdf" },
  add_internal_note: { text: "Documented action." },
  send_reply: { text: "Thanks, this is handled." },
  send_email: { to: "jane@example.com", subject: "Order update", body: "Your order was updated." },
  update_thread_status: { status: "closed" },
  update_thread_tag: { tag: "Shipping" },
  escalate_to_human: { reason: "Needs manual review." },
  ask_operator: { question: "Do we ship to Canada?" },
  get_support_stats: { days: 7 },
};

const SHOPIFY_TOOL_ROUTES = [
  ["search_shopify_products", "searchShopifyProducts"],
  ["search_shopify_customers", "searchShopifyCustomers"],
  ["get_shopify_customer", "getShopifyCustomer"],
  ["update_shopify_customer_info", "updateShopifyCustomerInfo"],
  ["get_shopify_orders", "getShopifyOrders"],
  ["update_shopify_order_address", "updateShopifyOrderAddress"],
  ["add_shopify_customer_note", "addShopifyCustomerNote"],
  ["get_order_by_name", "getOrderByName"],
  ["get_order_tracking", "getOrderTracking"],
  ["create_refund", "createRefund"],
  ["cancel_order", "cancelOrder"],
  ["create_shopify_order", "createShopifyOrder"],
  ["edit_shopify_order", "editShopifyOrder"],
  ["issue_discount", "issueDiscount"],
  ["create_return", "createReturn"],
  ["create_exchange", "createExchange"],
  ["issue_store_credit", "issueStoreCredit"],
  ["create_gift_card", "createGiftCard"],
  ["attach_return_label", "attachReturnLabel"],
] as const satisfies readonly (readonly [ToolName, keyof ToolExecutionDeps])[];

const THREAD_TOOL_ROUTES = [
  ["add_internal_note", "addInternalNote"],
  ["send_reply", "sendReply"],
  ["send_email", "sendEmail"],
  ["update_thread_status", "updateThreadStatus"],
  ["update_thread_tag", "updateThreadTag"],
] as const;

function cloneInput(name: ToolName): Record<string, unknown> {
  return JSON.parse(JSON.stringify(VALID_TOOL_INPUTS[name])) as Record<string, unknown>;
}

function definitionFor(name: ToolName) {
  const definition = getToolDefinition(name);
  expect(definition).toBeDefined();
  return definition!;
}

function makeCtx(): BaseAgentContext {
  return {
    orgId: "org_1",
    orgName: "Test Store",
    recentMessages: [],
    shopify: { shop: "test-store.myshopify.com", accessToken: "shpat_test" },
    escalate: vi.fn().mockResolvedValue(undefined),
    askOperator: vi.fn().mockResolvedValue(undefined),
    io: {
      addInternalNote: vi.fn().mockResolvedValue(toolOk("addInternalNote")),
      sendReply: vi.fn().mockResolvedValue(toolOk("sendReply")),
      sendEmail: vi.fn().mockResolvedValue(toolOk("sendEmail")),
      updateThreadStatus: vi.fn().mockResolvedValue(toolOk("updateThreadStatus")),
      updateThreadTag: vi.fn().mockResolvedValue(toolOk("updateThreadTag")),
    },
  };
}

function makeSupportCtx(): BaseAgentContext {
  return {
    ...makeCtx(),
    thread: {
      id: "thread_1",
      status: "open",
      channelType: "email",
      tag: null,
      aiSummary: null,
      shopifyCustomerId: null,
    },
  } as BaseAgentContext;
}

function makeDeps(): ToolExecutionDeps {
  return {
    searchShopifyProducts: vi.fn().mockResolvedValue(toolOk("searchShopifyProducts")),
    searchShopifyCustomers: vi.fn().mockResolvedValue(toolOk("searchShopifyCustomers")),
    getShopifyCustomer: vi.fn().mockResolvedValue(toolOk("getShopifyCustomer")),
    updateShopifyCustomerInfo: vi.fn().mockResolvedValue(toolOk("updateShopifyCustomerInfo")),
    getShopifyOrders: vi.fn().mockResolvedValue(toolOk("getShopifyOrders")),
    updateShopifyOrderAddress: vi.fn().mockResolvedValue(toolOk("updateShopifyOrderAddress")),
    addShopifyCustomerNote: vi.fn().mockResolvedValue(toolOk("addShopifyCustomerNote")),
    getOrderByName: vi.fn().mockResolvedValue(toolOk("getOrderByName")),
    getOrderTracking: vi.fn().mockResolvedValue(toolOk("getOrderTracking")),
    createRefund: vi.fn().mockResolvedValue({ ...toolOk("createRefund"), refundedCents: 1234 }),
    cancelOrder: vi.fn().mockResolvedValue(toolOk("cancelOrder")),
    createShopifyOrder: vi.fn().mockResolvedValue(toolOk("createShopifyOrder")),
    editShopifyOrder: vi.fn().mockResolvedValue(toolOk("editShopifyOrder")),
    issueDiscount: vi.fn().mockResolvedValue(toolOk("issueDiscount")),
    createReturn: vi.fn().mockResolvedValue(toolOk("createReturn")),
    createExchange: vi.fn().mockResolvedValue(toolOk("createExchange")),
    issueStoreCredit: vi.fn().mockResolvedValue({ ...toolOk("issueStoreCredit"), spentCents: 2500 }),
    createGiftCard: vi.fn().mockResolvedValue({ ...toolOk("createGiftCard"), spentCents: 2500 }),
    attachReturnLabel: vi.fn().mockResolvedValue(toolOk("attachReturnLabel")),
    searchKnowledgeBaseArticles: vi.fn().mockResolvedValue([{
      id: "kb_1",
      title: "Returns policy",
      body: "We accept returns within 30 days.",
      tags: ["Returns"],
    }]),
    recordKnowledgeBaseCitations: vi.fn().mockResolvedValue(undefined),
    getSupportStats: vi.fn().mockResolvedValue({
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-08T00:00:00.000Z",
      tickets: {
        total: 12,
        byTag: [{ tag: "Shipping", count: 7 }],
        byChannel: [{ channel: "email", count: 12 }],
        byDay: [{ day: "2026-06-02", count: 4 }],
      },
      messages: { customer: 20, agent: 5, ai: 11 },
      resolution: { closedCount: 9, avgMinutes: 42 },
    }),
    recordReturnWatch: vi.fn().mockResolvedValue(undefined),
    recordFollowUpWatch: vi.fn().mockResolvedValue(undefined),
  };
}

describe("agent tool registry", () => {
  it("derives Anthropic schemas, labels, categories, and groups from every definition", () => {
    const toolNames = TOOL_DEFINITIONS.map((definition) => definition.name);

    expect(Object.keys(VALID_TOOL_INPUTS).sort()).toEqual([...toolNames].sort());
    expect(AGENT_TOOLS.map((tool) => tool.name)).toEqual(toolNames);

    for (const definition of TOOL_DEFINITIONS) {
      expect(TOOL_CATEGORIES[definition.name]).toBe(definition.category);
      expect(TOOL_LABELS[definition.name]).toBe(definition.labels.executed);
      expect(TOOL_GROUPS[definition.group]).toContain(definition.name);
    }
  });

  it("keeps the existing group selector ordering", () => {
    expect(toolNamesForGroups("product", "messaging")).toEqual([
      "search_shopify_products",
      "send_reply",
      "send_email",
    ]);
  });

  it.each(TOOL_DEFINITIONS.map((definition) => [definition.name, definition] as const))(
    "parses valid input for %s",
    (name, definition) => {
      expect(definition.parse(VALID_TOOL_INPUTS[name])).toEqual(VALID_TOOL_INPUTS[name]);
    },
  );

  it.each(TOOL_DEFINITIONS.map((definition) => [definition.name, definition] as const))(
    "rejects missing required input for %s",
    (name, definition) => {
      const [requiredKey] = definition.inputSchema.required ?? [];
      expect(requiredKey).toBeTruthy();

      const input = cloneInput(name);
      delete input[requiredKey];

      expect(() => definition.parse(input)).toThrow(ToolInputValidationError);
    },
  );

  it("requires create_refund amount in both schema and parser", () => {
    const definition = definitionFor("create_refund");

    expect(definition.inputSchema.required).toEqual(["order_id", "amount"]);
    expect(() => definition.parse({ order_id: "2001" })).toThrow(/input.amount is required/);
  });

  it("rejects unknown fields before execution", () => {
    const definition = definitionFor("send_reply");

    expect(() => definition.parse({ text: "hello", order_id: "2001" })).toThrow(/input.order_id is not allowed/);
  });
});

describe("agent tool execution routing", () => {
  it("derives the complete read-tool list from registry categories", () => {
    expect([...READ_TOOL_NAMES].sort()).toEqual(
      TOOL_DEFINITIONS
        .filter((definition) => definition.category === "read")
        .map((definition) => definition.name)
        .sort(),
    );
  });

  it("covers every registered tool with a routing assertion", () => {
    const routedNames = [
      "search_kb",
      "get_support_stats",
      ...SHOPIFY_TOOL_ROUTES.map(([name]) => name),
      ...THREAD_TOOL_ROUTES.map(([name]) => name),
      "escalate_to_human",
      "ask_operator",
    ];

    expect([...new Set(routedNames)].sort()).toEqual(
      TOOL_DEFINITIONS.map((definition) => definition.name).sort(),
    );
  });

  it.each(SHOPIFY_TOOL_ROUTES)("routes %s to %s", async (name, depName) => {
    const ctx = makeCtx();
    const deps = makeDeps();
    const definition = definitionFor(name);
    const input = definition.parse(VALID_TOOL_INPUTS[name]);

    const result = await definition.execute(input, ctx, AGENT_SETTINGS_DEFAULTS, deps);

    expect(result.message).toBe(depName);
    expect(deps[depName]).toHaveBeenCalledTimes(1);
  });

  it("routes get_support_stats through the stats dependency with clamped days", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    const definition = definitionFor("get_support_stats");
    const input = definition.parse({ days: 500 });

    const result = await definition.execute(input, ctx, AGENT_SETTINGS_DEFAULTS, deps);

    expect(deps.getSupportStats).toHaveBeenCalledWith("org_1", 90);
    expect(result.message).toContain("Shipping");
  });

  it("routes search_kb through the knowledge-base dependency and records thread citations", async () => {
    const ctx = makeSupportCtx();
    const deps = makeDeps();
    const definition = definitionFor("search_kb");
    const input = definition.parse(VALID_TOOL_INPUTS.search_kb);

    const result = await definition.execute(input, ctx, AGENT_SETTINGS_DEFAULTS, deps);

    expect(deps.searchKnowledgeBaseArticles).toHaveBeenCalledWith("org_1", ["returns", "policy"]);
    expect(deps.recordKnowledgeBaseCitations).toHaveBeenCalledWith("org_1", "thread_1", ["kb_1"]);
    expect(result.message).toContain("Returns policy");
  });

  it.each(THREAD_TOOL_ROUTES)("routes %s through ctx.io.%s", async (name, ioMethod) => {
    const ctx = makeCtx();
    const deps = makeDeps();
    const definition = definitionFor(name);
    const input = definition.parse(VALID_TOOL_INPUTS[name]);

    const result = await definition.execute(input, ctx, AGENT_SETTINGS_DEFAULTS, deps);

    expect(result.message).toBe(ioMethod);
    expect(ctx.io?.[ioMethod]).toHaveBeenCalledWith(input);
  });

  it("routes escalate_to_human through the injected escalation sink", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    const definition = definitionFor("escalate_to_human");
    const input = definition.parse(VALID_TOOL_INPUTS.escalate_to_human);

    const result = await definition.execute(input, ctx, AGENT_SETTINGS_DEFAULTS, deps);

    expect(result.status).toBe("escalated");
    expect(ctx.escalate).toHaveBeenCalledWith("Needs manual review.");
  });

  it("routes ask_operator through the injected askOperator sink", async () => {
    const ctx = makeCtx();
    const deps = makeDeps();
    const definition = definitionFor("ask_operator");
    const input = definition.parse(VALID_TOOL_INPUTS.ask_operator);

    const result = await definition.execute(input, ctx, AGENT_SETTINGS_DEFAULTS, deps);

    expect(result.status).toBe("escalated");
    expect(ctx.askOperator).toHaveBeenCalledWith("Do we ship to Canada?");
  });
});
