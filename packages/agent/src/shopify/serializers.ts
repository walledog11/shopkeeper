import type {
  ShopifyCustomer,
  ShopifyCustomerAddress,
  ShopifyOrder,
  ShopifyOrderLineItem,
  ShopifyProduct,
} from "./types.js";

export function customerName(customer: Pick<ShopifyCustomer, "first_name" | "last_name">): string {
  return [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
}

function serializeAddress(addr: ShopifyCustomerAddress | null | undefined) {
  if (!addr) return null;

  return {
    address1: addr.address1 ?? null,
    address2: addr.address2 ?? null,
    city: addr.city ?? null,
    province: addr.province ?? null,
    zip: addr.zip ?? null,
    country: addr.country_name ?? addr.country ?? null,
  };
}

export function serializeProduct(product: ShopifyProduct) {
  return {
    product_id: String(product.id),
    title: product.title,
    variants: (product.variants ?? []).map((variant) => ({
      variant_id: String(variant.id),
      title: variant.title,
      price: variant.price,
      inventory_quantity: variant.inventory_quantity ?? null,
    })),
  };
}

export function serializeCustomer(customer: ShopifyCustomer) {
  return {
    customer_id: String(customer.id),
    name: customerName(customer),
    email: customer.email ?? null,
    phone: customer.phone ?? null,
    orders_count: customer.orders_count ?? null,
    total_spent: customer.total_spent ?? null,
    note: customer.note ?? null,
    default_address: serializeAddress(customer.default_address),
  };
}

function serializeOrderLineItem(lineItem: ShopifyOrderLineItem) {
  return {
    line_item_id: lineItem.id !== undefined && lineItem.id !== null ? String(lineItem.id) : null,
    variant_id: lineItem.variant_id !== undefined && lineItem.variant_id !== null ? String(lineItem.variant_id) : null,
    title: lineItem.title,
    quantity: lineItem.quantity,
    fulfillable_quantity: lineItem.fulfillable_quantity ?? null,
    current_quantity: lineItem.current_quantity ?? null,
    fulfillment_status: lineItem.fulfillment_status ?? null,
  };
}

// The REST fields that make the settlement currency knowable. Any order fetch
// that quotes or moves money must request them: without them Shopify returns
// only `currency`, which is the shop's own, and every caller that reads it is
// silently working in the wrong currency on an international order.
export const ORDER_CURRENCY_FIELDS = "currency,presentment_currency,total_price_set,current_total_price_set";

/**
 * The currency this order settles in — what the customer was actually charged.
 *
 * `order.currency` is the shop's books and differs from it on every
 * international order, so nothing that quotes or refunds money may read that
 * field directly. This is the one owner of that question; a refund also has to
 * *tell* Shopify this currency, because the REST calculation defaults to the
 * shop's and will otherwise answer in it.
 */
export function orderSettlementCurrency(order: ShopifyOrder): string | null {
  const priceSet = order.current_total_price_set ?? order.total_price_set;
  const currency = priceSet?.presentment_money?.currency_code
    ?? order.presentment_currency
    ?? order.currency;
  return currency?.toUpperCase() ?? null;
}

// What the customer was actually charged, and only when that differs from the
// shop's own currency. A single-currency store serializes exactly as before.
function presentmentCharge(order: ShopifyOrder): { presentment_total_price: string; presentment_currency: string } | null {
  const priceSet = order.current_total_price_set ?? order.total_price_set;
  const presentment = priceSet?.presentment_money;
  const currency = orderSettlementCurrency(order);
  if (!currency || !presentment?.amount) return null;
  if (order.currency && currency === order.currency.toUpperCase()) return null;
  return { presentment_total_price: presentment.amount, presentment_currency: currency };
}

export function serializeOrder(order: ShopifyOrder) {
  return {
    id: String(order.id),
    name: order.name ?? null,
    created_at: order.created_at ?? null,
    financial_status: order.financial_status ?? null,
    fulfillment_status: order.fulfillment_status ?? null,
    total_price: order.current_total_price ?? order.total_price ?? null,
    currency: order.currency ?? null,
    // The customer paid this, not total_price above. Quote it to them, and refund it.
    ...(presentmentCharge(order) ?? {}),
    items: (order.line_items ?? []).map(serializeOrderLineItem),
    shipping_address: serializeAddress(order.shipping_address),
  };
}

export function formatAddressForMessage(addr: ShopifyCustomerAddress): string {
  return [addr.address1, addr.address2, addr.city, addr.province, addr.zip, addr.country_name ?? addr.country]
    .filter(Boolean)
    .join(", ");
}
