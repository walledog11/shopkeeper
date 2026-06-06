import { db } from "@clerk/db";
import { BadRequestError } from "./errors.js";
import { requireOrgThread } from "./thread-auth.js";
import { shopifyRestJson } from "./shopify/index.js";
import logger from "./logger.js";

interface ResolveInternalAgentThreadParams {
  orgId: string;
  threadId?: string;
  orderNumber?: string;
  senderPhone?: string;
}

export async function resolveInternalAgentThread(params: ResolveInternalAgentThreadParams): Promise<{ id: string; channelType: string }> {
  if (params.threadId) {
    const thread = await requireOrgThread(params.threadId, params.orgId);
    return { id: thread.id, channelType: thread.channelType };
  }

  const shopifyIntegration = await db.integration.findFirst({
    where: { organizationId: params.orgId, platform: "shopify" },
  });

  let customerEmail: string | null = params.senderPhone ?? null;
  let shopifyCustomerId: string | null = null;
  let customerName: string | null = null;
  let threadTag: string | null = null;

  if (params.orderNumber && shopifyIntegration?.accessToken) {
    const orderName = params.orderNumber.startsWith("#") ? params.orderNumber : `#${params.orderNumber}`;

    try {
      const orderData = await shopifyRestJson<{
        orders?: {
          email?: string | null;
          customer?: { id?: number | string; email?: string | null; first_name?: string | null; last_name?: string | null } | null;
        }[];
      }>(
        { shop: shopifyIntegration.externalAccountId, accessToken: shopifyIntegration.accessToken },
        "orders.json",
        { query: { name: orderName, status: "any", fields: "id,name,email,customer", limit: 1 } }
      );

      const order = orderData.orders?.[0];
      if (order) {
        customerEmail = order.email || order.customer?.email || customerEmail;
        shopifyCustomerId = order.customer?.id ? String(order.customer.id) : null;
        customerName = order.customer
          ? `${order.customer.first_name ?? ""} ${order.customer.last_name ?? ""}`.trim() || null
          : null;
        threadTag = `Order ${orderName}`;
      }
    } catch {
      logger.warn({ orderNumber: params.orderNumber }, "[agent/internal] Shopify order lookup failed");
    }
  }

  if (!customerEmail) {
    throw new BadRequestError("Missing sender identity for internal agent request");
  }

  const customerKey = { organizationId: params.orgId, platformId: customerEmail };
  const customer = await db.customer.upsert({
    where: { organizationId_platformId: customerKey },
    update: customerName ? { name: customerName } : {},
    create: {
      organizationId: params.orgId,
      platformId: customerEmail,
      ...(customerName && { name: customerName }),
    },
  });

  let thread = await db.thread.findFirst({
    where: {
      organizationId: params.orgId,
      customerId: customer.id,
      channelType: "sms_agent",
      status: "open",
      ...(shopifyCustomerId ? { shopifyCustomerId } : {}),
    },
    select: { id: true },
  });

  if (!thread) {
    thread = await db.thread.create({
      data: {
        organizationId: params.orgId,
        customerId: customer.id,
        channelType: "sms_agent",
        status: "open",
        ...(threadTag && { tag: threadTag }),
        ...(shopifyCustomerId && { shopifyCustomerId }),
      },
      select: { id: true },
    });
  }

  return { id: thread.id, channelType: "sms_agent" };
}
