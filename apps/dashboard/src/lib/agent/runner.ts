import { db } from "@clerk/db";
import { anthropic } from "@/lib/ai/anthropic";
import { AI_MODEL } from "@/lib/ai";
import logger from "@/lib/server/logger";
import type Anthropic from "@anthropic-ai/sdk";
import { AGENT_TOOLS, TOOL_CATEGORIES, PLAN_STEP_LABELS } from "./tools";
import type { PlanStep, RawToolCall, AgentPlan, OrgSettings } from "@/types";
import { resolveAgentSettings } from "./settings";
import {
  searchShopifyProducts,
  searchShopifyCustomers,
  getShopifyCustomer,
  updateShopifyCustomerInfo,
  getShopifyOrders,
  updateShopifyOrderAddress,
  addShopifyCustomerNote,
  getOrderByName,
  getOrderTracking,
  createRefund,
  cancelOrder,
  createShopifyOrder,
  editShopifyOrder,
  SHOPIFY_API_VERSION,
} from "./shopify-tools";
import {
  addInternalNote,
  sendReply,
  sendEmail,
  updateThreadStatus,
  updateThreadTag,
} from "./thread-tools";
import type {
  SearchShopifyProductsInput,
  SearchShopifyCustomersInput,
  GetShopifyCustomerInput,
  UpdateShopifyCustomerInfoInput,
  GetShopifyOrdersInput,
  UpdateShopifyOrderAddressInput,
  AddShopifyCustomerNoteInput,
  GetOrderByNameInput,
  GetOrderTrackingInput,
  CreateRefundInput,
  CancelOrderInput,
  CreateShopifyOrderInput,
  EditShopifyOrderInput,
  AddInternalNoteInput,
  SendReplyInput,
  SendEmailInput,
  UpdateThreadStatusInput,
  UpdateThreadTagInput,
  SearchKbInput,
} from "./tools";

const DEFAULT_MAX_ITERATIONS = 10;

interface ModelUsageMetrics {
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  totalTokens: number;
}

type AnthropicUsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

function createModelUsageMetrics(): ModelUsageMetrics {
  return {
    modelCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    totalTokens: 0,
  };
}

