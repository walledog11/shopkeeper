import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { AgentContext } from "./agent-context.js";
import {
  kbArticlesCoverQuery,
  partitionPlanningReadBlocks,
  shouldSkipPlanningRead,
  synthesizeSkippedPlanningReadResult,
  impliesOrderRefresh,
} from "./planner-read-skip.js";

function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    orgId: "org_1",
    orgName: "Test Store",
    customer: { id: "customer_1", name: "Jane Doe", platformId: "jane@example.com" },
    recentMessages: [{ senderType: "customer", contentText: "Where is order #1001?" }],
    openThreadCount: 1,
    shopify: { shop: "test-store.myshopify.com", accessToken: "shpat_test" },
    recentOrders: [{
      id: "9000000001",
      name: "#1001",
      created_at: "2026-05-18T10:00:00-07:00",
      financial_status: "paid",
      fulfillment_status: "fulfilled",
      total_price: "59.00",
      currency: "USD",
      items: [],
      shipping_address: null,
    }],
    linkedShopifyCustomerName: null,
    kbArticles: [{ title: "Shipping times", body: "Standard shipping takes 3-5 business days." }],
    thread: {
      id: "thread_1",
      status: "open",
      channelType: "email",
      tag: "Support",
      aiSummary: null,
      shopifyCustomerId: "10000000001",
    },
    escalate: async () => {},
    io: {
      addInternalNote: async () => ({ ok: true }),
      sendReply: async () => ({ ok: true }),
      sendEmail: async () => ({ ok: true }),
      updateThreadStatus: async () => ({ ok: true }),
      updateThreadTag: async () => ({ ok: true }),
    },
    ...overrides,
  };
}

function readBlock(name: string, input: Record<string, unknown>, id = "read_1"): Anthropic.ToolUseBlock {
  return { type: "tool_use", id, name, input };
}

describe("shouldSkipPlanningRead", () => {
  it("skips get_order_by_name when the order is already in recentOrders", () => {
    expect(shouldSkipPlanningRead(
      readBlock("get_order_by_name", { order_name: "#1001" }),
      makeCtx(),
      "Process refund for order #1001",
    )).toBe(true);
  });

  it("does not skip get_order_by_name when the order is missing from context", () => {
    expect(shouldSkipPlanningRead(
      readBlock("get_order_by_name", { order_name: "#9999" }),
      makeCtx(),
      "Process refund for order #9999",
    )).toBe(false);
  });

  it("skips get_shopify_orders when orders exist and the instruction does not imply refresh", () => {
    expect(shouldSkipPlanningRead(
      readBlock("get_shopify_orders", { customer_id: "10000000001" }),
      makeCtx(),
      "Reply about the refund request",
    )).toBe(true);
  });

  it("does not skip get_shopify_orders when the instruction asks for a fresh lookup", () => {
    expect(impliesOrderRefresh("Please refresh the latest order status")).toBe(true);
    expect(shouldSkipPlanningRead(
      readBlock("get_shopify_orders", { customer_id: "10000000001" }),
      makeCtx(),
      "Please refresh the latest order status",
    )).toBe(false);
  });

  it("skips get_shopify_customer when the thread already has a linked customer", () => {
    expect(shouldSkipPlanningRead(
      readBlock("get_shopify_customer", { customer_id: "10000000001" }),
      makeCtx(),
      "Reply to the customer",
    )).toBe(true);
  });

  it("skips search_kb when pre-loaded articles cover the query", () => {
    expect(kbArticlesCoverQuery(
      [{ title: "Shipping times", body: "3-5 business days" }],
      "standard shipping times",
      "Support",
    )).toBe(true);

    expect(shouldSkipPlanningRead(
      readBlock("search_kb", { query: "standard shipping times" }),
      makeCtx(),
      "Reply about shipping times",
    )).toBe(true);
  });
});

describe("partitionPlanningReadBlocks", () => {
  it("partitions redundant reads away from executable reads", () => {
    const partition = partitionPlanningReadBlocks({
      readBlocks: [
        readBlock("get_order_by_name", { order_name: "#1001" }, "order_read"),
        readBlock("search_kb", { query: "warranty policy" }, "kb_read"),
      ],
      ctx: makeCtx({ kbArticles: [] }),
      instruction: "Handle refund for order #1001",
    });

    expect(partition.skipped.map((block) => block.name)).toEqual(["get_order_by_name"]);
    expect(partition.executable.map((block) => block.name)).toEqual(["search_kb"]);
  });
});

describe("synthesizeSkippedPlanningReadResult", () => {
  it("returns the in-context order payload for skipped order lookups", () => {
    const content = synthesizeSkippedPlanningReadResult(
      readBlock("get_order_by_name", { order_name: "#1001" }),
      makeCtx(),
    );
    const parsed = JSON.parse(content) as { id: string; name: string };
    expect(parsed.id).toBe("9000000001");
    expect(parsed.name).toBe("#1001");
  });
});
