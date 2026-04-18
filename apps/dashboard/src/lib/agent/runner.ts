import { db } from "@clerk/db";
import { anthropic } from "@/lib/ai/anthropic";
import { AI_MODEL } from "@/lib/ai";
import logger from "@/lib/logger";
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
  createRefund,
  cancelOrder,
  createShopifyOrder,
  editShopifyOrder,
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

// ── Context ───────────────────────────────────────────────────────────────────

export interface ShopifyOrderSummary {
  id: string;
  name: string;
  created_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  items: { title: string; quantity: number; variant_id: string | null }[];
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
        `https://${shopifyIntegration.externalAccountId}/admin/api/2024-01/customers/search.json?query=email:${encodeURIComponent(email)}&fields=id,first_name,last_name&limit=1`,
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
      ? fetch(`https://${externalAccountId}/admin/api/2024-01/customers/${shopifyCustomerId}.json?fields=first_name,last_name`, { headers })
          .then(r => r.json()).catch(() => null)
      : Promise.resolve(null);

    const ordersFetch = isOperatorChannel ? Promise.resolve(null) : fetch(
      `https://${externalAccountId}/admin/api/2024-01/orders.json?customer_id=${shopifyCustomerId}&status=any&limit=5&fields=id,name,created_at,financial_status,fulfillment_status,current_total_price,line_items`,
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
        line_items: { title: string; quantity: number; fulfillable_quantity: number; variant_id: number | null }[];
      }) => ({
        id: String(o.id),
        name: o.name,
        created_at: o.created_at,
        financial_status: o.financial_status,
        fulfillment_status: o.fulfillment_status,
        total_price: o.current_total_price,
        items: o.line_items.filter((li) => li.fulfillable_quantity > 0).map((li) => ({
          title: li.title,
          quantity: li.quantity,
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
  ctx: AgentContext
): Promise<string> {
  const noShopify = "Error: no Shopify integration connected.";
  const threadCtx = { threadId: ctx.thread.id, orgId: ctx.orgId, orgName: ctx.orgName };

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

    case "create_refund":
      return ctx.shopify ? createRefund(cast<CreateRefundInput>(args), ctx.shopify) : noShopify;

    case "cancel_order":
      return ctx.shopify ? cancelOrder(cast<CancelOrderInput>(args), ctx.shopify) : noShopify;

    case "create_shopify_order":
      return ctx.shopify ? createShopifyOrder(cast<CreateShopifyOrderInput>(args), ctx.shopify) : noShopify;

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

function buildSystemPrompt(ctx: AgentContext, settings?: OrgSettings): string {
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
- When the customer wants to remove an item from their order, call edit_shopify_order with only remove_variant_id — use the variant_id from the recent orders context above. No variant_id or quantity needed for a pure removal.
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

// Convert OpenAI-format tool definitions to Anthropic format, filtered by enabled categories
function toAnthropicTools(settings?: OrgSettings): Anthropic.Tool[] {
  const s = resolveAgentSettings(settings);
  return AGENT_TOOLS.flatMap((t) => {
    if (t.type !== "function") return [];
    const fn = t.function as { name: string; description?: string; parameters?: unknown };
    const category = TOOL_CATEGORIES[fn.name];
    if (category && !s.toolsEnabled[category]) return [];
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
  const isOperatorMode = ctx.thread.channelType === 'dashboard_agent' || ctx.thread.channelType === 'sms_agent';
  const historyWindow = isOperatorMode ? ctx.recentMessages.slice(-4) : ctx.recentMessages;
  const baseMessages = buildMessageHistory(historyWindow, instruction)
  const systemPrompt = buildSystemPrompt(ctx, settings);
  const tools = toAnthropicTools(settings);

  // Phase 1: initial planning
  const response1 = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: baseMessages,
    tools,
  })

  const blocks1 = response1.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
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
  if (readBlocks.length > 0) {
    // Execute reads in parallel to get real results
    const readResultsMap = new Map<string, string>()
    await Promise.all(
      readBlocks.map(async (b) => {
        let content: string
        try { content = await executeTool(b.name, b.input, ctx) }
        catch { content = 'Lookup failed' }
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
        if (block.name === 'get_shopify_customer' || block.name === 'search_shopify_customers')
          warnings.push("Couldn't find a Shopify customer — verify the correct account is linked before approving.")
        else if (block.name === 'get_shopify_orders' || block.name === 'get_order_by_name')
          warnings.push("No matching order found — confirm the order number with the customer before proceeding.")
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
    rawToolCalls.push(...lastBlocks.map((b) => ({ id: b.id, name: b.name, input: b.input })))
    planMessages = [...planMessages, { role: "assistant", content: response15.content }]
  }

  // Phase 2: if no send_reply was planned yet, simulate write results and get a reply preview
  const hasSendReply = rawToolCalls.some((tc) => tc.name === 'send_reply')
  const sendReplyTool = tools.find(t => t.name === 'send_reply')
  if (!hasSendReply && sendReplyTool) {
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

  return { instruction, steps, rawToolCalls, warnings: warnings.length > 0 ? warnings : undefined }
}

export async function runAgent(
  ctx: AgentContext,
  instruction: string,
  approvedToolCalls?: RawToolCall[],
  settings?: OrgSettings
): Promise<AgentResult> {
  const s = resolveAgentSettings(settings);
  const maxIterations = s.maxIterations > 0 ? s.maxIterations : DEFAULT_MAX_ITERATIONS;
  const actionsPerformed: ActionEntry[] = [];
  const isOperatorMode = ctx.thread.channelType === 'dashboard_agent' || ctx.thread.channelType === 'sms_agent';
  const history = isOperatorMode ? ctx.recentMessages.slice(-4) : ctx.recentMessages;
  const messages = buildMessageHistory(history, instruction);

  const tools = toAnthropicTools(settings);

  // If the caller pre-approved a plan, inject those tool calls and execute them
  // before starting the regular loop so Claude can follow up.
  if (approvedToolCalls && approvedToolCalls.length > 0) {
    messages.push({
      role: "assistant",
      content: approvedToolCalls.map((tc) => ({
        type: "tool_use" as const,
        id: tc.id,
        name: tc.name,
        input: tc.input as Record<string, unknown>,
      })),
    });

    const toolResults = await Promise.all(
      approvedToolCalls.map(async (tc) => {
        let result: string;
        try {
          result = await executeTool(tc.name, tc.input, ctx);
        } catch (err) {
          result = `Error: tool "${tc.name}" threw — ${err instanceof Error ? err.message : String(err)}`;
        }
        actionsPerformed.push({ tool: tc.name, result });
        return { type: "tool_result" as const, tool_use_id: tc.id, content: result };
      })
    );

    messages.push({ role: "user", content: toolResults });
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
      ...(isOperatorMode && i === 0 && tools.length > 0 ? { tool_choice: { type: "any" } } : {}),
    });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    totalTokens += (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
    logger.info({ iteration: i, stopReason: response.stop_reason, tools: toolUseBlocks.map(b => b.name), totalTokens }, '[agent] iteration end');

    // Add the assistant turn before deciding what to do next
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "max_tokens") {
      return { summary: "Agent response was cut off — the request may be too complex. Try breaking it into smaller steps.", actionsPerformed };
    }

    if (totalTokens >= TOKEN_BUDGET) {
      return { summary: "Agent stopped — this request required too many steps. Please try a more specific instruction.", actionsPerformed };
    }

    // No tool calls → final answer
    if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      return { summary: textBlock?.text ?? "Done.", actionsPerformed };
    }

    // Execute tool calls in parallel
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        logger.info({ tool: block.name, args: block.input }, '[agent] tool call');
        let result: string;
        try {
          result = await executeTool(block.name, block.input, ctx);
        } catch (err) {
          result = `Error: tool "${block.name}" threw — ${err instanceof Error ? err.message : String(err)}`;
          logger.error({ err, tool: block.name }, '[agent] tool error');
        }
        logger.info({ tool: block.name, result }, '[agent] tool result');
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

  return {
    summary: "Reached maximum steps without completing the task.",
    actionsPerformed,
  };
}
