import type {
  ShopifyCustomer,
  ShopifyCustomerAddress,
  ShopifyFulfillment,
  ShopifyOrder,
  ShopifyOrderLineItem,
} from "../shopify/types.js";
import { legacyIdFromGid } from "../shopify/validation.js";
import { jsonResponse } from "./json-response.js";

/**
 * A fake Shopify's answers to the package's GraphQL reads, built from the
 * REST-shaped records tests already hold (`ShopifyOrder`, `ShopifyCustomer`).
 * The reads map GraphQL back into that shape, so one fixture per record serves
 * whichever API a code path reads it through.
 */

/** A GraphQL Admin API response carrying `data`. */
export function graphqlResponse(data: unknown, init?: ResponseInit): Response {
  return jsonResponse({ data }, init);
}

/** The operation name and variables of a stubbed GraphQL request, or null for any other request. */
export function graphqlRequest(init: RequestInit | undefined): { operation: string; variables: Record<string, unknown> } | null {
  if (typeof init?.body !== "string") return null;
  let body: { query?: unknown; variables?: Record<string, unknown> };
  try {
    body = JSON.parse(init.body) as typeof body;
  } catch {
    return null;
  }
  const operation = typeof body.query === "string"
    ? body.query.match(/^\s*(?:query|mutation)\s+(\w+)/)?.[1]
    : undefined;
  return operation ? { operation, variables: body.variables ?? {} } : null;
}

export interface ShopifyReadFixtures {
  orders?: ShopifyOrder[];
  customers?: ShopifyCustomer[];
}

/**
 * The answer to one of the package's order or customer reads, or null when the
 * request is anything else (a write, another document), which the caller's own
 * routing decides. Lists return every fixture: the reads confirm an exact
 * name, email or customer themselves, and a fake does not reimplement search.
 */
export function answerShopifyGraphqlRead(init: RequestInit | undefined, fixtures: ShopifyReadFixtures): Response | null {
  const request = graphqlRequest(init);
  if (!request) return null;
  const orders = fixtures.orders ?? [];
  const customers = fixtures.customers ?? [];
  const lastPage = { hasNextPage: false, endCursor: null };
  switch (request.operation) {
    case "ShopkeeperOrder": {
      const id = legacyIdFromGid(String(request.variables.id));
      const order = orders.find((candidate) => String(candidate.id) === id);
      return graphqlResponse({ order: order ? shopifyOrderNode(order) : null });
    }
    case "ShopkeeperOrders":
      return graphqlResponse({ orders: { nodes: orders.map(shopifyOrderNode), pageInfo: lastPage } });
    case "ShopkeeperOrderIdentity": {
      const id = legacyIdFromGid(String(request.variables.id));
      const order = orders.find((candidate) => String(candidate.id) === id);
      return graphqlResponse({ order: order ? orderIdentityNode(order) : null });
    }
    case "ShopkeeperOrderIdentities":
      return graphqlResponse({ orders: { nodes: orders.map(orderIdentityNode) } });
    case "ShopkeeperCustomer": {
      const id = legacyIdFromGid(String(request.variables.id));
      const customer = customers.find((candidate) => String(candidate.id) === id);
      return graphqlResponse({ customer: customer ? shopifyCustomerNode(customer) : null });
    }
    case "ShopkeeperCustomers":
    case "ShopkeeperCustomerIdentities":
      return graphqlResponse({ customers: { nodes: customers.map(shopifyCustomerNode), pageInfo: lastPage } });
    default:
      return null;
  }
}

function orderIdentityNode(order: ShopifyOrder) {
  return {
    legacyResourceId: String(order.id),
    name: order.name ?? `#${order.id}`,
    email: order.email ?? null,
    shippingAddress: order.shipping_address ? { zip: order.shipping_address.zip ?? null } : null,
    customer: order.customer ? { legacyResourceId: String(order.customer.id) } : null,
  };
}

const FIXTURE_TIME = "2026-01-01T00:00:00Z";

const DISPLAY_FULFILLMENT_STATUS: Record<string, string> = {
  fulfilled: "FULFILLED",
  partial: "PARTIALLY_FULFILLED",
  restocked: "RESTOCKED",
};

function addressNode(address: ShopifyCustomerAddress) {
  return {
    firstName: address.first_name ?? null,
    lastName: address.last_name ?? null,
    address1: address.address1 ?? null,
    address2: address.address2 ?? null,
    city: address.city ?? null,
    province: address.province ?? null,
    provinceCode: address.province_code ?? null,
    zip: address.zip ?? null,
    country: address.country ?? address.country_name ?? null,
    countryCodeV2: address.country_code ?? null,
  };
}

function lineItemNode(line: ShopifyOrderLineItem, orderFulfilled: boolean) {
  const current = line.current_quantity ?? line.quantity;
  const shipped = line.fulfillment_status === "fulfilled" || orderFulfilled;
  return {
    id: `gid://shopify/LineItem/${line.id ?? 0}`,
    title: line.title,
    variantTitle: line.variant_title ?? null,
    quantity: line.quantity,
    currentQuantity: current,
    unfulfilledQuantity: line.fulfillable_quantity ?? (shipped ? 0 : current),
    sku: line.sku ?? null,
    variant: line.variant_id != null ? { legacyResourceId: String(line.variant_id) } : null,
    image: line.image_url ? { url: line.image_url } : null,
  };
}

