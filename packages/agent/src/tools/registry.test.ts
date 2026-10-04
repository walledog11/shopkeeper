import { describe, expect, it, vi } from "vitest";
import { AGENT_SETTINGS_DEFAULTS } from "../settings.js";
import type { BaseAgentContext } from "../agent-context.js";
import { toolOk } from "./result.js";
import {
  AGENT_TOOLS,
  TOOL_DEFINITIONS,
  TOOL_REQUIRED_SCOPES,
  getToolDefinition,
  selectAgentTools,
  toolScopesGranted,
  unmetToolCapability,
  type ToolExecutionDeps,
  type ToolName,
} from "./registry/index.js";
import { defineTool, stringArg } from "./registry/schema.js";

// Kept resolvable so historical AgentAction rows still render, and proved
// non-executable below. A name lands here when its capability moves to another
// tool, never when it simply stops being used.
const RETIRED_TOOL_INPUTS: Partial<Record<ToolName, unknown>> = {
  issue_discount: { percentage: 10, reason: "Shipping delay" },
  issue_store_credit: { customer_id: "1001", amount: "25.00" },
  search_shopify_customers: { query: "jane@example.com", limit: 2 },
  get_shopify_customer: { customer_id: "1001" },
};

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
    createReturn: vi.fn().mockResolvedValue(toolOk("createReturn")),
    createExchange: vi.fn().mockResolvedValue(toolOk("createExchange")),
    createGiftCard: vi.fn().mockResolvedValue({ ...toolOk("createGiftCard"), spentCents: 2500 }),
    attachReturnLabel: vi.fn().mockResolvedValue(toolOk("attachReturnLabel")),
    fulfillOrder: vi.fn().mockResolvedValue(toolOk("fulfillOrder")),
    searchKnowledgeBaseArticles: vi.fn().mockResolvedValue([]),
    selectAnsweringKbArticles: vi.fn().mockResolvedValue([]),
    recordKnowledgeBaseCitations: vi.fn().mockResolvedValue(undefined),
    getSupportStats: vi.fn().mockResolvedValue(null),
    recordReturnWatch: vi.fn().mockResolvedValue(undefined),
  };
}

