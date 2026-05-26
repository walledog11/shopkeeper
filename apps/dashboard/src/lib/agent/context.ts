import { db } from "@clerk/db";
import { SHOPIFY_API_VERSION } from "./tools/shopify";
import type { AgentContext, ShopifyOrderSummary } from "./types";

export async function buildContext(threadId: string, orgId: string): Promise<AgentContext> {
  const [thread, org, shopifyIntegration, allKbArticles] = await Promise.all([
    db.thread.findUnique({
      where: { id: threadId },
      include: {
        customer: true,
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
      const res = await fetch(
        `https://${shopifyIntegration.externalAccountId}/admin/api/${SHOPIFY_API_VERSION}/customers/search.json?query=email:${encodeURIComponent(email)}&fields=id,first_name,last_name&limit=1`,
        { headers: { "X-Shopify-Access-Token": shopifyIntegration.accessToken } }
      );
      const data = await res.json();
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

  const isOperatorChannel = thread.channelType === "dashboard_agent" || thread.channelType === "sms_agent";

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
      if (parts.length > 0) shopifyCustomerName = parts.join(" ");
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

  const threadTag = thread.tag?.toLowerCase();
  const matchingKbArticles = threadTag
    ? allKbArticles.filter(a => a.tags.some(t => t.toLowerCase() === threadTag))
    : allKbArticles;
  const kbArticles = matchingKbArticles.length > 0 ? matchingKbArticles : allKbArticles;

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
      id: thread.customer.id,
      name: dbName ?? shopifyCustomerName,
      platformId: thread.customer.platformId,
    },
    recentMessages: [...thread.messages].reverse().map((m) => ({
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

export type { AgentContext, ShopifyOrderSummary } from "./types";
