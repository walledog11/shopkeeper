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
  TOOL_REQUIRED_SCOPES,
  READ_TOOL_NAMES,
  ToolInputValidationError,
  getToolDefinition,
  selectAgentTools,
  toolNamesForGroups,
  toolScopesGranted,
  unmetToolCapability,
  type ToolExecutionDeps,
  type ToolName,
} from "./registry/index.js";
import { defineTool, stringArg } from "./registry/schema.js";

const VALID_TOOL_INPUTS: Record<ToolName, unknown> = {
  search_kb: { query: "returns policy" },
  search_shopify_products: { query: "pencil half zip", limit: 3 },
  get_inventory_status: { query: "olive linen napkins", limit: 3 },
  find_customer: { by: "query", value: "jane@example.com", limit: 2 },
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
  get_order_fulfillment_status: { order_number: "#1234", email: "jane@test.com" },
  get_order_tracking: { order_id: "2001" },
  create_refund: { order_id: "2001", amount: "19.99", reason: "Damaged item" },
  create_partial_refund: { order_id: "2001", items: [{ line_item_id: "9001", quantity: 1 }], reason: "One arrived torn" },
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
  fulfill_order: { order_id: "2001", tracking_number: "1Z999", tracking_company: "UPS" },
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
  ["get_inventory_status", "getInventoryStatus"],
  ["find_customer", "findCustomer"],
  ["update_shopify_customer_info", "updateShopifyCustomerInfo"],
  ["get_shopify_orders", "getShopifyOrders"],
  ["update_shopify_order_address", "updateShopifyOrderAddress"],
  ["add_shopify_customer_note", "addShopifyCustomerNote"],
  ["get_order_by_name", "getOrderByName"],
  ["get_order_fulfillment_status", "getOrderFulfillmentStatus"],
  ["get_order_tracking", "getOrderTracking"],
  ["create_refund", "createRefund"],
  ["create_partial_refund", "createPartialRefund"],
  ["cancel_order", "cancelOrder"],
  ["create_shopify_order", "createShopifyOrder"],
  ["edit_shopify_order", "editShopifyOrder"],
  ["create_return", "createReturn"],
  ["create_exchange", "createExchange"],
  ["create_gift_card", "createGiftCard"],
  ["attach_return_label", "attachReturnLabel"],
  ["fulfill_order", "fulfillOrder"],
] as const satisfies readonly (readonly [ToolName, keyof ToolExecutionDeps])[];

// Kept resolvable so historical AgentAction rows still render, and proved
// non-executable below. A name lands here when its capability moves to another
// tool, never when it simply stops being used.
const RETIRED_TOOL_NAMES = [
  "issue_discount",
  "issue_store_credit",
  "search_shopify_customers",
  "get_shopify_customer",
] as const satisfies readonly ToolName[];

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
    getInventoryStatus: vi.fn().mockResolvedValue(toolOk("getInventoryStatus")),
    findCustomer: vi.fn().mockResolvedValue(toolOk("findCustomer")),
    updateShopifyCustomerInfo: vi.fn().mockResolvedValue(toolOk("updateShopifyCustomerInfo")),
    getShopifyOrders: vi.fn().mockResolvedValue(toolOk("getShopifyOrders")),
    updateShopifyOrderAddress: vi.fn().mockResolvedValue(toolOk("updateShopifyOrderAddress")),
    addShopifyCustomerNote: vi.fn().mockResolvedValue(toolOk("addShopifyCustomerNote")),
    getOrderByName: vi.fn().mockResolvedValue(toolOk("getOrderByName")),
    getOrderFulfillmentStatus: vi.fn().mockResolvedValue(toolOk("getOrderFulfillmentStatus")),
    getOrderTracking: vi.fn().mockResolvedValue(toolOk("getOrderTracking")),
    createRefund: vi.fn().mockResolvedValue({ ...toolOk("createRefund"), refundedCents: 1234 }),
    createPartialRefund: vi.fn().mockResolvedValue({ ...toolOk("createPartialRefund"), refundedCents: 500 }),
    cancelOrder: vi.fn().mockResolvedValue(toolOk("cancelOrder")),
    createShopifyOrder: vi.fn().mockResolvedValue(toolOk("createShopifyOrder")),
    editShopifyOrder: vi.fn().mockResolvedValue(toolOk("editShopifyOrder")),
    issueDiscount: vi.fn().mockResolvedValue(toolOk("issueDiscount")),
    createReturn: vi.fn().mockResolvedValue(toolOk("createReturn")),
    createExchange: vi.fn().mockResolvedValue(toolOk("createExchange")),
    issueStoreCredit: vi.fn().mockResolvedValue({ ...toolOk("issueStoreCredit"), spentCents: 2500 }),
    createGiftCard: vi.fn().mockResolvedValue({ ...toolOk("createGiftCard"), spentCents: 2500 }),
    attachReturnLabel: vi.fn().mockResolvedValue(toolOk("attachReturnLabel")),
    fulfillOrder: vi.fn().mockResolvedValue(toolOk("fulfillOrder")),
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
  };
}

