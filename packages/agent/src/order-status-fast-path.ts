import { db } from "@shopkeeper/db";
import { randomUUID } from "node:crypto";
import type { OrgSettings } from "./types.js";
import { TOOL_CATEGORIES } from "./tools/registry/index.js";
import { executeToolStructured } from "./tools/executor.js";
import {
  looksLikeOrderStatusIntent,
  hasMutativePlanningSignals,
  ORDER_REFERENCE_RE,
  isOperatorChannel,
} from "./intent.js";
import type { ActionEntry, AgentContext, AgentResult, ShopifyOrderSummary } from "./agent-context.js";
import type { AgentPlan } from "./types.js";
import { buildPlanSteps } from "./planner-steps.js";

const orderDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

async function runFastPathTool(
  tool: string,
  input: unknown,
  ctx: AgentContext,
  settings: OrgSettings | undefined,
  actionsPerformed: ActionEntry[],
): Promise<string> {
  const startedAt = Date.now();
  const { status, message } = await executeToolStructured(tool, input, ctx, settings);
  const durationMs = Date.now() - startedAt;
  const isError = status === "error";
  actionsPerformed.push({
    tool,
    result: message,
    input,
    durationMs,
    status: isError ? "error" : "success",
    category: TOOL_CATEGORIES[tool],
    ...(isError ? { errorDetail: message } : {}),
  });
  return message;
}

interface CustomerSearchResult {
  customer_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

function parseJsonArray<T>(raw: string): T[] | null {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : null;
  } catch {
    return null;
  }
}

