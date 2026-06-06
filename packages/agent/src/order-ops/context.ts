import { db } from "@clerk/db";
import { shopifyRestJson, type ShopifyContext } from "../shopify/index.js";
import type { BaseAgentContext } from "../agent-context.js";

// Order-ops (module #2): a thread-less agent context. Unlike SupportContext this
// carries no thread and no customer row - the unit of work is a Shopify order,
// not a conversation. buildOrderOpsContext is the order-ops analogue of
// buildContext(threadId, orgId): the caller injects the escalate sink (Seam 2),
// just as buildContext takes a ThreadSink.

export interface OrderRiskSignal {
  code: string;
  detail: string;
}

export interface OrderForReview {
  id: string;
  name: string;
  createdAt: string;
  financialStatus: string;
  fulfillmentStatus: string | null;
  totalPrice: string;
  currency: string | null;
  customer: {
    id: string | null;
    email: string | null;
    ordersCount: number | null;
    createdAt: string | null;
  } | null;
  billing: { city: string | null; province: string | null; country: string | null } | null;
  shipping: { city: string | null; province: string | null; country: string | null } | null;
  riskSignals: OrderRiskSignal[];
}

export interface OrderOpsContext extends BaseAgentContext {
  order: OrderForReview;
}

type RawRiskOrder = {
  id: number;
  name: string;
  created_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  current_total_price: string;
  currency?: string | null;
  customer?: {
    id?: number | string | null;
    email?: string | null;
    orders_count?: number | null;
    created_at?: string | null;
  } | null;
  billing_address?: { city?: string | null; province?: string | null; country?: string | null } | null;
  shipping_address?: { city?: string | null; province?: string | null; country?: string | null } | null;
};

const HIGH_VALUE_USD = 300;

function sameCountry(a: { country: string | null } | null, b: { country: string | null } | null): boolean {
  if (!a?.country || !b?.country) return true;
  return a.country.trim().toLowerCase() === b.country.trim().toLowerCase();
}

function computeRiskSignals(order: Omit<OrderForReview, "riskSignals">): OrderRiskSignal[] {
  const signals: OrderRiskSignal[] = [];

  if (order.billing && order.shipping && !sameCountry(order.billing, order.shipping)) {
    signals.push({
      code: "billing_shipping_country_mismatch",
      detail: `Billing country ${order.billing.country} differs from shipping country ${order.shipping.country}.`,
    });
  }

  const total = Number(order.totalPrice);
  const isNewCustomer = (order.customer?.ordersCount ?? 0) <= 1;
  if (Number.isFinite(total) && total >= HIGH_VALUE_USD && isNewCustomer) {
    signals.push({
      code: "high_value_new_customer",
      detail: `First-time customer placed a ${order.currency ?? ""} ${order.totalPrice} order.`,
    });
  }

  if (order.financialStatus === "pending" || order.financialStatus === "authorized") {
    signals.push({
      code: "payment_not_captured",
      detail: `Order financial_status is "${order.financialStatus}" - payment has not been captured.`,
    });
  }

  return signals;
}

export async function buildOrderOpsContext(
  orderId: string,
  orgId: string,
  escalate: (reason: string) => Promise<void>,
): Promise<OrderOpsContext> {
  const [org, shopifyIntegration] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId } }),
    db.integration.findFirst({ where: { organizationId: orgId, platform: "shopify" } }),
  ]);

  if (!org) throw new Error("Organization not found");
  if (!shopifyIntegration?.accessToken) {
    throw new Error("No Shopify integration connected for order-ops run");
  }

  const shopifyCtx: ShopifyContext = {
    shop: shopifyIntegration.externalAccountId,
    accessToken: shopifyIntegration.accessToken,
  };

  const data = await shopifyRestJson<{ order?: RawRiskOrder }>(
    shopifyCtx,
    `orders/${orderId}.json`,
    {
      query: {
        fields:
          "id,name,created_at,financial_status,fulfillment_status,current_total_price,currency,customer,billing_address,shipping_address",
      },
    }
  );

  const raw = data.order;
  if (!raw) throw new Error(`Order ${orderId} not found`);

  const partial: Omit<OrderForReview, "riskSignals"> = {
    id: String(raw.id),
    name: raw.name,
    createdAt: raw.created_at,
    financialStatus: raw.financial_status,
    fulfillmentStatus: raw.fulfillment_status,
    totalPrice: raw.current_total_price,
    currency: raw.currency ?? null,
    customer: raw.customer
      ? {
          id: raw.customer.id != null ? String(raw.customer.id) : null,
          email: raw.customer.email ?? null,
          ordersCount: raw.customer.orders_count ?? null,
          createdAt: raw.customer.created_at ?? null,
        }
      : null,
    billing: raw.billing_address
      ? {
          city: raw.billing_address.city ?? null,
          province: raw.billing_address.province ?? null,
          country: raw.billing_address.country ?? null,
        }
      : null,
    shipping: raw.shipping_address
      ? {
          city: raw.shipping_address.city ?? null,
          province: raw.shipping_address.province ?? null,
          country: raw.shipping_address.country ?? null,
        }
      : null,
  };

  const base: BaseAgentContext = {
    orgId,
    orgName: org.name ?? "Support",
    customerMemory: null,
    recentMessages: [],
    shopify: shopifyCtx,
    // Seam 2: the injected flag sink. runOrderOps routes flag_order through
    // ctx.escalate; the host (gateway worker) decides what a flag does (record
    // a finding now, Telegram-notify later) without the core importing it.
    escalate,
  };

  return {
    ...base,
    order: { ...partial, riskSignals: computeRiskSignals(partial) },
  };
}
