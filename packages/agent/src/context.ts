import { db } from "@shopkeeper/db";
import { shopifyRestJson, type ShopifyContext } from "./shopify/client.js";
import { isOperatorChannel } from "./thread-constants.js";
import type { ToolResult } from "./tools/result.js";
import type {
  AddInternalNoteInput,
  AskOperatorInput,
  SendReplyInput,
  SendEmailInput,
  UpdateThreadStatusInput,
  UpdateThreadTagInput,
  EscalateToHumanInput,
} from "./tools/registry/index.js";
import type { AgentContext, BaseAgentContext, ShopifyOrderSummary } from "./agent-context.js";

// Where a thread-coupled tool delivers. Support injects the dashboard messaging
// stack (Postmark/IG/email) here; the package itself never imports a provider.
// `escalate` and `io` on the built context are wired from these, bound to the
// thread's identity.
interface ThreadSinkContext {
  threadId: string;
  orgId: string;
  orgName: string;
}

export interface ThreadSink {
  escalateToHuman(input: EscalateToHumanInput, ctx: ThreadSinkContext): Promise<ToolResult>;
  askOperator(input: AskOperatorInput, ctx: ThreadSinkContext): Promise<ToolResult>;
  addInternalNote(input: AddInternalNoteInput, ctx: ThreadSinkContext): Promise<ToolResult>;
  sendReply(input: SendReplyInput, ctx: ThreadSinkContext): Promise<ToolResult>;
  sendEmail(input: SendEmailInput, ctx: ThreadSinkContext): Promise<ToolResult>;
  updateThreadStatus(input: UpdateThreadStatusInput, ctx: ThreadSinkContext): Promise<ToolResult>;
  updateThreadTag(input: UpdateThreadTagInput, ctx: ThreadSinkContext): Promise<ToolResult>;
}

type RawShopifyOrder = {
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
  shipping_address?: {
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    province?: string | null;
    zip?: string | null;
    country?: string | null;
    country_name?: string | null;
  } | null;
};

export interface BuildContextOptions {
  pinKbArticles?: readonly { title: string; body: string }[];
}

function mergePinnedKbArticles(
  pinned: readonly { title: string; body: string }[],
  loaded: readonly { title: string; body: string; tags: string[] }[],
): { title: string; body: string; tags: string[] }[] {
  const seenTitles = new Set<string>();
  const merged: { title: string; body: string; tags: string[] }[] = [];

  for (const article of pinned) {
    const key = article.title.trim().toLowerCase();
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    merged.push({ title: article.title, body: article.body, tags: [] });
  }

  for (const article of loaded) {
    const key = article.title.trim().toLowerCase();
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    merged.push(article);
  }

  const limit = Math.max(3, pinned.length);
  return merged.slice(0, limit);
}