function fulfillmentNode(fulfillment: ShopifyFulfillment, orderCreatedAt: string) {
  const numbers = fulfillment.tracking_numbers?.length
    ? fulfillment.tracking_numbers
    : fulfillment.tracking_number ? [fulfillment.tracking_number] : [];
  const urls = fulfillment.tracking_urls?.length
    ? fulfillment.tracking_urls
    : fulfillment.tracking_url ? [fulfillment.tracking_url] : [];
  const entries = Math.max(numbers.length, urls.length, fulfillment.tracking_company ? 1 : 0);
  const createdAt = fulfillment.created_at ?? orderCreatedAt;
  return {
    status: fulfillment.status.toUpperCase(),
    displayStatus: fulfillment.shipment_status?.toUpperCase() ?? null,
    createdAt,
    updatedAt: fulfillment.updated_at ?? createdAt,
    trackingInfo: Array.from({ length: entries }, (_, index) => ({
      number: numbers[index] ?? null,
      company: fulfillment.tracking_company ?? null,
      url: urls[index] ?? null,
    })),
  };
}

/** The GraphQL `Order` node the order reads select, from a REST-shaped order. */
export function shopifyOrderNode(order: ShopifyOrder) {
  const currency = order.currency ?? "USD";
  const presentment = order.presentment_currency ?? currency;
  const total = order.total_price ?? order.current_total_price ?? "0.00";
  const current = order.current_total_price ?? total;
  const priceSet = (amount: string, set: ShopifyOrder["total_price_set"]) => ({
    shopMoney: { amount: set?.shop_money?.amount ?? amount, currencyCode: set?.shop_money?.currency_code ?? currency },
    presentmentMoney: {
      amount: set?.presentment_money?.amount ?? amount,
      currencyCode: set?.presentment_money?.currency_code ?? presentment,
    },
  });
  const createdAt = order.created_at ?? FIXTURE_TIME;
  const tags = Array.isArray(order.tags) ? order.tags : order.tags ? order.tags.split(",").map((tag) => tag.trim()) : [];
  return {
    legacyResourceId: String(order.id),
    name: order.name ?? `#${order.id}`,
    createdAt,
    cancelledAt: order.cancelled_at ?? null,
    cancelReason: order.cancel_reason?.toUpperCase() ?? null,
    closedAt: order.closed_at ?? null,
    displayFinancialStatus: order.financial_status?.toUpperCase() ?? null,
    displayFulfillmentStatus: DISPLAY_FULFILLMENT_STATUS[order.fulfillment_status ?? ""] ?? "UNFULFILLED",
    tags,
    email: order.email ?? null,
    currencyCode: currency,
    presentmentCurrencyCode: presentment,
    totalPriceSet: priceSet(total, order.total_price_set),
    currentTotalPriceSet: priceSet(current, order.current_total_price_set),
    customer: order.customer
      ? {
          legacyResourceId: String(order.customer.id),
          firstName: order.customer.first_name ?? null,
          lastName: order.customer.last_name ?? null,
          defaultEmailAddress: order.customer.email ? { emailAddress: order.customer.email } : null,
          numberOfOrders: String(order.customer.orders_count ?? 1),
          createdAt: order.customer.created_at ?? FIXTURE_TIME,
        }
      : null,
    billingAddress: order.billing_address
      ? {
          city: order.billing_address.city ?? null,
          province: order.billing_address.province ?? null,
          country: order.billing_address.country ?? null,
        }
      : null,
    shippingAddress: order.shipping_address ? addressNode(order.shipping_address) : null,
    lineItems: {
      nodes: (order.line_items ?? []).map((line) => lineItemNode(line, order.fulfillment_status === "fulfilled")),
    },
    refunds: (order.refunds ?? []).map((refund, index) => ({ id: `gid://shopify/Refund/${refund.id ?? index + 1}` })),
    fulfillments: (order.fulfillments ?? []).map((fulfillment) => fulfillmentNode(fulfillment, createdAt)),
  };
}

/** The GraphQL `Customer` node the customer reads select, from a REST-shaped customer. */
export function shopifyCustomerNode(customer: ShopifyCustomer) {
  return {
    legacyResourceId: String(customer.id),
    firstName: customer.first_name ?? null,
    lastName: customer.last_name ?? null,
    defaultEmailAddress: customer.email ? { emailAddress: customer.email } : null,
    defaultPhoneNumber: customer.phone ? { phoneNumber: customer.phone } : null,
    numberOfOrders: String(customer.orders_count ?? 0),
    amountSpent: { amount: customer.total_spent ?? "0.00", currencyCode: customer.currency ?? "USD" },
    note: customer.note ?? null,
    createdAt: customer.created_at ?? FIXTURE_TIME,
    defaultAddress: customer.default_address ? addressNode(customer.default_address) : null,
  };
}
