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
  ToolInputValidationError,
  getToolDefinition,
  toolNamesForGroups,
  type ToolExecutionDeps,
  type ToolName,
} from "./registry.js";

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
  add_internal_note: { text: "Documented action." },
  send_reply: { text: "Thanks, this is handled." },
  send_email: { to: "jane@example.com", subject: "Order update", body: "Your order was updated." },
  update_thread_status: { status: "closed" },
  update_thread_tag: { tag: "Shipping" },
  escalate_to_human: { reason: "Needs manual review." },
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
    customerMemory: null,
    recentMessages: [],
    shopify: { shop: "test-store.myshopify.com", accessToken: "shpat_test" },
    escalate: vi.fn().mockResolvedValue(undefined),
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
    incrementDailyRefundSpendCents: vi.fn().mockResolvedValue(undefined),
    searchKnowledgeBaseArticles: vi.fn().mockResolvedValue([{
      id: "kb_1",
      title: "Returns policy",
      body: "We accept returns within 30 days.",
      tags: ["Returns"],
    }]),
    recordKnowledgeBaseCitations: vi.fn().mockResolvedValue(undefined),
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
  it("covers every registered tool with a routing assertion", () => {
    const routedNames = [
      "search_kb",
      ...SHOPIFY_TOOL_ROUTES.map(([name]) => name),
      ...THREAD_TOOL_ROUTES.map(([name]) => name),
      "escalate_to_human",
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
    if (name === "create_refund") {
      expect(deps.incrementDailyRefundSpendCents).toHaveBeenCalledWith("org_1", 1234);
    }
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
});
