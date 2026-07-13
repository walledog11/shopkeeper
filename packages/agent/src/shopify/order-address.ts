import type { UpdateShopifyOrderAddressInput } from "../tools/index.js";
import { toolError, toolOk, toolUnknown, type ToolResult } from "../tools/result.js";
import {
  formatShopifyToolError,
  isAmbiguousShopifyMutationError,
  shopifyRestJson,
  type ShopifyContext,
} from "./client.js";
import { formatAddressForMessage } from "./serializers.js";
import type { ShopifyCustomer, ShopifyCustomerAddress, ShopifyOrder } from "./types.js";
import { optionalString, requireNonEmptyString, requireNumericId } from "./validation.js";

interface OrderAddressInput {
  first_name?: unknown;
  last_name?: unknown;
  address1: unknown;
  address2?: unknown;
  city: unknown;
  province: unknown;
  zip: unknown;
  country: unknown;
}

export function buildOrderAddress(input: OrderAddressInput): Record<string, string> {
  const address2 = optionalString(input.address2);

  return {
    ...(input.first_name !== undefined ? { first_name: requireNonEmptyString(input.first_name, "first_name") } : {}),
    ...(input.last_name !== undefined ? { last_name: requireNonEmptyString(input.last_name, "last_name") } : {}),
    address1: requireNonEmptyString(input.address1, "address1"),
    ...(address2 ? { address2 } : {}),
    city: requireNonEmptyString(input.city, "city"),
    province: requireNonEmptyString(input.province, "province"),
    zip: requireNonEmptyString(input.zip, "zip"),
    country: requireNonEmptyString(input.country, "country"),
  };
}

function normalizeAddressPart(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

function locationPartMatches(expected: string, ...actualValues: unknown[]): boolean {
  const normalizedExpected = normalizeAddressPart(expected);
  return actualValues.some((value) => normalizeAddressPart(value) === normalizedExpected);
}

function addressMatches(
  actual: ShopifyCustomerAddress | null | undefined,
  expected: Record<string, string>,
): boolean {
  if (!actual) return false;

  const directFields = ["address1", "city", "zip"] as const;
  if (directFields.some((field) => normalizeAddressPart(actual[field]) !== normalizeAddressPart(expected[field]))) {
    return false;
  }

  for (const field of ["first_name", "last_name", "address2"] as const) {
    if (field in expected && normalizeAddressPart(actual[field]) !== normalizeAddressPart(expected[field])) {
      return false;
    }
  }

  return locationPartMatches(expected.province, actual.province, actual.province_code)
    && locationPartMatches(expected.country, actual.country, actual.country_code, actual.country_name);
}

async function readOrder(
  ctx: ShopifyContext,
  orderId: string,
): Promise<ShopifyOrder | null> {
  const data = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}.json`, {
    query: {
      fields: "id,name,order_number,fulfillment_status,shipping_address,customer",
    },
  });
  return data.order ?? null;
}

async function readCustomerDefaultAddress(
  ctx: ShopifyContext,
  customerId: string,
): Promise<ShopifyCustomerAddress | null> {
  const data = await shopifyRestJson<{ customer?: Pick<ShopifyCustomer, "default_address"> }>(
    ctx,
    `customers/${customerId}.json`,
    { query: { fields: "id,default_address" } },
  );
  return data.customer?.default_address ?? null;
}

function orderAddressUpdatedMessage(order: ShopifyOrder, orderId: string): string {
  const label = String(order.order_number ?? order.name ?? orderId);
  return `Order ${label.startsWith("#") ? label : `#${label}`} shipping address updated to: ${formatAddressForMessage(order.shipping_address!)}.`;
}

async function reconcileOrderAddress(
  ctx: ShopifyContext,
  orderId: string,
  addressPayload: Record<string, string>,
  mutationError?: unknown,
): Promise<{ order: ShopifyOrder; reconciled: true } | { result: ToolResult }> {
  try {
    const order = await readOrder(ctx, orderId);
    if (order && addressMatches(order.shipping_address, addressPayload)) {
      return { order, reconciled: true };
    }
    const detail = mutationError
      ? ` ${formatShopifyToolError("order address reconciliation failed", mutationError)}`
      : "";
    return {
      result: toolUnknown(
        `Unknown: the shipping-address update for order ${orderId} may have committed at Shopify, but a follow-up read did not confirm the requested address. Do not retry or confirm it to the customer until it is reconciled.${detail}`,
      ),
    };
  } catch (reconciliationError) {
    return {
      result: toolUnknown(
        `Unknown: the shipping-address update for order ${orderId} may have committed at Shopify and the follow-up read failed. Do not retry or confirm it to the customer until it is reconciled. ${formatShopifyToolError("order address reconciliation failed", reconciliationError)}`,
      ),
    };
  }
}

async function updateOrderAddress(
  ctx: ShopifyContext,
  orderId: string,
  addressPayload: Record<string, string>,
): Promise<{ order: ShopifyOrder; changed: boolean; reconciled: boolean } | { result: ToolResult }> {
  try {
    const data = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}.json`, {
      method: "PUT",
      body: { order: { id: orderId, shipping_address: addressPayload } },
    });
    if (data.order && addressMatches(data.order.shipping_address, addressPayload)) {
      return { order: data.order, changed: true, reconciled: false };
    }
    const reconciled = await reconcileOrderAddress(ctx, orderId, addressPayload);
    return "result" in reconciled
      ? reconciled
      : { order: reconciled.order, changed: true, reconciled: true };
  } catch (err) {
    if (isAmbiguousShopifyMutationError(err)) {
      const reconciled = await reconcileOrderAddress(ctx, orderId, addressPayload, err);
      return "result" in reconciled
        ? reconciled
        : { order: reconciled.order, changed: true, reconciled: true };
    }
    return { result: toolError(formatShopifyToolError("failed to update order shipping address", err)) };
  }
}

