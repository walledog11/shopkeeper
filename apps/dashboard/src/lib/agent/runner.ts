import { db } from "@clerk/db";
import { anthropic } from "@/lib/anthropic";
import { AI_MODEL } from "@/lib/ai";
import type Anthropic from "@anthropic-ai/sdk";
import { AGENT_TOOLS, TOOL_CATEGORIES, PLAN_STEP_LABELS } from "./tools";
import type { PlanStep, RawToolCall, AgentPlan } from "@/types";
import {
  getShopifyCustomer,
  updateShopifyCustomerInfo,
  getShopifyOrders,
  updateShopifyOrderAddress,
  addShopifyCustomerNote,
  getOrderByName,
  createRefund,
  cancelOrder,
} from "./shopify-tools";
import {
  addInternalNote,
  sendReply,
  updateThreadStatus,
  updateThreadTag,
} from "./thread-tools";
import type {
  GetShopifyCustomerInput,
  UpdateShopifyCustomerInfoInput,
  GetShopifyOrdersInput,
  UpdateShopifyOrderAddressInput,
  AddShopifyCustomerNoteInput,
  GetOrderByNameInput,
  CreateRefundInput,
  CancelOrderInput,
  AddInternalNoteInput,
  SendReplyInput,
  UpdateThreadStatusInput,
  UpdateThreadTagInput,
} from "./tools";

const MAX_ITERATIONS = 10;

// ── Context ───────────────────────────────────────────────────────────────────

export interface ShopifyOrderSummary {
  id: string;
  name: string;
  created_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  items: string[];
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
}

export async function buildContext(threadId: string, orgId: string): Promise<AgentContext> {
  const [thread, org, shopifyIntegration] = await Promise.all([
    db.thread.findUnique({
      where: { id: threadId },
      include: {
        customer: true,
        messages: { orderBy: { sentAt: "asc" }, take: 50 },
      },
    }),
    db.organization.findUnique({ where: { id: orgId } }),
    db.integration.findFirst({ where: { organizationId: orgId, platform: "shopify" } }),
  ]);

  if (!thread || thread.organizationId !== orgId) {
    throw new Error("Thread not found");
  }

  const openThreadCount = await db.thread.count({
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
      }
    } catch {
      // best-effort; leave null
    }
  }

  // If the thread is already linked to a Shopify customer but we still have no real name,
  // fetch it directly from Shopify.
  if (shopifyCustomerId && !dbName && !shopifyCustomerName && shopifyIntegration?.accessToken) {
    try {
      const res = await fetch(
        `https://${shopifyIntegration.externalAccountId}/admin/api/2024-01/customers/${shopifyCustomerId}.json?fields=first_name,last_name`,
        { headers: { "X-Shopify-Access-Token": shopifyIntegration.accessToken } }
      );
      const data = await res.json();
      const parts = [data.customer?.first_name, data.customer?.last_name].filter(Boolean);
      if (parts.length > 0) shopifyCustomerName = parts.join(' ');
    } catch {
      // best-effort; leave null
    }
  }

  // Pre-fetch recent Shopify orders so the agent has order context upfront
  let recentOrders: ShopifyOrderSummary[] = [];
  if (shopifyCustomerId && shopifyIntegration?.accessToken) {
    try {
      const ordersRes = await fetch(
        `https://${shopifyIntegration.externalAccountId}/admin/api/2024-01/orders.json?customer_id=${shopifyCustomerId}&status=any&limit=5&fields=id,name,created_at,financial_status,fulfillment_status,total_price,line_items`,
        { headers: { "X-Shopify-Access-Token": shopifyIntegration.accessToken } }
      );
      const ordersData = await ordersRes.json();
      if (ordersRes.ok && ordersData.orders) {
        recentOrders = ordersData.orders.map((o: {
          id: number;
          name: string;
          created_at: string;
          financial_status: string;
          fulfillment_status: string | null;
          total_price: string;
          line_items: { title: string; quantity: number }[];
        }) => ({
          id: String(o.id),
          name: o.name,
          created_at: o.created_at,
          financial_status: o.financial_status,
          fulfillment_status: o.fulfillment_status,
          total_price: o.total_price,
          items: o.line_items.map((li) => `${li.quantity}x ${li.title}`),
        }));
      }
    } catch {
      // best-effort; leave empty
    }
  }

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
  };
}

// ── Action log entry ──────────────────────────────────────────────────────────

export interface ActionEntry {
  tool: string;
  result: string;
}

// ── Tool dispatch ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cast<T>(v: unknown): T { return v as T; }

