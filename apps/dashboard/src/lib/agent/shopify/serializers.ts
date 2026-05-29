import type {
  ShopifyCustomer,
  ShopifyCustomerAddress,
  ShopifyOrder,
  ShopifyOrderLineItem,
  ShopifyProduct,
} from "./types";

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

export function serializeOrder(order: ShopifyOrder) {
  return {
    id: String(order.id),
    name: order.name ?? null,
    created_at: order.created_at ?? null,
    financial_status: order.financial_status ?? null,
    fulfillment_status: order.fulfillment_status ?? null,
    total_price: order.current_total_price ?? order.total_price ?? null,
    currency: order.currency ?? null,
    items: (order.line_items ?? []).map(serializeOrderLineItem),
    shipping_address: serializeAddress(order.shipping_address),
  };
}

export function formatAddressForMessage(addr: ShopifyCustomerAddress): string {
  return [addr.address1, addr.address2, addr.city, addr.province, addr.zip, addr.country_name ?? addr.country]
    .filter(Boolean)
    .join(", ");
}