async function reconcileCustomerAddress(
  ctx: ShopifyContext,
  customerId: string,
  addressPayload: Record<string, string>,
  mutationError?: unknown,
): Promise<{ ok: true; reconciled: true } | { result: ToolResult }> {
  try {
    const address = await readCustomerDefaultAddress(ctx, customerId);
    if (addressMatches(address, addressPayload)) {
      return { ok: true, reconciled: true };
    }
    const detail = mutationError
      ? ` ${formatShopifyToolError("customer address reconciliation failed", mutationError)}`
      : "";
    return {
      result: toolUnknown(
        `Unknown: the order address was updated, but the customer-profile address update may also have committed and could not be confirmed. Do not retry or confirm the full change until it is reconciled.${detail}`,
      ),
    };
  } catch (reconciliationError) {
    return {
      result: toolUnknown(
        `Unknown: the order address was updated, but the customer-profile address update may also have committed and its follow-up read failed. Do not retry or confirm the full change until it is reconciled. ${formatShopifyToolError("customer address reconciliation failed", reconciliationError)}`,
      ),
    };
  }
}

async function syncCustomerDefaultAddress(
  ctx: ShopifyContext,
  customerId: string,
  currentAddress: ShopifyCustomerAddress | null,
  addressPayload: Record<string, string>,
): Promise<{ message: string } | { result: ToolResult }> {
  if (currentAddress?.id === undefined || currentAddress.id === null) {
    return { message: "Customer profile was not updated because no default address exists." };
  }
  if (addressMatches(currentAddress, addressPayload)) {
    return { message: "Customer profile already matched." };
  }

  try {
    const data = await shopifyRestJson<{ customer_address?: ShopifyCustomerAddress }>(
      ctx,
      `customers/${customerId}/addresses/${currentAddress.id}.json`,
      {
        method: "PUT",
        body: { address: addressPayload },
      },
    );
    if (addressMatches(data.customer_address, addressPayload)) {
      return { message: "Customer profile also updated." };
    }
    const reconciled = await reconcileCustomerAddress(ctx, customerId, addressPayload);
    return "result" in reconciled
      ? reconciled
      : { message: "Customer profile also updated (confirmed after an interrupted provider response)." };
  } catch (err) {
    if (isAmbiguousShopifyMutationError(err)) {
      const reconciled = await reconcileCustomerAddress(ctx, customerId, addressPayload, err);
      return "result" in reconciled
        ? reconciled
        : { message: "Customer profile also updated (confirmed after an interrupted provider response)." };
    }
    return {
      result: toolUnknown(
        `Partial: the order shipping address was updated, but the customer profile was not. Do not confirm the full change or retry it until the partial result is reviewed. ${formatShopifyToolError("customer profile sync failed", err)}`,
      ),
    };
  }
}

export async function updateShopifyOrderAddress(
  input: UpdateShopifyOrderAddressInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  try {
    const orderId = requireNumericId(input.order_id, "order_id");
    const customerId = requireNumericId(input.customer_id, "customer_id");
    const addressPayload = buildOrderAddress(input);

    const beforeOrder = await readOrder(ctx, orderId);
    if (!beforeOrder) {
      return toolError(`Error: failed to update order shipping address - order ${orderId} was not returned by Shopify.`);
    }
    if (beforeOrder.fulfillment_status && beforeOrder.fulfillment_status !== "unfulfilled") {
      return toolError(`Error: failed to update order shipping address - order ${beforeOrder.name ?? orderId} is already fulfilled or partially fulfilled.`);
    }
    if (!beforeOrder.customer?.id || String(beforeOrder.customer.id) !== customerId) {
      return toolError(`Error: failed to update order shipping address - customer ${customerId} does not own order ${beforeOrder.name ?? orderId}.`);
    }

    const beforeCustomerAddress = await readCustomerDefaultAddress(ctx, customerId);
    const orderUpdate = addressMatches(beforeOrder.shipping_address, addressPayload)
      ? { order: beforeOrder, changed: false, reconciled: false }
      : await updateOrderAddress(ctx, orderId, addressPayload);
    if ("result" in orderUpdate) return orderUpdate.result;

    const customerSync = await syncCustomerDefaultAddress(
      ctx,
      customerId,
      beforeCustomerAddress,
      addressPayload,
    );
    if ("result" in customerSync) return customerSync.result;

    const orderLabel = String(orderUpdate.order.order_number ?? orderUpdate.order.name ?? orderId);
    const orderMessage = orderUpdate.changed
      ? orderAddressUpdatedMessage(orderUpdate.order, orderId)
      : `Order ${orderLabel.startsWith("#") ? orderLabel : `#${orderLabel}`} shipping address already matched the requested address.`;
    const reconciliation = orderUpdate.reconciled
      ? " Confirmed after an interrupted provider response."
      : "";
    return toolOk(`${orderMessage}${reconciliation} ${customerSync.message}`);
  } catch (err) {
    return toolError(formatShopifyToolError("failed to update order shipping address", err));
  }
}
