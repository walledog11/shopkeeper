import type Anthropic from "@anthropic-ai/sdk";
import type { AgentContext, ShopifyOrderSummary } from "./agent-context.js";
import type { ToolStatus } from "./tools/result.js";

const ORDER_REFRESH_PHRASES = [
  "refresh",
  "latest",
  "updated",
  "update on",
  "check again",
  "recheck",
  "just placed",
  "new order",
  "current status",
  "right now",
  "look up again",
] as const;

export function normalizePlanningOrderName(name: string): string {
  return name.replace(/^#/, "").trim().toLowerCase();
}

export function impliesOrderRefresh(...texts: string[]): boolean {
  const combined = texts.join(" ").toLowerCase();
  return ORDER_REFRESH_PHRASES.some((phrase) => combined.includes(phrase));
}

function planningIntentTexts(ctx: AgentContext, instruction: string): string[] {
  const texts = [instruction];
  for (let index = ctx.recentMessages.length - 1; index >= 0; index -= 1) {
    const message = ctx.recentMessages[index];
    if (message.senderType === "customer" && message.contentText?.trim()) {
      texts.push(message.contentText);
      break;
    }
  }
  return texts;
}

function findOrderByName(orders: ShopifyOrderSummary[], orderName: string): ShopifyOrderSummary | null {
  const target = normalizePlanningOrderName(orderName);
  return orders.find((order) => normalizePlanningOrderName(order.name) === target) ?? null;
}

function kbQueryWords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 2);
}

export function kbArticlesCoverQuery(
  kbArticles: { title: string; body: string }[],
  query: string,
  threadTag: string | null,
): boolean {
  if (kbArticles.length === 0) return false;

  const words = kbQueryWords(query);
  if (words.length === 0) return false;

  const normalizedTag = threadTag?.trim().toLowerCase() ?? null;
  if (normalizedTag && words.some((word) => normalizedTag.includes(word) || word.includes(normalizedTag))) {
    return true;
  }

  return kbArticles.some((article) => {
    const title = article.title.toLowerCase();
    return words.some((word) => title.includes(word));
  });
}

export function shouldSkipPlanningRead(
  block: Anthropic.ToolUseBlock,
  ctx: AgentContext,
  instruction: string,
): boolean {
  switch (block.name) {
    case "get_order_by_name": {
      const requested = (block.input as { order_name?: unknown }).order_name;
      if (typeof requested !== "string" || !requested.trim()) return false;
      return findOrderByName(ctx.recentOrders, requested) !== null;
    }
    case "get_shopify_orders": {
      if (ctx.recentOrders.length === 0) return false;
      return !impliesOrderRefresh(...planningIntentTexts(ctx, instruction));
    }
    case "get_shopify_customer":
      return Boolean(ctx.thread.shopifyCustomerId);
    case "search_kb": {
      const query = (block.input as { query?: unknown }).query;
      if (typeof query !== "string" || !query.trim()) return false;
      return kbArticlesCoverQuery(ctx.kbArticles, query, ctx.thread.tag);
    }
    default:
      return false;
  }
}

function serializeContextOrder(order: ShopifyOrderSummary) {
  return {
    id: order.id,
    name: order.name,
    created_at: order.created_at,
    financial_status: order.financial_status,
    fulfillment_status: order.fulfillment_status,
    total_price: order.total_price,
    currency: order.currency ?? null,
    items: order.items,
    shipping_address: order.shipping_address,
  };
}

export function synthesizeSkippedPlanningReadResult(
  block: Anthropic.ToolUseBlock,
  ctx: AgentContext,
): string {
  switch (block.name) {
    case "get_order_by_name": {
      const requested = (block.input as { order_name?: string }).order_name ?? "";
      const order = findOrderByName(ctx.recentOrders, requested);
      return order ? JSON.stringify(serializeContextOrder(order)) : "Order already available in context.";
    }
    case "get_shopify_orders":
      return JSON.stringify(ctx.recentOrders.map(serializeContextOrder));
    case "get_shopify_customer":
      return JSON.stringify({
        customer_id: ctx.thread.shopifyCustomerId,
        name: ctx.customer.name,
        email: ctx.customer.platformId.includes("@") ? ctx.customer.platformId : null,
        phone: null,
      });
    case "search_kb":
      return JSON.stringify(ctx.kbArticles.map((article) => ({
        title: article.title,
        body: article.body,
      })));
    default:
      return "Already available in context.";
  }
}

export function partitionPlanningReadBlocks(input: {
  readBlocks: Anthropic.ToolUseBlock[];
  ctx: AgentContext;
  instruction: string;
}): {
  executable: Anthropic.ToolUseBlock[];
  skipped: Anthropic.ToolUseBlock[];
} {
  const executable: Anthropic.ToolUseBlock[] = [];
  const skipped: Anthropic.ToolUseBlock[] = [];

  for (const block of input.readBlocks) {
    if (shouldSkipPlanningRead(block, input.ctx, input.instruction)) {
      skipped.push(block);
    } else {
      executable.push(block);
    }
  }

  return { executable, skipped };
}

export function applySkippedPlanningReadResults(input: {
  skippedBlocks: Anthropic.ToolUseBlock[];
  ctx: AgentContext;
  readResultsMap: Map<string, string>;
  readStatusMap: Map<string, ToolStatus>;
}): void {
  for (const block of input.skippedBlocks) {
    input.readResultsMap.set(block.id, synthesizeSkippedPlanningReadResult(block, input.ctx));
    input.readStatusMap.set(block.id, "ok");
  }
}

/** Synthetic read context for mutative replan when phase 1 emitted no reads. */
export function synthesizeMutativeReplanContext(ctx: AgentContext): string {
  const syntheticBlock = (
    id: string,
    name: string,
    input: Record<string, unknown>,
  ): Anthropic.ToolUseBlock => ({ type: "tool_use", id, name, input } as Anthropic.ToolUseBlock);

  const parts: string[] = [];

  if (ctx.recentOrders.length > 0) {
    parts.push(
      `Customer orders already in context (get_shopify_orders):\n${
        synthesizeSkippedPlanningReadResult(
          syntheticBlock("synthetic_orders", "get_shopify_orders", {}),
          ctx,
        )
      }`,
    );
  }

  if (ctx.thread.shopifyCustomerId) {
    parts.push(
      `Linked Shopify customer (get_shopify_customer):\n${
        synthesizeSkippedPlanningReadResult(
          syntheticBlock("synthetic_customer", "get_shopify_customer", {}),
          ctx,
        )
      }`,
    );
  }

  if (ctx.kbArticles.length > 0) {
    parts.push(
      `Pre-loaded knowledge base articles (search_kb):\n${
        synthesizeSkippedPlanningReadResult(
          syntheticBlock("synthetic_kb", "search_kb", { query: "" }),
          ctx,
        )
      }`,
    );
  }

  if (parts.length === 0) {
    return "No order, customer, or KB data was pre-loaded in context.";
  }

  return `Planning context (equivalent to skipped read tools):\n\n${parts.join("\n\n")}`;
}