async function executeTool(
  name: string,
  args: unknown,
  ctx: AgentContext
): Promise<string> {
  const shopifyCtx = ctx.shopify ?? { shop: "", accessToken: "" };
  const threadCtx = { threadId: ctx.thread.id, orgId: ctx.orgId };

  switch (name) {
    case "get_shopify_customer":
      if (!ctx.shopify) return "Error: no Shopify integration connected.";
      return getShopifyCustomer(cast<GetShopifyCustomerInput>(args), shopifyCtx);

    case "update_shopify_customer_info":
      if (!ctx.shopify) return "Error: no Shopify integration connected.";
      return updateShopifyCustomerInfo(cast<UpdateShopifyCustomerInfoInput>(args), shopifyCtx);

    case "get_shopify_orders":
      if (!ctx.shopify) return "Error: no Shopify integration connected.";
      return getShopifyOrders(cast<GetShopifyOrdersInput>(args), shopifyCtx);

    case "update_shopify_order_address":
      if (!ctx.shopify) return "Error: no Shopify integration connected.";
      return updateShopifyOrderAddress(cast<UpdateShopifyOrderAddressInput>(args), shopifyCtx);

    case "add_shopify_customer_note":
      if (!ctx.shopify) return "Error: no Shopify integration connected.";
      return addShopifyCustomerNote(cast<AddShopifyCustomerNoteInput>(args), shopifyCtx);

    case "get_order_by_name":
      if (!ctx.shopify) return "Error: no Shopify integration connected.";
      return getOrderByName(cast<GetOrderByNameInput>(args), shopifyCtx);

    case "create_refund":
      if (!ctx.shopify) return "Error: no Shopify integration connected.";
      return createRefund(cast<CreateRefundInput>(args), shopifyCtx);

    case "cancel_order":
      if (!ctx.shopify) return "Error: no Shopify integration connected.";
      return cancelOrder(cast<CancelOrderInput>(args), shopifyCtx);

    case "add_internal_note":
      return addInternalNote(cast<AddInternalNoteInput>(args), threadCtx);

    case "send_reply":
      return sendReply(cast<SendReplyInput>(args), threadCtx);

    case "update_thread_status":
      return updateThreadStatus(cast<UpdateThreadStatusInput>(args), threadCtx);

    case "update_thread_tag":
      return updateThreadTag(cast<UpdateThreadTagInput>(args), threadCtx);

    default:
      return `Error: unknown tool "${name}".`;
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(ctx: AgentContext): string {
  const shopifyNote = ctx.shopify
    ? `A Shopify integration is connected (shop: ${ctx.shopify.shop}).`
    : "No Shopify integration is connected — Shopify tools will not work.";

  const shopifyCustomerNote = ctx.thread.shopifyCustomerId
    ? `Shopify customer ID: ${ctx.thread.shopifyCustomerId} — pass this directly when calling Shopify tools.`
    : "No Shopify customer ID is available for this thread. Do not attempt Shopify customer operations.";

  const otherOpenThreads = Math.max(0, ctx.openThreadCount - 1);

  const ordersJson = ctx.recentOrders.length > 0
    ? JSON.stringify(ctx.recentOrders)
    : "[]";

  return `You are an AI support agent for ${ctx.orgName}. You help support staff take actions on their behalf.

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
- Be precise and only make changes explicitly requested.
- Respond like a knowledgeable coworker giving a quick status update — direct, factual, no fluff.
- Keep summaries to 1–2 sentences. No bullet lists, no markdown formatting.
- Never ask if the user has more questions or offer further help. Just state what you found or did and stop.
- If send_reply returns an error, do NOT change the thread status. Log an internal note describing the failure and report the error back to the support agent so they can act.`;
}

// ── Main agent runner ─────────────────────────────────────────────────────────

export interface AgentResult {
  summary: string;
  actionsPerformed: ActionEntry[];
}

// Convert OpenAI-format tool definitions to Anthropic format
function toAnthropicTools(): Anthropic.Tool[] {
  return AGENT_TOOLS.flatMap((t) => {
    if (t.type !== "function") return [];
    const fn = t.function as { name: string; description?: string; parameters?: unknown };
    return [{
      name: fn.name,
      description: fn.description ?? "",
      input_schema: fn.parameters as Anthropic.Tool["input_schema"],
    }];
  });
}

// ── Plan generation (one LLM call, no side effects) ──────────────────────────

function describeTool(name: string, input: unknown): string {
  const a = input as Record<string, unknown>
  switch (name) {
    case 'update_shopify_order_address': {
      const parts = [a.address1, a.city, a.province, a.zip].filter(Boolean)
      return `Change shipping address to ${parts.join(', ')}`
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
    case 'add_shopify_customer_note':
      return `Add note to Shopify customer`
    case 'send_reply': {
      const text = String(a.text ?? '')
      return text.length > 80 ? `"${text.slice(0, 80)}…"` : `"${text}"`
    }
    case 'add_internal_note':
      return `Add internal note`
    case 'update_thread_status':
      return `Set status to ${a.status}`
    case 'update_thread_tag':
      return `Tag as "${a.tag}"`
    case 'get_order_by_name':
      return `Look up order ${a.order_name}`
    default:
      return name.replace(/_/g, ' ')
  }
}

export async function planAgent(
  ctx: AgentContext,
  instruction: string
): Promise<AgentPlan> {
  const rawHistory = ctx.recentMessages.map((m) => ({
    role: (m.senderType === "agent" || m.senderType === "note")
      ? "assistant" as const
      : "user" as const,
    content: m.contentText ?? "(media)",
  }))

  const mergedHistory: Anthropic.MessageParam[] = []
  for (const msg of rawHistory) {
    const last = mergedHistory[mergedHistory.length - 1]
    if (last && last.role === msg.role && typeof last.content === "string") {
      last.content += "\n" + msg.content
    } else {
      mergedHistory.push({ role: msg.role, content: msg.content })
    }
  }
  while (mergedHistory.length > 0 && mergedHistory[0].role === "assistant") {
    mergedHistory.shift()
  }

  const messages: Anthropic.MessageParam[] = [
    ...mergedHistory,
    { role: "user", content: instruction },
  ]

  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(ctx),
    messages,
    tools: toAnthropicTools(),
  })

  const toolUseBlocks = response.content.filter(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  )

  const rawToolCalls: RawToolCall[] = toolUseBlocks.map((b) => ({
    id: b.id,
    name: b.name,
    input: b.input,
  }))

  // Phase 2: if actions were planned but no send_reply yet, simulate success
  // and ask the LLM what it would send to the customer so we can show a preview.
  const hasActions = rawToolCalls.some((tc) => TOOL_CATEGORIES[tc.name] === 'action')
  const hasSendReply = rawToolCalls.some((tc) => tc.name === 'send_reply')

  if (hasActions && !hasSendReply && toolUseBlocks.length > 0) {
    const phase2Messages: Anthropic.MessageParam[] = [
      ...messages,
      { role: "assistant", content: response.content },
      {
        role: "user",
        content: toolUseBlocks.map((b) => ({
          type: "tool_result" as const,
          tool_use_id: b.id,
          content: "Success",
        })),
      },
    ]

    const response2 = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 512,
      system: buildSystemPrompt(ctx),
      messages: phase2Messages,
      tools: toAnthropicTools(),
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

  return { instruction, steps, rawToolCalls }
}

export async function runAgent(
  ctx: AgentContext,
  instruction: string,
  approvedToolCalls?: RawToolCall[]
): Promise<AgentResult> {
  const actionsPerformed: ActionEntry[] = [];

  // Build conversation history as alternating user/assistant turns.
  // Consecutive same-role messages are merged so Anthropic's strict
  // alternation requirement is satisfied.
  const rawHistory = ctx.recentMessages.map((m) => ({
    role: (m.senderType === "agent" || m.senderType === "note")
      ? "assistant" as const
      : "user" as const,
    content: m.contentText ?? "(media)",
  }));

  const mergedHistory: Anthropic.MessageParam[] = [];
  for (const msg of rawHistory) {
    const last = mergedHistory[mergedHistory.length - 1];
    if (last && last.role === msg.role && typeof last.content === "string") {
      last.content += "\n" + msg.content;
    } else {
      mergedHistory.push({ role: msg.role, content: msg.content });
    }
  }

  // Anthropic requires the first message to be from the user
  while (mergedHistory.length > 0 && mergedHistory[0].role === "assistant") {
    mergedHistory.shift();
  }

  const messages: Anthropic.MessageParam[] = [
    ...mergedHistory,
    { role: "user", content: instruction },
  ];

  const tools = toAnthropicTools();

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

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    console.log(`[agent] iteration ${i} — sending ${messages.length} messages`);

    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      system: buildSystemPrompt(ctx),
      messages,
      tools,
    });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    console.log(`[agent] iteration ${i} — stop_reason: ${response.stop_reason}, tools: ${toolUseBlocks.map((b) => b.name).join(", ") || "none"}`);

    // Add the assistant turn before deciding what to do next
    messages.push({ role: "assistant", content: response.content });

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
        console.log(`[agent] calling tool: ${block.name} args: ${JSON.stringify(block.input)}`);
        let result: string;
        try {
          result = await executeTool(block.name, block.input, ctx);
        } catch (err) {
          result = `Error: tool "${block.name}" threw — ${err instanceof Error ? err.message : String(err)}`;
          console.error(`[agent] tool "${block.name}" threw:`, err);
        }
        console.log(`[agent] tool result: ${result}`);
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
