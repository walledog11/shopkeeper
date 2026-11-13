import { currencyAmount } from "../money.js";
import {
  parseNextPageInfo,
  shopifyGraphql,
  ShopifyRequestError,
  shopifySearchValue,
  type ShopifyContext,
} from "./client.js";
import { handleShopifySimulatorRest, isShopifySimulatorContext } from "./simulator-store.js";
import type {
  ShopifyCustomerAddress,
  ShopifyFulfillment,
  ShopifyOrder,
  ShopifyOrderLineItem,
} from "./types.js";
import { legacyIdFromGid } from "./validation.js";

/**
 * Order reads over the GraphQL Admin API. Shopify accepts only GraphQL from new
 * public apps, so these replace REST `orders.json` and `orders/{id}.json`.
 * Orders come back in the REST shape the package already speaks
 * (`ShopifyOrder`), so a serialized order the model reads is unchanged: numeric
 * ids, REST status words, amounts with the currency's decimal places.
 */

const MONEY_SET = "shopMoney { amount currencyCode } presentmentMoney { amount currencyCode }";

const ORDER_FIELDS = `
    legacyResourceId
    name
    createdAt
    cancelledAt
    cancelReason
    closedAt
    displayFinancialStatus
    displayFulfillmentStatus
    tags
    email
    currencyCode
    presentmentCurrencyCode
    totalPriceSet { ${MONEY_SET} }
    currentTotalPriceSet { ${MONEY_SET} }
    customer { legacyResourceId firstName lastName defaultEmailAddress { emailAddress } numberOfOrders createdAt }
    billingAddress { city province country }
    shippingAddress { firstName lastName address1 address2 city province provinceCode zip country countryCodeV2 }
    lineItems(first: $lineItems) {
      nodes {
        id
        title
        variantTitle
        quantity
        currentQuantity
        unfulfilledQuantity
        sku
        variant { legacyResourceId }
        image { url }
      }
    }
    refunds(first: 10) { id }
    fulfillments(first: 10) {
      status
      displayStatus
      createdAt
      updatedAt
      trackingInfo(first: 5) { number company url }
    }`;

export const ORDER_QUERY = `query ShopkeeperOrder($id: ID!, $lineItems: Int!) {
  order(id: $id) {${ORDER_FIELDS}
  }
}`;

