import type { CreateShopifyOrderInput, CreateShopifyOrderLineItem } from "../tools/index.js";
import { toolError, toolOk, toolUnknown, type ToolResult } from "../tools/result.js";
import {
  formatShopifyToolError,
  isAmbiguousShopifyMutationError,
  shopifyGraphql,
  shopifyIdempotencyKey,
  shopifyRestJson,
  type ShopifyContext,
} from "./client.js";
import { buildOrderAddress } from "./order-address.js";
import type { ShopifyOrder } from "./types.js";
import {
  optionalPositiveInteger,
  optionalString,
  requireAmount,
  requireEmail,
  requireNonEmptyString,
  requireNumericId,
  ShopifyInputError,
} from "./validation.js";

export interface CreateShopifyOrderOptions {
  allowCustomLineItems?: boolean;
}

interface CreatedOrderLookupData {
  orders?: {
    nodes?: Array<{
      id: string;
      legacyResourceId?: string | null;
      name?: string | null;
      email?: string | null;
      tags?: string[] | null;
      totalPriceSet?: {
        shopMoney?: { amount?: string | null } | null;
      } | null;
    }>;
  } | null;
}

const OPERATION_TAG_PREFIX = "shopkeeper-op-";

function orderOperationTag(operationId?: string): string {
  return `${OPERATION_TAG_PREFIX}${shopifyIdempotencyKey(operationId)}`;
}

function createdOrderResult(
  order: {
    id: string | number;
    name?: string | null;
    email?: string | null;
    total?: string | null;
  },
  ctx: ShopifyContext,
  fallbackEmail: string,
  reconciled = false,
): ToolResult {
  const orderId = String(order.id).replace(/^gid:\/\/shopify\/Order\//, "");
  const orderName = order.name ?? `#${orderId}`;
  const total = order.total ? `$${order.total}` : "unknown total";
  const adminUrl = `https://${ctx.shop}/admin/orders/${orderId}`;
  const confirmation = reconciled ? " (confirmed after an interrupted provider response)" : "";
  return toolOk(
    `Done — order ${orderName} is in for ${order.email ?? fallbackEmail}, total ${total}${confirmation}.\n\n`
    + `[View in Shopify](${adminUrl})`,
  );
}

async function findCreatedOrder(
  ctx: ShopifyContext,
  operationTag: string,
): Promise<CreatedOrderLookupData["orders"]> {
  const data = await shopifyGraphql<CreatedOrderLookupData>(ctx, `
    query FindShopkeeperCreatedOrder($query: String!) {
      orders(first: 2, query: $query, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id
          legacyResourceId
          name
          email
          tags
          totalPriceSet { shopMoney { amount } }
        }
      }
    }
  `, { query: `tag:${operationTag}` }, { maxRetries: 1 });
  return data.orders ?? null;
}

async function reconcileCreatedOrder(
  ctx: ShopifyContext,
  operationTag: string,
  email: string,
  mutationError?: unknown,
): Promise<ToolResult> {
  try {
    const lookup = await findCreatedOrder(ctx, operationTag);
    const matches = (lookup?.nodes ?? []).filter((order) => order.tags?.includes(operationTag));
    if (matches.length === 1) {
      const order = matches[0]!;
      return createdOrderResult({
        id: order.legacyResourceId ?? order.id,
        name: order.name,
        email: order.email,
        total: order.totalPriceSet?.shopMoney?.amount,
      }, ctx, email, true);
    }
    if (matches.length > 1) {
      return toolUnknown(
        `Unknown: Shopify returned multiple orders for operation ${operationTag}. Do not create another order or confirm one to the customer until they are reviewed.`,
      );
    }
    const detail = mutationError
      ? ` ${formatShopifyToolError("order creation reconciliation failed", mutationError)}`
      : "";
    return toolUnknown(
      `Unknown: the order creation request may have committed at Shopify, but a follow-up lookup did not confirm it. Do not retry or confirm it to the customer until it is reconciled.${detail}`,
    );
  } catch (reconciliationError) {
    return toolUnknown(
      `Unknown: the order creation request may have committed at Shopify and the follow-up lookup failed. Do not retry or confirm it to the customer until it is reconciled. ${formatShopifyToolError("order creation reconciliation failed", reconciliationError)}`,
    );
  }
}

function buildLineItems(
  lineItems: CreateShopifyOrderLineItem[],
  options: CreateShopifyOrderOptions
) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    throw new ShopifyInputError("line_items must include at least one item.");
  }

  return lineItems.map((item, index) => {
    const quantity = optionalPositiveInteger(item.quantity, `line_items[${index}].quantity`, 1);
    const variantId = optionalString(item.variant_id);

    if (variantId) {
      return { variant_id: Number(requireNumericId(variantId, `line_items[${index}].variant_id`)), quantity };
    }

    if (!options.allowCustomLineItems) {
      throw new ShopifyInputError("Custom line items are disabled. Each line item must include a variant_id.");
    }

    return {
      title: requireNonEmptyString(item.title, `line_items[${index}].title`),
      price: requireAmount(item.price, `line_items[${index}].price`),
      quantity,
      requires_shipping: true,
    };
  });
}

export async function createShopifyOrder(
  input: CreateShopifyOrderInput,
  ctx: ShopifyContext,
  options: CreateShopifyOrderOptions = {}
): Promise<ToolResult> {
  let mutationStarted = false;
  let operationTag: string | null = null;
  let validatedEmail: string | null = null;
  try {
    const email = requireEmail(input.email, "email");
    validatedEmail = email;
    const shippingAddress = buildOrderAddress({
      first_name: input.first_name,
      last_name: input.last_name,
      address1: input.address1,
      address2: input.address2,
      city: input.city,
      province: input.province,
      zip: input.zip,
      country: input.country,
    });
    const lineItems = buildLineItems(input.line_items, options);
    const note = optionalString(input.note);
    const currentOperationTag = orderOperationTag(ctx.operationId);
    operationTag = currentOperationTag;

    const existing = await findCreatedOrder(ctx, currentOperationTag);
    const existingMatches = (existing?.nodes ?? []).filter((order) => order.tags?.includes(currentOperationTag));
    if (existingMatches.length === 1) {
      const order = existingMatches[0]!;
      return createdOrderResult({
        id: order.legacyResourceId ?? order.id,
        name: order.name,
        email: order.email,
        total: order.totalPriceSet?.shopMoney?.amount,
      }, ctx, email, true);
    }
    if (existingMatches.length > 1) {
      return toolUnknown(
        `Unknown: Shopify returned multiple orders for operation ${currentOperationTag}. Do not create another order or confirm one to the customer until they are reviewed.`,
      );
    }

    mutationStarted = true;
    const data = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, "orders.json", {
      method: "POST",
      body: {
        order: {
          email,
          financial_status: "pending",
          send_receipt: false,
          send_fulfillment_receipt: false,
          line_items: lineItems,
          shipping_address: shippingAddress,
          billing_address: shippingAddress,
          tags: currentOperationTag,
          ...(note ? { note } : {}),
        },
      },
    });

    if (!data.order) {
      return reconcileCreatedOrder(ctx, currentOperationTag, email);
    }

    return createdOrderResult({
      id: data.order.id,
      name: data.order.name,
      email,
      total: data.order.total_price,
    }, ctx, email);
  } catch (err) {
    if (mutationStarted && operationTag && isAmbiguousShopifyMutationError(err)) {
      return reconcileCreatedOrder(ctx, operationTag, validatedEmail ?? "the customer", err);
    }
    return toolError(formatShopifyToolError("failed to create order", err));
  }
}