function normalizeLookupText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9@.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCustomerQuery(instruction: string): string | null {
  const cleaned = instruction
    .replace(/[?!.]+$/g, "")
    .replace(/\b(?:please|can you|could you|what is|what's|whats|show me|tell me)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const patterns = [
    /\b(?:status|order status|where is|where's|track|tracking)(?:\s+(?:of|on|for|about))?\s+(.+?)(?:'s|\u2019s)?\s+(?:order|package|shipment)\b/i,
    /\b(.+?)(?:'s|\u2019s)\s+(?:order|package|shipment)\s+(?:status|tracking)\b/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    const candidate = match?.[1]
      ?.replace(/\b(?:the|customer|order|package|shipment)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (candidate && !ORDER_REFERENCE_RE.test(candidate)) return candidate;
  }

  return null;
}

function scoreCustomerMatch(customer: CustomerSearchResult, query: string): number {
  const normalizedQuery = normalizeLookupText(query);
  const normalizedName = normalizeLookupText(customer.name ?? "");
  const normalizedEmail = normalizeLookupText(customer.email ?? "");
  const nameTokens = normalizedName.split(" ").filter(Boolean);

  if (normalizedEmail && normalizedEmail === normalizedQuery) return 100;
  if (normalizedName && normalizedName === normalizedQuery) return 90;
  if (nameTokens.includes(normalizedQuery)) return 80;
  if (normalizedName.startsWith(normalizedQuery)) return 70;
  if (nameTokens.some((token) => token.startsWith(normalizedQuery))) return 60;
  if (normalizedName.includes(normalizedQuery)) return 40;
  if (normalizedEmail.includes(normalizedQuery)) return 30;
  return 0;
}

function pickBestCustomer(customers: CustomerSearchResult[], query: string): CustomerSearchResult | null {
  const ranked = customers
    .map((customer) => ({ customer, score: scoreCustomerMatch(customer, query) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score <= 0) return null;
  if (ranked[1] && ranked[1].score === best.score) return null;
  return best.customer;
}

function formatOrderDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return orderDateFormatter.format(date);
}

function formatOrderItems(items: ShopifyOrderSummary["items"]): string | null {
  const quantitiesByTitle = new Map<string, number>();
  for (const item of items) {
    quantitiesByTitle.set(item.title, (quantitiesByTitle.get(item.title) ?? 0) + item.quantity);
  }

  const parts = [...quantitiesByTitle.entries()].map(([title, quantity]) => `${quantity}x ${title}`);
  if (parts.length === 0) return null;
  if (parts.length <= 2) return parts.join(" and ");
  return `${parts.slice(0, 2).join(", ")} and ${parts.length - 2} more`;
}

function orderFulfillmentPhrase(status: string | null): string {
  if (status === null) return "has not shipped yet";
  if (status === "fulfilled") return "is fulfilled";
  if (status === "partial") return "is partially fulfilled";
  return `has fulfillment status "${status}"`;
}

function orderFinancialPhrase(status: string | null): string | null {
  if (!status) return null;
  if (status === "paid") return "paid";
  if (status === "pending") return "pending payment";
  return status.replace(/_/g, " ");
}

function summarizeLatestOrder(customerName: string | null, orders: ShopifyOrderSummary[]): string {
  const latestOrder = orders[0];
  if (!latestOrder) {
    return customerName ? `No recent Shopify orders were found for ${customerName}.` : "No recent Shopify orders were found for that customer.";
  }

  const subject = customerName ? `${customerName}'s latest order` : "The latest order";
  const orderName = latestOrder.name ? ` ${latestOrder.name}` : "";
  const createdAt = formatOrderDate(latestOrder.created_at);
  const datePhrase = createdAt ? ` from ${createdAt}` : "";
  const financial = orderFinancialPhrase(latestOrder.financial_status);
  const fulfillment = orderFulfillmentPhrase(latestOrder.fulfillment_status);
  const total = latestOrder.total_price
    ? ` Total is ${latestOrder.total_price}${latestOrder.currency ? ` ${latestOrder.currency}` : ""}.`
    : "";
  const items = formatOrderItems(latestOrder.items);
  const itemsPhrase = items ? ` Items: ${items}.` : "";

  return `${subject}${orderName}${datePhrase} is ${financial ? `${financial} and ` : ""}${fulfillment}.${total}${itemsPhrase}`;
}

function normalizeOrderName(name: string): string {
  const trimmed = name.trim();
  return (trimmed.startsWith("#") ? trimmed : `#${trimmed}`).toUpperCase();
}

function referencedOrderName(text: string): string | null {
  const match = text.match(ORDER_REFERENCE_RE);
  if (!match) return null;
  const raw = match[0];
  const orderNumberMatch = raw.match(/\border\s*#?\s*(\d+)/i);
  if (orderNumberMatch?.[1]) return normalizeOrderName(orderNumberMatch[1]);
  return normalizeOrderName(raw.replace(/^#/, ""));
}

function findReferencedOrder(
  orders: ShopifyOrderSummary[],
  text: string,
): ShopifyOrderSummary | null {
  const reference = referencedOrderName(text);
  if (!reference) return null;
  return orders.find((order) => order.name && normalizeOrderName(order.name) === reference) ?? null;
}

function latestCustomerMessage(ctx: AgentContext): string | null {
  for (let index = ctx.recentMessages.length - 1; index >= 0; index -= 1) {
    const message = ctx.recentMessages[index];
    if (message.senderType === "customer" && message.contentText?.trim()) {
      return message.contentText;
    }
  }
  return null;
}

function pickOrdersForPlanFastPath(
  recentOrders: ShopifyOrderSummary[],
  intentTexts: string[],
): ShopifyOrderSummary[] | null {
  for (const text of intentTexts) {
    const matched = findReferencedOrder(recentOrders, text);
    if (matched) return [matched];
    if (ORDER_REFERENCE_RE.test(text)) return null;
  }
  return recentOrders.length > 0 ? [recentOrders[0]] : null;
}

export function tryPlanOrderStatusFastPath(
  ctx: AgentContext,
  instruction: string,
): AgentPlan | null {
  if (isOperatorChannel(ctx.thread.channelType)) return null;

  const customerMessage = latestCustomerMessage(ctx);
  const instructionHasOrderStatusIntent = looksLikeOrderStatusIntent(instruction);
  const customerHasOrderStatusIntent = Boolean(
    customerMessage && looksLikeOrderStatusIntent(customerMessage),
  );
  if (!instructionHasOrderStatusIntent && !customerHasOrderStatusIntent) return null;

  if (instructionHasOrderStatusIntent && hasMutativePlanningSignals(instruction)) return null;
  if (customerHasOrderStatusIntent && customerMessage && hasMutativePlanningSignals(customerMessage)) {
    return null;
  }
  if (ctx.recentOrders.length === 0) return null;

  const intentTexts = [instruction, customerMessage ?? ""].filter((text) => text.trim().length > 0);
  const orders = pickOrdersForPlanFastPath(ctx.recentOrders, intentTexts);
  if (!orders) return null;

  const replyText = summarizeLatestOrder(ctx.customer.name, orders);
  const toolCallId = `fast_path_${randomUUID()}`;
  const rawToolCalls = [{ id: toolCallId, name: "send_reply", input: { text: replyText } }];

  return {
    instruction,
    steps: buildPlanSteps(rawToolCalls),
    rawToolCalls,
    orderStatusFastPath: true,
  };
}

export function summarizeApprovedDashboardActions(actions: ActionEntry[]): string {
  const visibleActions = actions.filter((action) => TOOL_CATEGORIES[action.tool] !== "read");
  const lastAction = visibleActions.at(-1) ?? actions.at(-1);
  return lastAction?.result ?? "Approved plan executed.";
}

export async function tryRunOperatorOrderStatusFastPath(
  ctx: AgentContext,
  instruction: string,
  settings: OrgSettings | undefined,
  actionsPerformed: ActionEntry[]
): Promise<AgentResult | null> {
  if (!isOperatorChannel(ctx.thread.channelType)) return null;
  if (!ctx.shopify) return null;
  if (!looksLikeOrderStatusIntent(instruction)) return null;
  if (ORDER_REFERENCE_RE.test(instruction)) return null;

  const requestedCustomerQuery = extractCustomerQuery(instruction);
  let customerId = ctx.thread.shopifyCustomerId;
  let customerName = ctx.customer.name;

  if (customerId && requestedCustomerQuery) {
    const contextCustomerScore = scoreCustomerMatch({
      customer_id: customerId,
      name: customerName,
      email: ctx.customer.platformId,
      phone: null,
    }, requestedCustomerQuery);

    if (contextCustomerScore < 40) {
      customerId = null;
      customerName = null;
    }
  }

  if (!customerId) {
    const query = requestedCustomerQuery;
    if (!query) return null;

    const searchResult = await runFastPathTool(
      "search_shopify_customers",
      { query, limit: 5 },
      ctx,
      settings,
      actionsPerformed,
    );

    const customers = parseJsonArray<CustomerSearchResult>(searchResult);
    if (!customers) return { summary: searchResult, actionsPerformed };

    const customer = pickBestCustomer(customers, query);
    if (!customer) {
      const names = customers
        .slice(0, 3)
        .map((c) => c.name || c.email || c.customer_id)
        .join(", ");
      return {
        summary: names
          ? `I found multiple possible Shopify customers: ${names}. Please include an email address or full name so I can check the right order.`
          : `No Shopify customer was found for "${query}".`,
        actionsPerformed,
      };
    }

    customerId = customer.customer_id;
    customerName = customer.name || customer.email || customerId;
  }

  if (customerId && customerId !== ctx.thread.shopifyCustomerId) {
    await db.thread
      .update({ where: { id: ctx.thread.id }, data: { shopifyCustomerId: customerId } })
      .catch(() => {});
    ctx.thread.shopifyCustomerId = customerId;
  }

  const ordersResult = await runFastPathTool(
    "get_shopify_orders",
    { customer_id: customerId },
    ctx,
    settings,
    actionsPerformed,
  );

  const orders = parseJsonArray<ShopifyOrderSummary>(ordersResult);
  if (!orders) {
    return { summary: ordersResult, actionsPerformed };
  }

  return {
    summary: summarizeLatestOrder(customerName, orders),
    actionsPerformed,
  };
}