export async function buildContext(
  threadId: string,
  orgId: string,
  sink: ThreadSink,
  options?: BuildContextOptions,
): Promise<AgentContext> {
  const [thread, org, shopifyIntegration, allKbArticles] = await Promise.all([
    db.thread.findUnique({
      where: { id: threadId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            platformId: true,
          },
        },
        messages: { orderBy: { sentAt: "desc" }, take: 50 },
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

  const openThreadCountPromise = db.thread.count({
    where: { customerId: thread.customerId, status: "open" },
  });

  const dbName = thread.customer.name?.includes("@") ? null : (thread.customer.name ?? null);

  let shopifyCustomerId = thread.shopifyCustomerId;
  let shopifyCustomerName: string | null = null;
  if (!shopifyCustomerId && thread.channelType === "email" && shopifyIntegration?.accessToken) {
    try {
      const email = thread.customer.platformId;
      const data = await shopifyRestJson<{ customers?: { id: number; first_name?: string | null; last_name?: string | null }[] }>(
        { shop: shopifyIntegration.externalAccountId, accessToken: shopifyIntegration.accessToken },
        "customers/search.json",
        { query: { query: `email:${email}`, fields: "id,first_name,last_name", limit: 1 } }
      );
      const found = data.customers?.[0];
      if (found?.id) {
        shopifyCustomerId = String(found.id);
        const parts = [found.first_name, found.last_name].filter(Boolean);
        if (parts.length > 0) shopifyCustomerName = parts.join(" ");
        await db.thread.update({
          where: { id: thread.id },
          data: { shopifyCustomerId },
        }).catch(() => {});
      }
    } catch {
      // Best effort; leave the thread unlinked.
    }
  }

  const isOperator = isOperatorChannel(thread.channelType);

  let recentOrders: ShopifyOrderSummary[] = [];
  if (shopifyCustomerId && shopifyIntegration?.accessToken) {
    const ctx: ShopifyContext = { shop: shopifyIntegration.externalAccountId, accessToken: shopifyIntegration.accessToken };

    const nameFetch = (!shopifyCustomerName && (isOperator || !dbName))
      ? shopifyRestJson<{ customer?: { first_name?: string | null; last_name?: string | null } }>(
          ctx,
          `customers/${shopifyCustomerId}.json`,
          { query: { fields: "first_name,last_name" } }
        ).catch(() => null)
      : Promise.resolve(null);

    const ordersFetch = shopifyRestJson<{ orders?: RawShopifyOrder[] }>(
      ctx,
      "orders.json",
      {
        query: {
          customer_id: shopifyCustomerId,
          status: "any",
          limit: 5,
          fields: "id,name,created_at,financial_status,fulfillment_status,current_total_price,line_items,shipping_address",
        },
      }
    ).catch(() => null);

    const [nameData, ordersData] = await Promise.all([nameFetch, ordersFetch]);

    if (nameData) {
      const parts = [nameData.customer?.first_name, nameData.customer?.last_name].filter(Boolean);
      if (parts.length > 0) shopifyCustomerName = parts.join(" ");
    }

    if (ordersData?.orders) {
      recentOrders = ordersData.orders.map((o) => ({
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
        shipping_address: o.shipping_address
          ? {
              address1: o.shipping_address.address1 ?? null,
              address2: o.shipping_address.address2 ?? null,
              city: o.shipping_address.city ?? null,
              province: o.shipping_address.province ?? null,
              zip: o.shipping_address.zip ?? null,
              country: o.shipping_address.country_name ?? o.shipping_address.country ?? null,
            }
          : null,
      }));
    }
  }

  const openThreadCount = await openThreadCountPromise;

  const threadTag = thread.tag?.toLowerCase();
  const matchingKbArticles = threadTag
    ? allKbArticles.filter(a => a.tags.some(t => t.toLowerCase() === threadTag))
    : allKbArticles;
  const loadedKbArticles = matchingKbArticles.length > 0 ? matchingKbArticles : allKbArticles;
  const kbArticles = options?.pinKbArticles?.length
    ? mergePinnedKbArticles(options.pinKbArticles, loadedKbArticles)
    : loadedKbArticles;

  const threadIo = { threadId: thread.id, orgId, orgName: org?.name ?? "Support" };

  const base: BaseAgentContext = {
    orgId,
    orgName: org?.name ?? "Support",
    recentMessages: [...thread.messages].reverse().map((m) => ({
      senderType: m.senderType,
      contentText: m.contentText,
    })),
    shopify:
      shopifyIntegration?.accessToken
        ? { shop: shopifyIntegration.externalAccountId, accessToken: shopifyIntegration.accessToken }
        : null,
    escalate: (reason) =>
      sink.escalateToHuman({ reason }, threadIo).then(() => {}),
    askOperator: (question) =>
      sink.askOperator({ question }, threadIo).then(() => {}),
    io: {
      addInternalNote: (input) => sink.addInternalNote(input, threadIo),
      sendReply: (input) => sink.sendReply(input, threadIo),
      sendEmail: (input) => sink.sendEmail(input, threadIo),
      updateThreadStatus: (input) => sink.updateThreadStatus(input, threadIo),
      updateThreadTag: (input) => sink.updateThreadTag(input, threadIo),
    },
  };

  return {
    ...base,
    thread: {
      id: thread.id,
      status: thread.status,
      channelType: thread.channelType,
      tag: thread.tag,
      aiSummary: thread.aiSummary,
      shopifyCustomerId,
    },
    customer: {
      id: thread.customer.id,
      name: dbName ?? shopifyCustomerName,
      platformId: thread.customer.platformId,
    },
    openThreadCount,
    recentOrders,
    linkedShopifyCustomerName: isOperator ? shopifyCustomerName : null,
    kbArticles: kbArticles.map(a => ({ title: a.title, body: a.body })),
  };
}