function readModelUsage(response: { usage?: unknown }) {
  const usage = (response.usage ?? {}) as AnthropicUsageLike;
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheCreationInputTokens = usage.cache_creation_input_tokens ?? 0;
  const cacheReadInputTokens = usage.cache_read_input_tokens ?? 0;

  return {
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

function recordModelUsage(metrics: ModelUsageMetrics, response: { usage?: unknown }) {
  const usage = readModelUsage(response);
  metrics.modelCalls += 1;
  metrics.inputTokens += usage.inputTokens;
  metrics.outputTokens += usage.outputTokens;
  metrics.cacheCreationInputTokens += usage.cacheCreationInputTokens;
  metrics.cacheReadInputTokens += usage.cacheReadInputTokens;
  metrics.totalTokens += usage.totalTokens;
  return usage;
}

export function hashInstructionForLog(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// ── Context ───────────────────────────────────────────────────────────────────

export interface ShopifyOrderSummary {
  id: string;
  name: string;
  created_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  currency?: string | null;
  items: {
    line_item_id: string | null;
    title: string;
    quantity: number;
    variant_id: string | null;
    fulfillable_quantity: number | null;
    current_quantity: number | null;
    fulfillment_status: string | null;
  }[];
}

export interface AgentContext {
  orgId: string;
  orgName: string;
  thread: {
    id: string;
    status: string;
    channelType: string;
    tag: string | null;
    aiSummary: string | null;
    shopifyCustomerId: string | null;
  };
  customer: {
    name: string | null;
    platformId: string;
  };
  recentMessages: { senderType: string; contentText: string | null }[];
  openThreadCount: number;
  shopify: { shop: string; accessToken: string } | null;
  recentOrders: ShopifyOrderSummary[];
  kbArticles: { title: string; body: string }[];
}

export async function buildContext(threadId: string, orgId: string): Promise<AgentContext> {
  const [thread, org, shopifyIntegration, allKbArticles] = await Promise.all([
    db.thread.findUnique({
      where: { id: threadId },
      include: {
        customer: true,
        messages: { orderBy: { sentAt: "asc" }, take: 50 },
      },
    }),
    db.organization.findUnique({ where: { id: orgId } }),
    db.integration.findFirst({ where: { organizationId: orgId, platform: "shopify" } }),
    db.kbArticle.findMany({
      where: { organizationId: orgId },
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: { title: true, body: true, tags: true },
    }),
  ]);

  if (!thread || thread.organizationId !== orgId) {
    throw new Error("Thread not found");
  }

  // Fired after thread resolves since it depends on thread.customerId
  const openThreadCountPromise = db.thread.count({
    where: { customerId: thread.customerId, status: "open" },
  });

  // thread.customer.name can be an email address used as a fallback display name — treat that as "no real name"
  const dbName = thread.customer.name?.includes('@') ? null : (thread.customer.name ?? null);

  // Auto-resolve Shopify customer ID (and name) for email threads when not yet linked
  let shopifyCustomerId = thread.shopifyCustomerId;
  let shopifyCustomerName: string | null = null;
  if (!shopifyCustomerId && thread.channelType === "email" && shopifyIntegration?.accessToken) {
    try {
      const email = thread.customer.platformId;
      const res = await fetch(
        `https://${shopifyIntegration.externalAccountId}/admin/api/${SHOPIFY_API_VERSION}/customers/search.json?query=email:${encodeURIComponent(email)}&fields=id,first_name,last_name&limit=1`,
        { headers: { "X-Shopify-Access-Token": shopifyIntegration.accessToken } }
      );
      const data = await res.json();
      const found = data.customers?.[0];
      if (found?.id) {
        shopifyCustomerId = String(found.id);
        const parts = [found.first_name, found.last_name].filter(Boolean);
        if (parts.length > 0) shopifyCustomerName = parts.join(' ');
        await db.thread.update({
          where: { id: thread.id },
          data: { shopifyCustomerId },
        }).catch(() => {});
      }
    } catch {
      // best-effort; leave null
    }
  }

  const isOperatorChannel = thread.channelType === "dashboard_agent" || thread.channelType === "sms_agent";

  // Fetch customer name and recent orders in parallel.
  // Operator-mode channels always call get_shopify_orders live, so skip prefetching orders.
  let recentOrders: ShopifyOrderSummary[] = [];
  if (shopifyCustomerId && shopifyIntegration?.accessToken) {
    const { externalAccountId, accessToken } = shopifyIntegration;
    const headers = { "X-Shopify-Access-Token": accessToken };

    const nameFetch = (!dbName && !shopifyCustomerName)
      ? fetch(`https://${externalAccountId}/admin/api/${SHOPIFY_API_VERSION}/customers/${shopifyCustomerId}.json?fields=first_name,last_name`, { headers })
          .then(r => r.json()).catch(() => null)
      : Promise.resolve(null);

    const ordersFetch = isOperatorChannel ? Promise.resolve(null) : fetch(
      `https://${externalAccountId}/admin/api/${SHOPIFY_API_VERSION}/orders.json?customer_id=${shopifyCustomerId}&status=any&limit=5&fields=id,name,created_at,financial_status,fulfillment_status,current_total_price,line_items`,
      { headers }
    ).then(async r => ({ ok: r.ok, data: await r.json() })).catch(() => null);

    const [nameData, ordersResult] = await Promise.all([nameFetch, ordersFetch]);

    if (nameData) {
      const parts = [nameData.customer?.first_name, nameData.customer?.last_name].filter(Boolean);
      if (parts.length > 0) shopifyCustomerName = parts.join(' ');
    }

    if (ordersResult?.ok && ordersResult.data?.orders) {
      recentOrders = ordersResult.data.orders.map((o: {
        id: number;
        name: string;
        created_at: string;
        financial_status: string;
        fulfillment_status: string | null;
        current_total_price: string;
        currency?: string | null;
        line_items: {
          id?: number | string;
          title: string;
          quantity: number;
          fulfillable_quantity?: number;
          current_quantity?: number;
          fulfillment_status?: string | null;
          variant_id: number | string | null;
        }[];
      }) => ({
        id: String(o.id),
        name: o.name,
        created_at: o.created_at,
        financial_status: o.financial_status,
        fulfillment_status: o.fulfillment_status,
        total_price: o.current_total_price,
        currency: o.currency ?? null,
        items: o.line_items.map((li) => ({
          line_item_id: li.id !== undefined && li.id !== null ? String(li.id) : null,
          title: li.title,
          quantity: li.quantity,
          fulfillable_quantity: li.fulfillable_quantity ?? null,
          current_quantity: li.current_quantity ?? null,
          fulfillment_status: li.fulfillment_status ?? null,
          variant_id: li.variant_id ? String(li.variant_id) : null,
        })),
      }));
    }
  }

  const openThreadCount = await openThreadCountPromise;

  // Filter KB articles to those whose tags exactly match the thread tag, falling back to all
  const threadTag = thread.tag?.toLowerCase();
  const kbArticles = threadTag
    ? allKbArticles.filter(a => a.tags.some(t => t.toLowerCase() === threadTag))
    : allKbArticles;

  return {
    orgId,
    orgName: org?.name ?? "Support",
    thread: {
      id: thread.id,
      status: thread.status,
      channelType: thread.channelType,
      tag: thread.tag,
      aiSummary: thread.aiSummary,
      shopifyCustomerId,
    },
    customer: {
      name: dbName ?? shopifyCustomerName,
      platformId: thread.customer.platformId,
    },
    recentMessages: thread.messages.map((m) => ({
      senderType: m.senderType,
      contentText: m.contentText,
    })),
    openThreadCount,
    shopify:
      shopifyIntegration?.accessToken
        ? { shop: shopifyIntegration.externalAccountId, accessToken: shopifyIntegration.accessToken }
        : null,
    recentOrders,
    kbArticles: kbArticles.map(a => ({ title: a.title, body: a.body })),
  };
}

// ── Action log entry ──────────────────────────────────────────────────────────

export interface ActionEntry {
  tool: string;
  result: string;
}

// ── Tool dispatch ─────────────────────────────────────────────────────────────

function cast<T>(v: unknown): T { return v as T; }

async function executeTool(
  name: string,
  args: unknown,
  ctx: AgentContext,
  settings?: OrgSettings
): Promise<string> {
  const noShopify = "Error: no Shopify integration connected.";
  const threadCtx = { threadId: ctx.thread.id, orgId: ctx.orgId, orgName: ctx.orgName };
  const resolvedSettings = resolveAgentSettings(settings);

  switch (name) {
    case "search_shopify_products":
      return ctx.shopify ? searchShopifyProducts(cast<SearchShopifyProductsInput>(args), ctx.shopify) : noShopify;

    case "search_shopify_customers":
      return ctx.shopify ? searchShopifyCustomers(cast<SearchShopifyCustomersInput>(args), ctx.shopify) : noShopify;

    case "get_shopify_customer":
      return ctx.shopify ? getShopifyCustomer(cast<GetShopifyCustomerInput>(args), ctx.shopify) : noShopify;

    case "update_shopify_customer_info":
      return ctx.shopify ? updateShopifyCustomerInfo(cast<UpdateShopifyCustomerInfoInput>(args), ctx.shopify) : noShopify;

    case "get_shopify_orders":
      return ctx.shopify ? getShopifyOrders(cast<GetShopifyOrdersInput>(args), ctx.shopify) : noShopify;

    case "update_shopify_order_address":
      return ctx.shopify ? updateShopifyOrderAddress(cast<UpdateShopifyOrderAddressInput>(args), ctx.shopify) : noShopify;

    case "add_shopify_customer_note":
      return ctx.shopify ? addShopifyCustomerNote(cast<AddShopifyCustomerNoteInput>(args), ctx.shopify) : noShopify;

    case "get_order_by_name":
      return ctx.shopify ? getOrderByName(cast<GetOrderByNameInput>(args), ctx.shopify) : noShopify;

    case "get_order_tracking":
      return ctx.shopify ? getOrderTracking(cast<GetOrderTrackingInput>(args), ctx.shopify) : noShopify;

    case "create_refund":
      return ctx.shopify ? createRefund(cast<CreateRefundInput>(args), ctx.shopify) : noShopify;

    case "cancel_order":
      return ctx.shopify ? cancelOrder(cast<CancelOrderInput>(args), ctx.shopify) : noShopify;

    case "create_shopify_order":
      return ctx.shopify
        ? createShopifyOrder(cast<CreateShopifyOrderInput>(args), ctx.shopify, {
            allowCustomLineItems: !resolvedSettings.blockCustomLineItems,
          })
        : noShopify;

    case "edit_shopify_order":
      return ctx.shopify ? editShopifyOrder(cast<EditShopifyOrderInput>(args), ctx.shopify) : noShopify;

    case "add_internal_note":
      return addInternalNote(cast<AddInternalNoteInput>(args), threadCtx);

    case "send_reply":
      return sendReply(cast<SendReplyInput>(args), threadCtx);

    case "send_email":
      return sendEmail(cast<SendEmailInput>(args), threadCtx);

    case "update_thread_status":
      return updateThreadStatus(cast<UpdateThreadStatusInput>(args), threadCtx);

    case "update_thread_tag":
      return updateThreadTag(cast<UpdateThreadTagInput>(args), threadCtx);

    case "search_kb": {
      const { query } = cast<SearchKbInput>(args);
      const words = query.trim().split(/\s+/).filter(Boolean);
      const wordConditions = words.flatMap(w => [
        { title: { contains: w, mode: "insensitive" as const } },
        { body:  { contains: w, mode: "insensitive" as const } },
      ]);
      const articles = await db.kbArticle.findMany({
        where: { organizationId: ctx.orgId, OR: wordConditions },
        take: 5,
        orderBy: { updatedAt: "desc" },
        select: { title: true, body: true, tags: true },
      });
      if (articles.length === 0) return "No knowledge base articles found for that query.";
      return JSON.stringify(articles.map(a => ({ title: a.title, body: a.body, tags: a.tags })));
    }

    default:
      return `Error: unknown tool "${name}".`;
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildGuardrailClauses(s: ReturnType<typeof resolveAgentSettings>): string[] {
  const clauses: string[] = [];
  if (s.blockCancellations) {
    clauses.push("- Order cancellations are disabled by the workspace owner. Do NOT call cancel_order under any circumstances. Inform the operator that cancellations must be handled manually.");
  }
  if (s.blockCustomLineItems) {
    clauses.push("- Custom line items are disabled by the workspace owner. Every line item in create_shopify_order MUST include a variant_id from the Shopify product catalog. Do NOT create line items with only a title and price.");
  }
  if (s.maxRefundAmount !== null && s.maxRefundAmount > 0) {
    clauses.push(`- The maximum refund you are authorised to issue is $${s.maxRefundAmount}. If the requested refund exceeds this amount, do NOT proceed — inform the operator that manual approval is required.`);
  }
  return clauses;
}

export function buildSystemPrompt(ctx: AgentContext, settings?: OrgSettings): string {
  const s = resolveAgentSettings(settings);
  const isOperatorMode = ctx.thread.channelType === "dashboard_agent" || ctx.thread.channelType === "sms_agent";

  const shopifyNote = ctx.shopify
    ? `A Shopify integration is connected (shop: ${ctx.shopify.shop}).`
    : "No Shopify integration is connected — Shopify tools will not work.";

  const shopifyCustomerNote = ctx.thread.shopifyCustomerId
    ? `Shopify customer ID: ${ctx.thread.shopifyCustomerId} — pass this directly when calling Shopify tools.`
    : isOperatorMode
      ? "No Shopify customer ID is pre-loaded. If you need to look up or act on a customer, call search_shopify_customers first."
      : "No Shopify customer ID is pre-loaded for this thread. If you need to look up or act on a customer, call search_shopify_customers first to resolve their ID.";

  const guardrailClauses = buildGuardrailClauses(s);

  if (isOperatorMode) {
    const channel = ctx.thread.channelType === "sms_agent" ? "WhatsApp/SMS" : "the dashboard";
    const languageClause = s.replyLanguage && s.replyLanguage !== "auto"
      ? `- Always respond in ${s.replyLanguage}.`
      : "";

    return `You are ${s.agentName}, an AI action assistant for ${ctx.orgName}. You are receiving instructions from a team member via ${channel}.

## Integrations
${shopifyNote}
${shopifyCustomerNote}
- When the operator describes a product by name, call search_shopify_products first to find the matching variant_id.
- When given a customer name or email but no customer ID, call search_shopify_customers first, then call get_shopify_orders to fetch their current orders.
- Always call get_shopify_orders after resolving a customer ID — never rely on order data from earlier in the conversation as it may be stale.
- For order-status questions, use get_shopify_orders first. If the returned order has fulfillment_status: null, treat it as not fulfilled yet and answer from that data without calling get_order_tracking.
- Call get_order_tracking only when an order is already fulfilled or partially fulfilled, or when the operator explicitly asks for tracking numbers, carrier scans, delivery events, or delivery exceptions.
- To add an item to an existing order, call edit_shopify_order with variant_id and quantity. To remove an item, call edit_shopify_order with only remove_variant_id (no variant_id needed). To swap (change size/color), pass both variant_id (new) and remove_variant_id (old). Call search_shopify_products only if the needed variant_id isn't in the freshly fetched orders. Never claim you lack permission or that the API does not support this — the write_order_edits scope is active and the tool works. You MUST have a valid numeric order_id before calling this tool.
- Use search_kb to look up store policies or FAQs when the operator asks about return/shipping/refund rules.
## Instructions
- Every task MUST be completed by calling a tool. You CANNOT complete any task by writing a response — your text response is only a summary of what the tools did.
- Sending, emailing, notifying, or contacting a customer = call send_email. There are no exceptions. If you have not called send_email, you have not sent anything.
- Do NOT call send_reply or add_internal_note.
- After all tools finish, you MUST respond with a text summary of what you found or did. Include the actual data (e.g. address, order total, customer name) — never just say "Done".
- Be conversational and friendly, like a helpful teammate. Avoid technical jargon. No bullet lists, no markdown. Keep it to 1–2 sentences.${guardrailClauses.length > 0 ? "\n" + guardrailClauses.join("\n") : ""}${languageClause ? "\n" + languageClause : ""}`;
  }

  const otherOpenThreads = Math.max(0, ctx.openThreadCount - 1);
  const ordersJson = ctx.recentOrders.length > 0 ? JSON.stringify(ctx.recentOrders) : "[]";
  const languageClause = s.replyLanguage && s.replyLanguage !== "auto"
    ? `- Always write customer-facing replies in ${s.replyLanguage}, regardless of the language the customer used.`
    : "";

  const kbSection = ctx.kbArticles.length > 0
    ? `\n## Knowledge base\nThe following articles are pre-loaded for this thread. Use the search_kb tool to find additional articles when these don't contain the answer.\n\n${
        ctx.kbArticles.map(a => `### ${a.title}\n${a.body}`).join('\n\n')
      }`
    : `\n## Knowledge base\nNo articles are pre-loaded. Use the search_kb tool to search for relevant policy or FAQ information before replying.`;

  return `You are ${s.agentName}, an AI support agent for ${ctx.orgName}. You help support staff take actions on their behalf.

## Current thread
- Thread ID: ${ctx.thread.id}
- Status: ${ctx.thread.status}
- Channel: ${ctx.thread.channelType}
- Tag: ${ctx.thread.tag ?? "none"}
- AI Summary: ${ctx.thread.aiSummary ?? "none"}
- Customer name: ${ctx.customer.name ?? "(not available)"}
- Customer email: ${ctx.customer.platformId}
- Customer's other open threads: ${otherOpenThreads}

## Customer's recent orders (use these IDs directly — do not call get_shopify_orders unless you need to refresh)
${ordersJson}

## Integrations
${shopifyNote}
${shopifyCustomerNote}

## Instructions
- Use the available tools to complete the requested task.
- After taking any action (Shopify update, refund, cancellation, etc.), you MUST call send_reply to notify the customer what was done. Do not leave the customer without a response.
- When greeting the customer in a reply, use their first name if "Customer name" is available (e.g. "Hi John,"). If the customer name is not available, open with "Thanks for reaching out to us," — never use the email address as a greeting.
- After successfully completing an action, call add_internal_note in a separate step to document what you did. Do not call it in the same batch as the action.
- When the support agent refers to "this order" or "the order", infer they mean the most recent order in the list above unless context makes another order clear.
- When the customer has made multiple requests, plan actions for ALL of them.
- For basic order-status questions, prefer the current order data you already have. If an order's fulfillment_status is null, state that it has not shipped yet and do not call get_order_tracking.
- Call get_order_tracking only for fulfilled or partially fulfilled orders, or when the customer specifically needs tracking details such as tracking numbers, scan events, or delivery exceptions.
- When the customer wants to remove an item from their order, call edit_shopify_order with only remove_variant_id — use the old item's variant_id from the recent orders context above. No variant_id or quantity needed for a pure removal.
- When the customer wants to swap a size or color, call edit_shopify_order with both variant_id (new) and remove_variant_id (old). Get the old item's variant_id from the recent orders context. Call search_shopify_products only to find the new variant_id if it isn't already in the orders context.
- Be precise and only make changes explicitly requested.
- Respond like a knowledgeable coworker giving a quick status update — direct, factual, no fluff.
- Keep summaries to 1–2 sentences. No bullet lists, no markdown formatting.
- Never ask if the user has more questions or offer further help. Just state what you found or did and stop.
- If send_reply returns an error, do NOT change the thread status. Log an internal note describing the failure and report the error back to the support agent so they can act.${guardrailClauses.length > 0 ? "\n" + guardrailClauses.join("\n") : ""}${languageClause ? "\n" + languageClause : ""}${kbSection}`;
}

// ── Main agent runner ─────────────────────────────────────────────────────────

export interface AgentResult {
  summary: string;
  actionsPerformed: ActionEntry[];
}

const ORDER_STATUS_PHRASES = [
  "status",
  "order status",
  "status of",
  "status on",
  "status for",
  "where is",
  "where's",
  "track",
  "tracking",
  "tracking number",
  "tracking numbers",
  "carrier",
  "delivery",
  "delivered",
  "shipped",
  "shipment",
  "fulfilled",
  "fulfillment",
  "wismo",
] as const;

const ORDER_STATUS_ACTION_PHRASES = [
  "cancel",
  "refund",
  "return policy",
  "change",
  "update",
  "edit",
  "swap",
  "remove",
  "add ",
  "create",
  "note",
  "email",
  "reply",
  "send",
  "tag",
  "close",
  "policy",
  "faq",
  "kb",
  "knowledge base",
] as const;

const ORDER_REFERENCE_RE = /(?:#?[A-Z]{1,4}\d{3,}|\border\s*#?\s*\d{4,}\b)/i;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

function isOperatorChannel(channelType: string): boolean {
  return channelType === "dashboard_agent" || channelType === "sms_agent";
}

function hasPhrase(text: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

function looksLikeOrderStatusIntent(instruction: string): boolean {
  const text = instruction.toLowerCase();
  const mentionsOrderContext = text.includes("order") || text.includes("package") || text.includes("shipment") || ORDER_REFERENCE_RE.test(instruction);
  if (!mentionsOrderContext) return false;
  if (!hasPhrase(text, ORDER_STATUS_PHRASES)) return false;
  if (hasPhrase(text, ORDER_STATUS_ACTION_PHRASES)) return false;
  return true;
}

function looksLikeCreateOrderIntent(instruction: string): boolean {
  const text = instruction.toLowerCase();
  if (!text.includes("order")) return false;
  return /\b(create|place|make)\b/.test(text);
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
    /\b(?:status|order status|where is|where's|track|tracking)(?:\s+(?:of|on|for|about))?\s+(.+?)(?:'s|’s)?\s+(?:order|package|shipment)\b/i,
    /\b(.+?)(?:'s|’s)\s+(?:order|package|shipment)\s+(?:status|tracking)\b/i,
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
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
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

function summarizeApprovedDashboardActions(actions: ActionEntry[]): string {
  const visibleActions = actions.filter((action) => TOOL_CATEGORIES[action.tool] !== "read");
  const lastAction = visibleActions.at(-1) ?? actions.at(-1);
  return lastAction?.result ?? "Approved plan executed.";
}

async function tryRunOperatorOrderStatusFastPath(
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

    const searchResult = await executeTool("search_shopify_customers", { query, limit: 5 }, ctx, settings);
    actionsPerformed.push({ tool: "search_shopify_customers", result: searchResult });

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

  const ordersResult = await executeTool("get_shopify_orders", { customer_id: customerId }, ctx, settings);
  actionsPerformed.push({ tool: "get_shopify_orders", result: ordersResult });

  const orders = parseJsonArray<ShopifyOrderSummary>(ordersResult);
  if (!orders) {
    return { summary: ordersResult, actionsPerformed };
  }

  return {
    summary: summarizeLatestOrder(customerName, orders),
    actionsPerformed,
  };
}

export function selectToolNamesForInstruction(
  ctx: AgentContext,
  instruction: string
): string[] | null {
  if (!isOperatorChannel(ctx.thread.channelType)) return null;

  if (looksLikeCreateOrderIntent(instruction)) {
    const allowed = ["search_shopify_products"];
    if (!EMAIL_RE.test(instruction)) {
      allowed.push("search_shopify_customers", "get_shopify_customer");
    }
    allowed.push("create_shopify_order");
    return allowed;
  }

  if (!looksLikeOrderStatusIntent(instruction)) return null;

  const allowed = new Set<string>();

  if (ORDER_REFERENCE_RE.test(instruction)) {
    allowed.add("get_order_by_name");
    allowed.add("get_order_tracking");
    return [...allowed];
  }

  if (!ctx.thread.shopifyCustomerId) {
    allowed.add("search_shopify_customers");
  }

  allowed.add("get_shopify_orders");
  allowed.add("get_order_tracking");

  return [...allowed];
}

// Convert OpenAI-format tool definitions to Anthropic format, filtered by enabled categories
function toAnthropicTools(settings?: OrgSettings, allowedToolNames?: readonly string[] | null): Anthropic.Tool[] {
  const s = resolveAgentSettings(settings);
  const allowed = allowedToolNames ? new Set(allowedToolNames) : null;
  return AGENT_TOOLS.flatMap((t) => {
    if (t.type !== "function") return [];
    const fn = t.function as { name: string; description?: string; parameters?: unknown };
    const category = TOOL_CATEGORIES[fn.name];
    if (category && !s.toolsEnabled[category]) return [];
    if (allowed && !allowed.has(fn.name)) return [];
    return [{
      name: fn.name,
      description: fn.description ?? "",
      input_schema: fn.parameters as Anthropic.Tool["input_schema"],
    }];
  });
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function buildMessageHistory(
  recentMessages: AgentContext["recentMessages"],
  instruction: string
): Anthropic.MessageParam[] {
  const rawHistory = recentMessages
    .filter((m) => m.senderType !== "note")
    .map((m) => ({
      role: m.senderType === "agent" ? "assistant" as const : "user" as const,
      content: m.contentText ?? "(media)",
    }));

  const merged: Anthropic.MessageParam[] = [];
  for (const msg of rawHistory) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role && typeof last.content === "string") {
      last.content += "\n" + msg.content;
    } else {
      merged.push({ role: msg.role, content: msg.content });
    }
  }
  while (merged.length > 0 && merged[0].role === "assistant") {
    merged.shift();
  }

  return [...merged, { role: "user", content: instruction }];
}

// ── Plan generation (one LLM call, no side effects) ──────────────────────────

function describeTool(name: string, input: unknown): string {
  const a = input as Record<string, unknown>
  switch (name) {
    case 'search_kb':
      return `Search knowledge base for "${String(a.query ?? '')}"`
    case 'update_shopify_order_address': {
      const parts = [a.address1, a.city, a.province, a.zip].filter(Boolean)
      return `Update their shipping address on Shopify to ${parts.join(', ')}`
    }
    case 'update_shopify_customer_info': {
      const changes: string[] = []
      if (a.email) changes.push(`email → ${a.email}`)
      if (a.phone) changes.push(`phone → ${a.phone}`)
      if (a.first_name || a.last_name) changes.push(`name → ${[a.first_name, a.last_name].filter(Boolean).join(' ')}`)
      return changes.length ? `Update: ${changes.join(', ')}` : 'Update customer info'
    }
    case 'create_refund':
      return a.amount ? `Issue $${a.amount} refund` : 'Issue full refund'
    case 'cancel_order':
      return `Cancel order${a.reason ? ` (${a.reason})` : ''}`
    case 'create_shopify_order': {
      const items = (a.line_items as { title?: string; variant_id?: string; quantity: number }[] ?? [])
        .map(li => `${li.quantity}x ${li.title ?? `variant ${li.variant_id}`}`)
        .join(', ')
      return `Create order for ${a.first_name} ${a.last_name}${items ? ` — ${items}` : ''}`
    }
    case 'add_shopify_customer_note':
      return `Add note to Shopify customer`
    case 'send_reply': {
      const text = String(a.text ?? '')
      return text.length > 80 ? `"${text.slice(0, 80)}…"` : `"${text}"`
    }
    case 'send_email': {
      const body = String(a.body ?? '')
      const preview = body.length > 60 ? `${body.slice(0, 60)}…` : body
      return `Email to ${a.to}: "${preview}"`
    }
    case 'add_internal_note':
      return `Add internal note`
    case 'update_thread_status':
      return `Set status to ${a.status}`
    case 'update_thread_tag':
      return `Tag as "${a.tag}"`
    case 'get_order_by_name':
      return `Look up order ${a.order_name}`
    case 'edit_shopify_order': {
      const qty = a.quantity as number | undefined
      if (a.variant_id && a.remove_variant_id) return `Swap order item — add new variant, remove old`
      if (a.remove_variant_id) return `Remove item (variant ${a.remove_variant_id}) from order`
      return qty ? `Add ${qty}x item to order` : 'Edit order'
    }
    default:
      return name.replace(/_/g, ' ')
  }
}

export async function planAgent(
  ctx: AgentContext,
  instruction: string,
  settings?: OrgSettings
): Promise<AgentPlan> {
  const startedAt = Date.now();
  const usageTotals = createModelUsageMetrics();
  const readToolCalls: string[] = [];
  const instructionHash = hashInstructionForLog(instruction);
  const operatorMode = isOperatorChannel(ctx.thread.channelType);
  const historyWindow = operatorMode ? ctx.recentMessages.slice(-4) : ctx.recentMessages;
  const baseMessages = buildMessageHistory(historyWindow, instruction)
  const systemPrompt = buildSystemPrompt(ctx, settings);
  const tools = toAnthropicTools(settings, selectToolNamesForInstruction(ctx, instruction));

  logger.info({
    orgId: ctx.orgId,
    threadId: ctx.thread.id,
    channelType: ctx.thread.channelType,
    messageCount: baseMessages.length,
    toolCount: tools.length,
    tools: tools.map(t => t.name),
    instructionLength: instruction.length,
    instructionHash,
  }, "[agent:plan] start");

  // Phase 1: initial planning
  const response1 = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: baseMessages,
    tools,
  })

  const blocks1 = response1.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
  const usage1 = recordModelUsage(usageTotals, response1);
  logger.info({
    orgId: ctx.orgId,
    threadId: ctx.thread.id,
    phase: "initial",
    stopReason: response1.stop_reason,
    tools: blocks1.map(b => b.name),
    usage: usage1,
    usageTotals,
  }, "[agent:plan] model call");
  const rawToolCalls: RawToolCall[] = blocks1.map((b) => ({ id: b.id, name: b.name, input: b.input }))

  // planMessages grows as we add turns; used for the send_reply preview phase
  let planMessages: Anthropic.MessageParam[] = [
    ...baseMessages,
    { role: "assistant", content: response1.content },
  ]
  let lastBlocks: Anthropic.ToolUseBlock[] = blocks1

  // Phase 1.5: execute any read-only lookups so the LLM can plan the dependent write actions.
  // (e.g. search_shopify_products → edit_shopify_order needs the variant_id from the search)
  const readBlocks = blocks1.filter(b => TOOL_CATEGORIES[b.name] === 'read')
  const warnings: string[] = []
  const readResultsMap = new Map<string, string>()

  // Always warn if Shopify is connected but no customer is linked on a support thread
  if (ctx.shopify && !ctx.thread.shopifyCustomerId && !operatorMode) {
    warnings.push("Couldn't find a Shopify customer — verify the correct account is linked before approving.")
  }

  if (readBlocks.length > 0) {
    // Execute reads in parallel to get real results
    await Promise.all(
      readBlocks.map(async (b) => {
        readToolCalls.push(b.name);
        const toolStartedAt = Date.now();
        const inputKeys = b.input && typeof b.input === "object" ? Object.keys(b.input) : [];
        logger.info({
          orgId: ctx.orgId,
          threadId: ctx.thread.id,
          tool: b.name,
          inputKeys,
          inputChars: JSON.stringify(b.input ?? null).length,
        }, "[agent:plan] read tool call");
        let content: string
        try { content = await executeTool(b.name, b.input, ctx, settings) }
        catch { content = 'Lookup failed' }
        logger.info({
          orgId: ctx.orgId,
          threadId: ctx.thread.id,
          tool: b.name,
          durationMs: Date.now() - toolStartedAt,
          resultChars: content.length,
        }, "[agent:plan] read tool result");
        readResultsMap.set(b.id, content)
      })
    )

    // Collect warnings for missing/failed lookups
    for (const [id, result] of readResultsMap.entries()) {
      const block = readBlocks.find(b => b.id === id)
      if (!block) continue
      const lower = result.toLowerCase()
      const isMissing = lower.includes('not found') || lower.includes('no customer') || lower === 'lookup failed'
      if (isMissing) {
        if ((block.name === 'get_shopify_customer' || block.name === 'search_shopify_customers') && !warnings.some(w => w.includes('Shopify customer')))
          warnings.push("Couldn't find a Shopify customer — verify the correct account is linked before approving.")
        else if (block.name === 'get_shopify_orders' || block.name === 'get_order_by_name')
          warnings.push("No matching order found — confirm the order number with the customer before proceeding.")
        else if (block.name === 'get_order_tracking')
          warnings.push("No tracking information found — the order may not have been fulfilled yet.")
        else if (block.name === 'search_shopify_products')
          warnings.push("No matching product found — the order edit step may need a corrected product name.")
      }
      if (block.name === 'search_kb' && (lower.includes('no articles') || result.trim() === '[]' || result.trim() === ''))
        warnings.push("No relevant KB articles found — the reply is based only on the conversation, not your documentation.")
    }

    // Anthropic requires a tool_result for every tool_use in the preceding turn.
    // Reads get their real results; any write blocks from Phase 1 get a fake "Success"
    // so the conversation stays valid before we ask the LLM to plan dependent writes.
    planMessages = [
      ...planMessages,
      {
        role: "user",
        content: blocks1.map(b => ({
          type: "tool_result" as const,
          tool_use_id: b.id,
          content: readResultsMap.get(b.id) ?? "Success",
        })),
      },
    ]

    const response15 = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: planMessages,
      tools,
    })
    lastBlocks = response15.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
    const usage15 = recordModelUsage(usageTotals, response15);
    logger.info({
      orgId: ctx.orgId,
      threadId: ctx.thread.id,
      phase: "after_read_results",
      stopReason: response15.stop_reason,
      tools: lastBlocks.map(b => b.name),
      usage: usage15,
      usageTotals,
    }, "[agent:plan] model call");
    rawToolCalls.push(...lastBlocks.map((b) => ({ id: b.id, name: b.name, input: b.input })))
    planMessages = [...planMessages, { role: "assistant", content: response15.content }]
  }

  // Phase 2: if no send_reply was planned yet, simulate write results and get a reply preview.
  // Operator channels approve actions in-chat, so a customer-facing reply preview is wasted work.
  const hasSendReply = rawToolCalls.some((tc) => tc.name === 'send_reply')
  const sendReplyTool = tools.find(t => t.name === 'send_reply')
  if (!operatorMode && !hasSendReply && sendReplyTool) {
    const phase2Messages: Anthropic.MessageParam[] = [
      ...planMessages,
      ...(lastBlocks.length > 0
        ? [{
            role: "user" as const,
            content: lastBlocks.map((b) => ({
              type: "tool_result" as const,
              tool_use_id: b.id,
              content: "Success",
            })),
          }]
        : [{ role: "user" as const, content: "Now call send_reply to respond to the customer." }]
      ),
    ]

    const response2 = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 512,
      system: systemPrompt,
      messages: phase2Messages,
      tools: [sendReplyTool],
      tool_choice: { type: "any" },
    })

    const phase2ToolUse = response2.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "send_reply"
    )
    const usage2 = recordModelUsage(usageTotals, response2);
    logger.info({
      orgId: ctx.orgId,
      threadId: ctx.thread.id,
      phase: "reply_preview",
      stopReason: response2.stop_reason,
      tools: phase2ToolUse.map(b => b.name),
      usage: usage2,
      usageTotals,
    }, "[agent:plan] model call");
    rawToolCalls.push(...phase2ToolUse.map((b) => ({ id: b.id, name: b.name, input: b.input })))
  }

  const steps: PlanStep[] = rawToolCalls
    .filter((tc) => TOOL_CATEGORIES[tc.name] !== 'read')
    .map((tc) => ({
      id: tc.id,
      tool: tc.name,
      label: PLAN_STEP_LABELS[tc.name] ?? tc.name.replace(/_/g, ' '),
      description: describeTool(tc.name, tc.input),
      category: TOOL_CATEGORIES[tc.name] ?? 'internal',
      enabled: true,
    }))

  logger.info({
    orgId: ctx.orgId,
    threadId: ctx.thread.id,
    durationMs: Date.now() - startedAt,
    modelCalls: usageTotals.modelCalls,
    usageTotals,
    readToolCalls,
    rawToolCallCount: rawToolCalls.length,
    rawToolCalls: rawToolCalls.map(tc => tc.name),
    visibleStepCount: steps.length,
    visibleSteps: steps.map(step => step.tool),
    warningCount: warnings.length,
    instructionHash,
  }, "[agent:plan] complete");

  const readResults = readResultsMap.size > 0 ? Object.fromEntries(readResultsMap) : undefined;
  return { instruction, steps, rawToolCalls, readResults, warnings: warnings.length > 0 ? warnings : undefined }
}