describe("agent tool registry", () => {
  it("derives Anthropic schemas, labels, categories, and groups from every definition", () => {
    const toolNames = TOOL_DEFINITIONS.map((definition) => definition.name);

    expect(Object.keys(VALID_TOOL_INPUTS).sort()).toEqual([...toolNames].sort());
    expect(AGENT_TOOLS.map((tool) => tool.name)).toEqual(
      TOOL_DEFINITIONS.filter(definition => definition.availability === "active").map(definition => definition.name),
    );
    expect(AGENT_TOOLS.map(tool => tool.name)).not.toContain("issue_discount");
    expect(AGENT_TOOLS.map(tool => tool.name)).not.toContain("issue_store_credit");

    for (const definition of TOOL_DEFINITIONS) {
      expect(TOOL_CATEGORIES[definition.name]).toBe(definition.category);
      expect(TOOL_LABELS[definition.name]).toBe(definition.labels.executed);
      if (definition.availability === "active") {
        expect(TOOL_GROUPS[definition.group]).toContain(definition.name);
      } else {
        expect(TOOL_GROUPS[definition.group]).not.toContain(definition.name);
      }
    }
  });

  it("keeps the existing group selector ordering", () => {
    expect(toolNamesForGroups("product", "messaging")).toEqual([
      "search_shopify_products",
      "get_inventory_status",
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

  // Tools that accept alternative identifiers rather than one mandatory field.
  // They enforce "at least one of" inside execute instead, so there is no single
  // key whose absence should throw. Kept as an explicit set so the invariant
  // still holds for every other tool.
  // `get_inventory_status` joins them for a different reason: omitting `query`
  // is a second question ("what am I running out of"), not a missing argument.
  const ALTERNATIVE_IDENTIFIER_TOOLS = new Set([
    "get_order_fulfillment_status",
    "get_inventory_status",
  ]);

  it.each(TOOL_DEFINITIONS.map((definition) => [definition.name, definition] as const))(
    "rejects missing required input for %s",
    (name, definition) => {
      if (ALTERNATIVE_IDENTIFIER_TOOLS.has(name)) {
        expect(definition.inputSchema.required ?? []).toEqual([]);
        return;
      }
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

  it("requires create_gift_card customer delivery identity", () => {
    const definition = definitionFor("create_gift_card");

    expect(definition.inputSchema.required).toEqual(["amount", "customer_id"]);
    expect(() => definition.parse({ amount: "20.00" })).toThrow(/input.customer_id is required/);
  });

  it("rejects unknown fields before execution", () => {
    const definition = definitionFor("send_reply");

    expect(() => definition.parse({ text: "hello", order_id: "2001" })).toThrow(/input.order_id is not allowed/);
  });

  it("rejects blank customer-facing messaging fields in schema and parser", () => {
    const reply = definitionFor("send_reply");

    expect(reply.inputSchema.properties?.text).toMatchObject({ minLength: 1 });
    expect(() => reply.parse({ text: "   " })).toThrow(/must not be blank/);
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
      ...RETIRED_TOOL_NAMES,
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

  it.each(RETIRED_TOOL_NAMES)(
    "never routes retired tool %s to a provider dependency",
    async (name) => {
      const ctx = makeCtx();
      const deps = makeDeps();
      const definition = definitionFor(name);
      const result = await definition.execute(
        definition.parse(VALID_TOOL_INPUTS[name]),
        ctx,
        AGENT_SETTINGS_DEFAULTS,
        deps,
      );

      expect(definition.availability).toBe("retired");
      expect(result.status).toBe("policy_block");
      for (const dep of Object.values(deps)) {
        if (vi.isMockFunction(dep)) expect(dep).not.toHaveBeenCalled();
      }
    },
  );

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

describe("Shopify scope gating", () => {
  // The graceful-degradation guarantee: a merchant whose token predates every
  // scoped capability keeps the entire tool set they had before the gate existed.
  // A store connected before the gate holds `read_products`, so it keeps every
  // tool. Only a grant genuinely missing a scope loses the tool that needs it.
  it("keeps the whole tool set for a store holding the long-standing scopes", () => {
    const complete = selectAgentTools(undefined, null, ["read_products"]).map((t) => t.name);
    const unchecked = selectAgentTools(undefined, null, null).map((t) => t.name);

    expect(complete).toEqual(unchecked);
  });

  it("withholds only the tool whose scope is missing", () => {
    const short = selectAgentTools(undefined, null, []).map((tool) => tool.name);
    const unchecked = selectAgentTools(undefined, null, null).map((tool) => tool.name);

    expect(unchecked).toContain("get_inventory_status");
    expect(unchecked.filter((name) => !short.includes(name))).toEqual(["get_inventory_status"]);
  });

  // Every scope a tool declares must be one a connected store already holds, or
  // the capability silently disappears for merchants who never re-authorize.
  // `read_products` has been in the requested set since long before this gate.
  it("declares only scopes an existing grant already covers", () => {
    const scoped = TOOL_DEFINITIONS.flatMap((definition) => TOOL_REQUIRED_SCOPES[definition.name]);

    expect(scoped.length).toBeGreaterThan(0);
    expect([...new Set(scoped)]).toEqual(["read_products"]);
  });

  it("reads a tool's requirement through the shared grant rule", () => {
    expect(toolScopesGranted("search_shopify_products", [])).toBe(true);
    expect(toolScopesGranted("get_inventory_status", [])).toBe(false);
    expect(toolScopesGranted("get_inventory_status", ["write_products"])).toBe(true);
  });

  describe("a tool that does declare scopes", () => {
    const scopedTool = defineTool({
      name: "scoped_probe",
      description: "Probe tool for the scope gate.",
      fields: { value: stringArg("v") },
      category: "action",
      group: "product",
      capabilities: ["shopify"],
      label: "Probed",
      planStepLabel: "Probe",
      requiredScopes: ["write_products"],
      execute: async () => toolOk("ok"),
    });

    function shopifyCtx(grantedScopes: readonly string[]): BaseAgentContext {
      return {
        orgId: "org_1",
        orgName: "Test",
        recentMessages: [],
        shopify: { shop: "t.myshopify.com", accessToken: "token", grantedScopes },
        escalate: async () => {},
      };
    }

    it("runs when the grant covers it", () => {
      expect(unmetToolCapability(scopedTool, shopifyCtx(["write_products"]))).toBeNull();
    });

    it("refuses with the scope named and a way out", () => {
      const refusal = unmetToolCapability(scopedTool, shopifyCtx(["read_products"]));

      expect(refusal?.message).toContain("write_products");
      expect(refusal?.message).toContain("Reconnect Shopify");
    });

    // No connection at all is the capability gate's answer, not the scope
    // gate's, so the merchant is told what is actually wrong.
    it("reports a missing connection rather than a missing scope", () => {
      const refusal = unmetToolCapability(scopedTool, {
        orgId: "org_1",
        orgName: "Test",
        recentMessages: [],
        shopify: null,
        escalate: async () => {},
      });

      expect(refusal?.message).toContain("no Shopify integration connected");
      expect(refusal?.message).not.toContain("write_products");
    });
  });
});