export const ORDERS_QUERY = `query ShopkeeperOrders($query: String!, $first: Int!, $after: String, $lineItems: Int!) {
  orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
    nodes {${ORDER_FIELDS}
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

interface MoneyNode {
  amount: string;
  currencyCode: string;
}

interface MoneySetNode {
  shopMoney: MoneyNode;
  presentmentMoney: MoneyNode;
}

interface AddressNode {
  firstName: string | null;
  lastName: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  provinceCode: string | null;
  zip: string | null;
  country: string | null;
  countryCodeV2: string | null;
}

interface LineItemNode {
  id: string;
  title: string;
  variantTitle: string | null;
  quantity: number;
  currentQuantity: number;
  unfulfilledQuantity: number;
  sku: string | null;
  variant: { legacyResourceId: string } | null;
  image: { url: string } | null;
}

interface FulfillmentNode {
  status: string;
  displayStatus: string | null;
  createdAt: string;
  updatedAt: string;
  trackingInfo: { number: string | null; company: string | null; url: string | null }[];
}

interface OrderNode {
  legacyResourceId: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  closedAt: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string;
  tags: string[];
  email: string | null;
  currencyCode: string;
  presentmentCurrencyCode: string;
  totalPriceSet: MoneySetNode;
  currentTotalPriceSet: MoneySetNode;
  customer: {
    legacyResourceId: string;
    firstName: string | null;
    lastName: string | null;
    defaultEmailAddress: { emailAddress: string } | null;
    numberOfOrders: string;
    createdAt: string;
  } | null;
  billingAddress: { city: string | null; province: string | null; country: string | null } | null;
  shippingAddress: AddressNode | null;
  lineItems: { nodes: LineItemNode[] };
  refunds: { id: string }[];
  fulfillments: FulfillmentNode[];
}

// REST's order fulfillment_status: null until something ships. GraphQL's
// display statuses that describe fulfillment work in progress (OPEN, ON_HOLD,
// SCHEDULED…) were all null there too.
const ORDER_FULFILLMENT_STATUS: Record<string, string> = {
  FULFILLED: "fulfilled",
  PARTIALLY_FULFILLED: "partial",
  RESTOCKED: "restocked",
};

// REST's fulfillment shipment_status: the carrier's last event. Display
// statuses that describe the fulfillment itself rather than the parcel
// (FULFILLED, MARKED_AS_FULFILLED, SUBMITTED, CANCELED, LABEL_VOIDED) had none.
const SHIPMENT_STATUSES = new Set([
  "ATTEMPTED_DELIVERY",
  "CARRIER_PICKED_UP",
  "CONFIRMED",
  "DELAYED",
  "DELIVERED",
  "FAILURE",
  "IN_TRANSIT",
  "LABEL_PRINTED",
  "LABEL_PURCHASED",
  "NOT_DELIVERED",
  "OUT_FOR_DELIVERY",
  "PICKED_UP",
  "READY_FOR_PICKUP",
]);

function moneySet(set: MoneySetNode) {
  return {
    shop_money: {
      amount: currencyAmount(set.shopMoney.amount, set.shopMoney.currencyCode),
      currency_code: set.shopMoney.currencyCode,
    },
    presentment_money: {
      amount: currencyAmount(set.presentmentMoney.amount, set.presentmentMoney.currencyCode),
      currency_code: set.presentmentMoney.currencyCode,
    },
  };
}

function addressFromNode(node: AddressNode): ShopifyCustomerAddress {
  return {
    first_name: node.firstName,
    last_name: node.lastName,
    address1: node.address1,
    address2: node.address2,
    city: node.city,
    province: node.province,
    province_code: node.provinceCode,
    zip: node.zip,
    country: node.country,
    country_code: node.countryCodeV2,
    country_name: node.country,
  };
}

function lineItemFromNode(node: LineItemNode): ShopifyOrderLineItem {
  const current = node.currentQuantity;
  const unfulfilled = Math.min(node.unfulfilledQuantity, current);
  return {
    id: legacyIdFromGid(node.id),
    variant_id: node.variant ? Number(node.variant.legacyResourceId) : null,
    title: node.title,
    variant_title: node.variantTitle,
    quantity: node.quantity,
    fulfillable_quantity: unfulfilled,
    current_quantity: current,
    fulfillment_status: current > 0 && unfulfilled === 0 ? "fulfilled" : unfulfilled < current ? "partial" : null,
    sku: node.sku,
    image_url: node.image?.url ?? null,
  };
}

function fulfillmentFromNode(node: FulfillmentNode): ShopifyFulfillment {
  const numbers = node.trackingInfo.map((info) => info.number).filter((value): value is string => Boolean(value));
  const urls = node.trackingInfo.map((info) => info.url).filter((value): value is string => Boolean(value));
  return {
    status: node.status.toLowerCase(),
    shipment_status: node.displayStatus && SHIPMENT_STATUSES.has(node.displayStatus)
      ? node.displayStatus.toLowerCase()
      : null,
    created_at: node.createdAt,
    updated_at: node.updatedAt,
    tracking_number: numbers[0] ?? null,
    tracking_numbers: numbers,
    tracking_company: node.trackingInfo[0]?.company ?? null,
    tracking_url: urls[0] ?? null,
    tracking_urls: urls,
  };
}

function orderFromNode(node: OrderNode): ShopifyOrder {
  return {
    id: Number(node.legacyResourceId),
    name: node.name,
    created_at: node.createdAt,
    cancelled_at: node.cancelledAt,
    cancel_reason: node.cancelReason?.toLowerCase() ?? null,
    closed_at: node.closedAt,
    financial_status: node.displayFinancialStatus?.toLowerCase() ?? null,
    fulfillment_status: ORDER_FULFILLMENT_STATUS[node.displayFulfillmentStatus] ?? null,
    tags: node.tags.join(", "),
    email: node.email,
    total_price: currencyAmount(node.totalPriceSet.shopMoney.amount, node.currencyCode),
    current_total_price: currencyAmount(node.currentTotalPriceSet.shopMoney.amount, node.currencyCode),
    currency: node.currencyCode,
    presentment_currency: node.presentmentCurrencyCode,
    total_price_set: moneySet(node.totalPriceSet),
    current_total_price_set: moneySet(node.currentTotalPriceSet),
    customer: node.customer
      ? {
          id: Number(node.customer.legacyResourceId),
          first_name: node.customer.firstName,
          last_name: node.customer.lastName,
          email: node.customer.defaultEmailAddress?.emailAddress ?? null,
          orders_count: Number(node.customer.numberOfOrders),
          created_at: node.customer.createdAt,
        }
      : null,
    billing_address: node.billingAddress
      ? { city: node.billingAddress.city, province: node.billingAddress.province, country: node.billingAddress.country }
      : null,
    shipping_address: node.shippingAddress ? addressFromNode(node.shippingAddress) : null,
    line_items: node.lineItems.nodes.map(lineItemFromNode),
    refunds: node.refunds.map((refund) => ({ id: Number(legacyIdFromGid(refund.id)) })),
    fulfillments: node.fulfillments.map(fulfillmentFromNode),
  };
}

/** What to look orders up by. Every filter narrows; none returns recent orders. */
export interface OrderSearch {
  /** An order number, with or without the leading `#`. Matched exactly. */
  name?: string;
  /** The email on the order. Matched exactly, ignoring case. */
  email?: string;
  customerId?: string | number;
  /** Only orders still open (not archived or cancelled), as REST's default `status=open`. */
  open?: boolean;
  unfulfilled?: boolean;
  paid?: boolean;
  createdAtMin?: Date;
  createdAtMax?: Date;
}

