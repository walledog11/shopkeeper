import { db } from "@clerk/db";
import { openai } from "@/lib/openai";
import { AGENT_TOOLS } from "./tools";
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
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const MAX_ITERATIONS = 10;

// ── Context ───────────────────────────────────────────────────────────────────

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

  // Auto-resolve Shopify customer ID for email threads when not yet linked
  let shopifyCustomerId = thread.shopifyCustomerId;
  if (!shopifyCustomerId && thread.channelType === "email" && shopifyIntegration?.accessToken) {
    try {
      const email = thread.customer.platformId;
      const res = await fetch(
        `https://${shopifyIntegration.externalAccountId}/admin/api/2024-01/customers/search.json?query=email:${encodeURIComponent(email)}&fields=id&limit=1`,
        { headers: { "X-Shopify-Access-Token": shopifyIntegration.accessToken } }
      );
      const data = await res.json();
      const found = data.customers?.[0];
      if (found?.id) shopifyCustomerId = String(found.id);
    } catch {
      // best-effort; leave null
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
      name: thread.customer.name,
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

  const messageHistory = ctx.recentMessages
    .map((m) => `  [${m.senderType}]: ${m.contentText ?? "(media)"}`)
    .join("\n");

  const otherOpenThreads = Math.max(0, ctx.openThreadCount - 1);

  return `You are an AI support agent for ${ctx.orgName}. You help support staff take actions on their behalf.

## Current thread
- Thread ID: ${ctx.thread.id}
- Status: ${ctx.thread.status}
- Channel: ${ctx.thread.channelType}
- Tag: ${ctx.thread.tag ?? "none"}
- AI Summary: ${ctx.thread.aiSummary ?? "none"}
- Customer: ${ctx.customer.name ?? ctx.customer.platformId}
- Customer's other open threads: ${otherOpenThreads}

## Recent conversation
${messageHistory || "  (no messages yet)"}

## Integrations
${shopifyNote}
${shopifyCustomerNote}

## Instructions
- Use the available tools to complete the requested task.
- After completing an action, always call add_internal_note to document what you did.
- If a task requires information you don't have (e.g. a customer ID), use get_shopify_customer or get_shopify_orders first.
- Be precise and only make changes explicitly requested.
- When done, provide a short plain-text summary of what was accomplished.`;
}

// ── Main agent runner ─────────────────────────────────────────────────────────

export interface AgentResult {
  summary: string;
  actionsPerformed: ActionEntry[];
}

export async function runAgent(
  ctx: AgentContext,
  instruction: string
): Promise<AgentResult> {
  const actionsPerformed: ActionEntry[] = [];

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(ctx) },
    { role: "user",   content: instruction },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    console.log(`[agent] iteration ${i} — sending ${messages.length} messages`);
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools: AGENT_TOOLS,
      tool_choice: "auto",
    });

    const choice = response.choices[0];
    messages.push(choice.message);

    const toolCalls = choice.message.tool_calls;
    console.log(`[agent] iteration ${i} — finish_reason: ${choice.finish_reason}, tool_calls: ${toolCalls?.map(t => t.type === "function" ? t.function.name : t.type).join(", ") ?? "none"}`);

    // No tool calls → final answer
    if (!toolCalls || toolCalls.length === 0) {
      const summary = choice.message.content ?? "Done.";
      return { summary, actionsPerformed };
    }

    // Execute each tool call in parallel (narrow to function-type calls only)
    const functionCalls = toolCalls.filter(
      (tc): tc is typeof tc & { type: "function"; function: { name: string; arguments: string } } =>
        tc.type === "function"
    );
    const toolResults = await Promise.all(
      functionCalls.map(async (tc) => {
        const args = JSON.parse(tc.function.arguments) as unknown;
        console.log(`[agent] calling tool: ${tc.function.name} args: ${tc.function.arguments}`);
        let result: string;
        try {
          result = await executeTool(tc.function.name, args, ctx);
        } catch (err) {
          result = `Error: tool "${tc.function.name}" threw an exception — ${err instanceof Error ? err.message : String(err)}`;
          console.error(`[agent] tool "${tc.function.name}" threw:`, err);
        }
        console.log(`[agent] tool result: ${result}`);
        actionsPerformed.push({ tool: tc.function.name, result });
        return {
          role: "tool" as const,
          tool_call_id: tc.id,
          content: result,
        };
      })
    );

    messages.push(...toolResults);
  }

  // Exceeded max iterations
  return {
    summary: "Reached maximum steps without completing the task.",
    actionsPerformed,
  };
}