export async function runAgent(
  ctx: AgentContext,
  instruction: string,
  approvedToolCalls?: RawToolCall[],
  settings?: OrgSettings
): Promise<AgentResult> {
  const startedAt = Date.now();
  const usageTotals = createModelUsageMetrics();
  const executedToolCalls: string[] = [];
  const instructionHash = hashInstructionForLog(instruction);
  const s = resolveAgentSettings(settings);
  const maxIterations = s.maxIterations > 0 ? s.maxIterations : DEFAULT_MAX_ITERATIONS;
  const actionsPerformed: ActionEntry[] = [];
  const operatorMode = isOperatorChannel(ctx.thread.channelType);
  const history = operatorMode ? ctx.recentMessages.slice(-4) : ctx.recentMessages;
  const messages = buildMessageHistory(history, instruction);

  const finish = (result: AgentResult, outcome: string): AgentResult => {
    logger.info({
      orgId: ctx.orgId,
      threadId: ctx.thread.id,
      channelType: ctx.thread.channelType,
      outcome,
      durationMs: Date.now() - startedAt,
      modelCalls: usageTotals.modelCalls,
      usageTotals,
      approvedToolCallCount: approvedToolCalls?.length ?? 0,
      executedToolCallCount: executedToolCalls.length,
      executedToolCalls,
      actionCount: result.actionsPerformed.length,
      summaryChars: result.summary.length,
      instructionHash,
    }, "[agent] run complete");
    return result;
  };

  if (!approvedToolCalls?.length) {
    const fastResult = await tryRunOperatorOrderStatusFastPath(ctx, instruction, settings, actionsPerformed);
    if (fastResult) {
      logger.info({ actionCount: fastResult.actionsPerformed.length }, "[agent] fast order-status result");
      executedToolCalls.push(...fastResult.actionsPerformed.map(action => action.tool));
      return finish(fastResult, "fast_order_status");
    }
  }

  const tools = toAnthropicTools(settings, selectToolNamesForInstruction(ctx, instruction));

  // If the caller pre-approved a plan, inject those tool calls and execute them
  // before starting the regular loop so Claude can follow up.
  if (approvedToolCalls && approvedToolCalls.length > 0) {
    const executableToolCalls = ctx.thread.channelType === "dashboard_agent"
      ? approvedToolCalls.filter((tc) => TOOL_CATEGORIES[tc.name] === "action")
      : approvedToolCalls;

    if (ctx.thread.channelType === "dashboard_agent" && executableToolCalls.length === 0) {
      return finish({
        summary: "No approved dashboard action was available to execute.",
        actionsPerformed,
      }, "approved_dashboard_actions_empty");
    }

    messages.push({
      role: "assistant",
      content: executableToolCalls.map((tc) => ({
        type: "tool_use" as const,
        id: tc.id,
        name: tc.name,
        input: tc.input as Record<string, unknown>,
      })),
    });

    const executeApprovedToolCall = async (tc: RawToolCall) => {
      let result: string;
      try {
        result = await executeTool(tc.name, tc.input, ctx, settings);
      } catch (err) {
        result = `Error: tool "${tc.name}" threw — ${err instanceof Error ? err.message : String(err)}`;
      }
      executedToolCalls.push(tc.name);
      actionsPerformed.push({ tool: tc.name, result });
      return { type: "tool_result" as const, tool_use_id: tc.id, content: result };
    };

    const toolResults = ctx.thread.channelType === "dashboard_agent"
      ? []
      : await Promise.all(
        executableToolCalls.map(async (tc) => {
          return executeApprovedToolCall(tc);
        })
      );

    if (ctx.thread.channelType === "dashboard_agent") {
      for (const tc of executableToolCalls) {
        toolResults.push(await executeApprovedToolCall(tc));
      }
    }

    messages.push({ role: "user", content: toolResults });

    if (ctx.thread.channelType === "dashboard_agent") {
      return finish({
        summary: summarizeApprovedDashboardActions(actionsPerformed),
        actionsPerformed,
      }, "approved_dashboard_actions");
    }
  }

  const systemPrompt = buildSystemPrompt(ctx, settings);

  let totalTokens = 0;
  const TOKEN_BUDGET = 20_000;

  for (let i = 0; i < maxIterations; i++) {
    logger.info({ iteration: i, messageCount: messages.length }, '[agent] iteration start');

    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
      tools,
      // Force operator-mode to call a tool on the first iteration so it can't
      // hallucinate a "sent email" response without actually calling send_email.
      ...(operatorMode && i === 0 && tools.length > 0 ? { tool_choice: { type: "any" } } : {}),
    });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const usage = recordModelUsage(usageTotals, response);
    totalTokens = usageTotals.totalTokens;
    logger.info({ iteration: i, stopReason: response.stop_reason, tools: toolUseBlocks.map(b => b.name), usage, totalTokens }, '[agent] iteration end');

    // Add the assistant turn before deciding what to do next
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "max_tokens") {
      return finish({ summary: "Agent response was cut off — the request may be too complex. Try breaking it into smaller steps.", actionsPerformed }, "max_tokens");
    }

    if (totalTokens >= TOKEN_BUDGET) {
      return finish({ summary: "Agent stopped — this request required too many steps. Please try a more specific instruction.", actionsPerformed }, "token_budget");
    }

    // No tool calls → final answer
    if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      return finish({ summary: textBlock?.text ?? "Done.", actionsPerformed }, "end_turn");
    }

    // Execute tool calls in parallel
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        logger.info({ tool: block.name, args: block.input }, '[agent] tool call');
        let result: string;
        try {
          result = await executeTool(block.name, block.input, ctx, settings);
        } catch (err) {
          result = `Error: tool "${block.name}" threw — ${err instanceof Error ? err.message : String(err)}`;
          logger.error({ err, tool: block.name }, '[agent] tool error');
        }
        logger.info({ tool: block.name, result }, '[agent] tool result');
        executedToolCalls.push(block.name);
        actionsPerformed.push({ tool: block.name, result });
        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: result,
        };
      })
    );

    // Tool results go back as a user message in the Anthropic protocol
    messages.push({ role: "user", content: toolResults });
  }

  return finish({
    summary: "Reached maximum steps without completing the task.",
    actionsPerformed,
  }, "max_iterations");
}