export function orderName(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function orderSearchQuery(search: OrderSearch): string {
  const terms: string[] = [];
  if (search.name !== undefined) terms.push(`name:${shopifySearchValue(orderName(search.name))}`);
  if (search.email !== undefined) terms.push(`email:${shopifySearchValue(search.email.trim())}`);
  if (search.customerId !== undefined) {
    const id = String(search.customerId).trim();
    if (!/^\d+$/.test(id)) throw new ShopifyRequestError(`Invalid Shopify customer id "${id}".`);
    terms.push(`customer_id:${id}`);
  }
  if (search.open) terms.push("status:open");
  if (search.unfulfilled) terms.push("fulfillment_status:unfulfilled");
  if (search.paid) terms.push("financial_status:paid");
  if (search.createdAtMin) terms.push(`created_at:>=${shopifySearchValue(search.createdAtMin.toISOString())}`);
  if (search.createdAtMax) terms.push(`created_at:<=${shopifySearchValue(search.createdAtMax.toISOString())}`);
  return terms.join(" ");
}

// Search narrows; these confirm. A name or email filter must match the order
// it returns exactly, whatever Shopify's search tolerated on the way.
function matchesSearch(order: ShopifyOrder, search: OrderSearch): boolean {
  if (search.name !== undefined && order.name?.toLowerCase() !== orderName(search.name).toLowerCase()) return false;
  if (search.email !== undefined
    && (order.email ?? "").trim().toLowerCase() !== search.email.trim().toLowerCase()) return false;
  if (search.customerId !== undefined && String(order.customer?.id ?? "") !== String(search.customerId).trim()) {
    return false;
  }
  return true;
}

export interface OrderPage {
  orders: ShopifyOrder[];
  /** Pass back as `after` for the next page; null on the last one. */
  nextCursor: string | null;
}

interface OrderReadOptions {
  /** Line items per order. Lists ask for fewer to stay inside Shopify's query cost. */
  lineItems?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

const DEFAULT_LINE_ITEMS = 50;

export async function fetchShopifyOrder(
  ctx: ShopifyContext,
  orderId: string | number,
  options: OrderReadOptions = {},
): Promise<ShopifyOrder | null> {
  const id = String(orderId).trim();
  if (!/^\d+$/.test(id)) throw new ShopifyRequestError(`Invalid Shopify order id "${id}".`);
  if (isShopifySimulatorContext(ctx)) {
    return (await simulatorOrders(ctx, {}, 250, null)).orders.find((order) => String(order.id) === id) ?? null;
  }
  const data = await shopifyGraphql<{ order: OrderNode | null }>(
    ctx,
    ORDER_QUERY,
    { id: `gid://shopify/Order/${id}`, lineItems: options.lineItems ?? DEFAULT_LINE_ITEMS },
    { timeoutMs: options.timeoutMs, maxRetries: options.maxRetries },
  );
  return data.order ? orderFromNode(data.order) : null;
}

export async function findShopifyOrders(
  ctx: ShopifyContext,
  search: OrderSearch,
  options: OrderReadOptions & { first: number; after?: string | null },
): Promise<OrderPage> {
  if (isShopifySimulatorContext(ctx)) {
    return simulatorOrders(ctx, search, options.first, options.after ?? null);
  }
  const data = await shopifyGraphql<{
    orders: { nodes: OrderNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
  }>(
    ctx,
    ORDERS_QUERY,
    {
      query: orderSearchQuery(search),
      first: options.first,
      after: options.after ?? null,
      lineItems: options.lineItems ?? DEFAULT_LINE_ITEMS,
    },
    { timeoutMs: options.timeoutMs, maxRetries: options.maxRetries },
  );
  return {
    orders: data.orders.nodes.map(orderFromNode).filter((order) => matchesSearch(order, search)),
    nextCursor: data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null,
  };
}

// Whose an order is, and nothing about what is in it: the number, the email
// and shipping postcode it was placed with, and the customer it belongs to.
// Ownership checks and order confirmations run before the sender is known to
// own the order, so they read this rather than the order.
const ORDER_IDENTITY_FIELDS = "legacyResourceId name email shippingAddress { zip } customer { legacyResourceId }";

export const ORDER_IDENTITY_QUERY = `query ShopkeeperOrderIdentity($id: ID!) {
  order(id: $id) { ${ORDER_IDENTITY_FIELDS} }
}`;

export const ORDER_IDENTITIES_QUERY = `query ShopkeeperOrderIdentities($query: String!) {
  orders(first: 5, query: $query) { nodes { ${ORDER_IDENTITY_FIELDS} } }
}`;

export interface ShopifyOrderIdentity {
  /** The numeric order id. */
  id: string;
  name: string;
  email: string | null;
  shippingZip: string | null;
  /** The numeric id of the customer who placed it; null for a guest order. */
  customerId: string | null;
}

interface OrderIdentityNode {
  legacyResourceId: string;
  name: string;
  email: string | null;
  shippingAddress: { zip: string | null } | null;
  customer: { legacyResourceId: string } | null;
}

function identityFromNode(node: OrderIdentityNode): ShopifyOrderIdentity {
  return {
    id: node.legacyResourceId,
    name: node.name,
    email: node.email,
    shippingZip: node.shippingAddress?.zip ?? null,
    customerId: node.customer?.legacyResourceId ?? null,
  };
}

function identityFromOrder(order: ShopifyOrder): ShopifyOrderIdentity {
  return {
    id: String(order.id),
    name: order.name ?? "",
    email: order.email ?? null,
    shippingZip: order.shipping_address?.zip ?? null,
    customerId: order.customer ? String(order.customer.id) : null,
  };
}

export async function fetchShopifyOrderIdentity(
  ctx: ShopifyContext,
  orderId: string,
): Promise<ShopifyOrderIdentity | null> {
  const id = orderId.trim();
  if (!/^\d+$/.test(id)) throw new ShopifyRequestError(`Invalid Shopify order id "${id}".`);
  if (isShopifySimulatorContext(ctx)) {
    const order = await fetchShopifyOrder(ctx, id);
    return order ? identityFromOrder(order) : null;
  }
  const data = await shopifyGraphql<{ order: OrderIdentityNode | null }>(
    ctx,
    ORDER_IDENTITY_QUERY,
    { id: `gid://shopify/Order/${id}` },
  );
  return data.order ? identityFromNode(data.order) : null;
}

/** The order with exactly this number, among one customer's orders when one is named. */
export async function findShopifyOrderIdentity(
  ctx: ShopifyContext,
  search: { name: string; customerId?: string },
): Promise<ShopifyOrderIdentity | null> {
  if (isShopifySimulatorContext(ctx)) {
    const order = (await findShopifyOrders(ctx, search, { first: 5 })).orders[0];
    return order ? identityFromOrder(order) : null;
  }
  const data = await shopifyGraphql<{ orders: { nodes: OrderIdentityNode[] } }>(
    ctx,
    ORDER_IDENTITIES_QUERY,
    { query: orderSearchQuery(search) },
  );
  const wanted = orderName(search.name).toLowerCase();
  const match = data.orders.nodes.find((node) => (
    node.name.toLowerCase() === wanted
    && (search.customerId === undefined || node.customer?.legacyResourceId === search.customerId.trim())
  ));
  return match ? identityFromNode(match) : null;
}

// What became of an order: whether and why it was cancelled, whether anything
// shipped, its payment status, and each refund with the transactions that
// carried it. Cancellation and refund outcomes are confirmed from this, never
// from the request that asked for them.
export const ORDER_SETTLEMENT_QUERY = `query ShopkeeperOrderSettlement($id: ID!) {
  order(id: $id) {
    legacyResourceId
    name
    currencyCode
    cancelledAt
    cancelReason
    displayFinancialStatus
    displayFulfillmentStatus
    refunds(first: 20) {
      id
      transactions(first: 10) {
        nodes { kind status gateway amountSet { presentmentMoney { amount currencyCode } } }
      }
    }
  }
}`;

interface OrderSettlementNode {
  legacyResourceId: string;
  name: string;
  currencyCode: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string;
  refunds: {
    id: string;
    transactions: {
      nodes: {
        kind: string;
        status: string;
        gateway: string | null;
        amountSet: { presentmentMoney: MoneyNode };
      }[];
    };
  }[];
}

/**
 * The order's settlement in the REST shape: refunds carry their transactions,
 * each in the currency the customer was charged.
 */
export async function fetchShopifyOrderSettlement(
  ctx: ShopifyContext,
  orderId: string,
  options: { maxRetries?: number } = {},
): Promise<ShopifyOrder | null> {
  const id = orderId.trim();
  if (!/^\d+$/.test(id)) throw new ShopifyRequestError(`Invalid Shopify order id "${id}".`);
  const data = await shopifyGraphql<{ order: OrderSettlementNode | null }>(
    ctx,
    ORDER_SETTLEMENT_QUERY,
    { id: `gid://shopify/Order/${id}` },
    { maxRetries: options.maxRetries },
  );
  const node = data.order;
  if (!node) return null;
  return {
    id: Number(node.legacyResourceId),
    name: node.name,
    currency: node.currencyCode,
    cancelled_at: node.cancelledAt,
    cancel_reason: node.cancelReason?.toLowerCase() ?? null,
    financial_status: node.displayFinancialStatus?.toLowerCase() ?? null,
    fulfillment_status: ORDER_FULFILLMENT_STATUS[node.displayFulfillmentStatus] ?? null,
    refunds: node.refunds.map((refund) => ({
      id: Number(legacyIdFromGid(refund.id)),
      transactions: refund.transactions.nodes.map((transaction) => {
        const money = transaction.amountSet.presentmentMoney;
        return {
          kind: transaction.kind.toLowerCase(),
          status: transaction.status.toLowerCase(),
          gateway: transaction.gateway ?? "",
          amount: currencyAmount(money.amount, money.currencyCode),
          currency: money.currencyCode,
        };
      }),
    })),
  };
}

// The development simulator answers in memory with REST-shaped orders; it
// takes the same filters through its own query parameters.
async function simulatorOrders(
  ctx: ShopifyContext,
  search: OrderSearch,
  first: number,
  after: string | null,
): Promise<OrderPage> {
  const result = handleShopifySimulatorRest(ctx, "orders.json", {
    query: {
      limit: first,
      ...(after ? { page_info: after } : {}),
      ...(search.name !== undefined ? { name: orderName(search.name) } : {}),
      ...(search.email !== undefined ? { email: search.email } : {}),
      ...(search.customerId !== undefined ? { customer_id: String(search.customerId) } : {}),
      ...(search.unfulfilled ? { fulfillment_status: "unfulfilled" } : {}),
      ...(search.paid ? { financial_status: "paid" } : {}),
    },
  });
  if (!result?.ok) return { orders: [], nextCursor: null };
  const orders = ((result.data as { orders?: ShopifyOrder[] }).orders ?? [])
    .filter((order) => !search.createdAtMin || (order.created_at ?? "") >= search.createdAtMin.toISOString())
    .filter((order) => !search.createdAtMax || (order.created_at ?? "") <= search.createdAtMax.toISOString());
  return { orders, nextCursor: parseNextPageInfo(result.headers) };
}