describe("agent tool registry", () => {
  it("exposes required merchant work as unscheduled in the offered return and exchange schemas", () => {
    for (const name of ["create_return", "create_exchange"] as const) {
      const description = AGENT_TOOLS.find(tool => tool.name === name)!.description!;
      expect(JSON.parse(description.split("\n").at(-1)!)).toEqual({
        merchant_follow_up: {
          kind: "send_return_label",
          status: "requires_merchant",
          scheduledByTool: false,
          customerCommitmentEstablishedByTool: false,
        },
      });
    }
    const label = definitionFor("attach_return_label");
    expect(AGENT_TOOLS.find(tool => tool.name === label.name)?.description).toBe(label.description);
  });

  it("leaves create_refund pricing for the runtime to bind", () => {
    const definition = definitionFor("create_refund");

    expect(definition.inputSchema.required).toEqual(["order_id"]);
    expect(definition.parse({ order_id: "2001" })).toEqual({ order_id: "2001" });
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

  it("parses the runtime-bound item names but never shows them to the model", () => {
    for (const name of ["create_partial_refund", "create_return", "create_exchange", "edit_shopify_order"] as const) {
      expect(definitionFor(name).inputSchema.properties).not.toHaveProperty("approval_line_items");
    }
    const bound = {
      order_id: "2001",
      approval_line_items: [{ name: "Napkin - Special", quantity: 1, change: "return" }],
    };

    expect(definitionFor("create_return").parse(bound)).toEqual(bound);
    expect(() => definitionFor("create_return").parse({
      order_id: "2001",
      approval_line_items: [{ name: "Napkin", quantity: 1, change: "gift" }],
    })).toThrow(/must be one of/);
  });

  it("rejects blank customer-facing messaging fields in schema and parser", () => {
    const reply = definitionFor("send_reply");

    expect(reply.inputSchema.properties?.text).toMatchObject({ minLength: 1 });
    expect(() => reply.parse({ text: "   " })).toThrow(/must not be blank/);
  });

  it.each(Object.entries(RETIRED_TOOL_INPUTS) as [ToolName, unknown][])(
    "never routes retired tool %s to a provider dependency",
    async (name, input) => {
      const ctx = makeCtx();
      const deps = makeDeps();
      const definition = definitionFor(name);
      const result = await definition.execute(
        definition.parse(input),
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
});

describe("Shopify scope gating", () => {
  it("keeps the whole tool set for a store holding the scopes required by migrated tools", () => {
    const complete = selectAgentTools(undefined, null, [
      "read_products",
      "write_orders",
      "write_customers",
      "write_returns",
      "write_merchant_managed_fulfillment_orders",
      "write_order_edits",
      "read_orders",
      "write_gift_cards",
      "read_gift_cards",
    ]).map((t) => t.name);
    const unchecked = selectAgentTools(undefined, null, null).map((t) => t.name);

    expect(complete).toEqual(unchecked);
  });

  it("withholds only the tool whose scope is missing", () => {
    const short = selectAgentTools(undefined, null, []).map((tool) => tool.name);
    const unchecked = selectAgentTools(undefined, null, null).map((tool) => tool.name);

    expect(unchecked).toContain("get_inventory_status");
    expect(unchecked.filter((name) => !short.includes(name))).toEqual([
      "search_shopify_products",
      "get_inventory_status",
      "update_shopify_customer_info",
      "add_shopify_customer_note",
      "get_shopify_orders",
      "update_shopify_order_address",
      "get_order_by_name",
      "get_order_fulfillment_status",
      "get_order_tracking",
      "create_refund",
      "create_partial_refund",
      "cancel_order",
      "create_shopify_order",
      "edit_shopify_order",
      "create_return",
      "create_exchange",
      "create_gift_card",
      "attach_return_label",
      "fulfill_order",
    ]);
  });

  it("declares the exact scopes currently required by scoped tools", () => {
    const scoped = TOOL_DEFINITIONS.flatMap((definition) => TOOL_REQUIRED_SCOPES[definition.name]);

    expect(scoped.length).toBeGreaterThan(0);
    expect([...new Set(scoped)]).toEqual([
      "read_products",
      "write_customers",
      "read_orders",
      "write_orders",
      "write_order_edits",
      "write_returns",
      "write_gift_cards",
      "read_gift_cards",
      "write_merchant_managed_fulfillment_orders",
    ]);
  });

  it("reads a tool's requirement through the shared grant rule", () => {
    expect(toolScopesGranted("search_shopify_products", [])).toBe(false);
    expect(toolScopesGranted("search_shopify_products", ["read_products"])).toBe(true);
    expect(toolScopesGranted("search_shopify_products", ["write_products"])).toBe(true);
    expect(toolScopesGranted("get_inventory_status", [])).toBe(false);
    expect(toolScopesGranted("get_inventory_status", ["write_products"])).toBe(true);
    expect(toolScopesGranted("get_shopify_orders", [])).toBe(false);
    expect(toolScopesGranted("get_shopify_orders", ["read_orders"])).toBe(true);
    expect(toolScopesGranted("get_order_by_name", ["write_orders"])).toBe(true);
    expect(toolScopesGranted("get_order_fulfillment_status", [])).toBe(false);
    expect(toolScopesGranted("get_order_tracking", ["read_orders"])).toBe(true);
    expect(toolScopesGranted("update_shopify_order_address", ["write_orders"])).toBe(false);
    expect(toolScopesGranted("update_shopify_order_address", ["write_orders", "write_customers"])).toBe(true);
    expect(toolScopesGranted("update_shopify_customer_info", ["read_customers"])).toBe(false);
    expect(toolScopesGranted("update_shopify_customer_info", ["write_customers"])).toBe(true);
    expect(toolScopesGranted("add_shopify_customer_note", ["read_customers"])).toBe(false);
    expect(toolScopesGranted("add_shopify_customer_note", ["write_customers"])).toBe(true);
    expect(toolScopesGranted("create_refund", ["read_orders"])).toBe(false);
    expect(toolScopesGranted("create_refund", ["write_orders"])).toBe(true);
    expect(toolScopesGranted("create_shopify_order", ["read_orders"])).toBe(false);
    expect(toolScopesGranted("create_shopify_order", ["write_orders"])).toBe(true);
    expect(toolScopesGranted("create_gift_card", ["write_customers"])).toBe(false);
    expect(toolScopesGranted("create_gift_card", ["write_gift_cards"])).toBe(false);
    expect(toolScopesGranted("create_gift_card", ["read_gift_cards", "write_customers"])).toBe(false);
    expect(toolScopesGranted("create_gift_card", ["write_gift_cards", "write_customers"])).toBe(true);
    expect(toolScopesGranted("create_gift_card", ["write_gift_cards", "write_customers", "read_gift_cards"])).toBe(true);
    expect(toolScopesGranted("create_return", ["read_returns"])).toBe(false);
    expect(toolScopesGranted("create_return", ["write_returns"])).toBe(true);
    expect(toolScopesGranted("create_exchange", ["write_returns"])).toBe(false);
    expect(toolScopesGranted("create_exchange", ["read_products", "write_returns"])).toBe(true);
    expect(toolScopesGranted("attach_return_label", ["read_returns"])).toBe(false);
    expect(toolScopesGranted("attach_return_label", ["write_returns"])).toBe(true);
    expect(toolScopesGranted("edit_shopify_order", ["write_order_edits"])).toBe(false);
    expect(toolScopesGranted("edit_shopify_order", ["write_order_edits", "read_orders"])).toBe(true);
    expect(toolScopesGranted("fulfill_order", ["read_orders"])).toBe(false);
    expect(toolScopesGranted("fulfill_order", ["write_merchant_managed_fulfillment_orders"])).toBe(true);
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

      expect(refusal?.status).toBe("policy_block");
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
