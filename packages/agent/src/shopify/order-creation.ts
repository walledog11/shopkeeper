import type { CreateShopifyOrderInput, CreateShopifyOrderLineItem } from "../tools/index.js";
import {
  toolError,
  toolOk,
  toolPolicyBlock,
  toolUnknown,
  type ReceiptV1,
  type ToolResult,
} from "../tools/result.js";
import { currencyAmount } from "../money.js";
import {
  formatShopifyToolError,
  formatUserErrors,
  isAmbiguousShopifyMutationError,
  shopifyGraphql,
  shopifyOperationTag,
  type ShopifyContext,
  type ShopifyGraphqlUserError,
} from "./client.js";
import { mailingAddressInput } from "./customer-writes.js";
import { buildOrderAddress } from "./order-address.js";
import { shopifyReceiptResults, shopifyFailureReceipt, shopifyReceiptEnvelope } from "./receipts.js";
import { fetchShopifyShop } from "./store-reads.js";
import {
  optionalPositiveInteger,
  optionalString,
  requireAmount,
  requireEmail,
  requireNonEmptyString,
  requireNumericId,
  ShopifyInputError,
} from "./validation.js";

const orderCreationReceipts = shopifyReceiptResults("create_shopify_order", "email");

export interface CreateShopifyOrderOptions {
  allowCustomLineItems?: boolean;
}

/** An order as the creation, its lookups and the probe read it. */
export interface CreatedOrderNode {
  id: string;
  legacyResourceId?: string | null;
  name?: string | null;
  email?: string | null;
  tags?: string[] | null;
  displayFinancialStatus?: string | null;
  totalPriceSet?: {
    shopMoney?: { amount?: string | null; currencyCode?: string | null } | null;
  } | null;
}

interface CreatedOrderLookupData {
  orders?: { nodes?: CreatedOrderNode[] } | null;
}

function orderCreationUnknown(
  ctx: ShopifyContext,
  target: { kind: "order" | "email"; id: string },
  code: string,
  message: string,
  providerReference: string | null = null,
): ToolResult {
  const result = toolUnknown(message);
  const receipt = shopifyFailureReceipt(
    ctx,
    target,
    "create_shopify_order",
    "unknown",
    code,
    providerReference,
  );
  return receipt ? { ...result, receipt } : result;
}

function createdOrderResult(
  order: CreatedOrderNode,
  ctx: ShopifyContext,
  fallbackEmail: string,
  operationTag: string,
  reconciled = false,
): ToolResult {
  const orderId = order.legacyResourceId ?? order.id.replace(/^gid:\/\/shopify\/Order\//, "");
  const orderName = order.name ?? `#${orderId}`;
  const money = order.totalPriceSet?.shopMoney;
  const currency = money?.currencyCode?.trim().toUpperCase();
  const totalAmount = money?.amount?.trim() ? currencyAmount(money.amount.trim(), currency) : undefined;
  const total = totalAmount ? `$${totalAmount}` : "unknown total";
  const adminUrl = `https://${ctx.shop}/admin/orders/${orderId}`;
  const confirmation = reconciled ? " (confirmed after an interrupted provider response)" : "";
  const financialStatus = order.displayFinancialStatus?.trim().toLowerCase();
  const payment = financialStatus ? `, payment ${financialStatus.replace(/_/g, " ")}` : "";
  const result = toolOk(
    `Done — order ${orderName} is in for ${order.email ?? fallbackEmail}, total ${total}${payment}${confirmation}.\n\n`
    + `[View in Shopify](${adminUrl})`,
  );
  const envelope = shopifyReceiptEnvelope(ctx, { kind: "order", id: orderId });
  if (!envelope) return result;

  if (
    !order.name?.trim()
    || !financialStatus
    || !totalAmount
    || !currency
    || !order.tags?.includes(operationTag)
  ) {
    return orderCreationUnknown(
      ctx,
      { kind: "order", id: orderId },
      "incomplete_created_order",
      `Unknown: Shopify returned order ${orderName}, but its complete creation receipt could not be verified. Do not retry or confirm it to the customer until it is reconciled.`,
      orderId,
    );
  }
  const receipt: ReceiptV1 = {
    ...envelope,
    tool: "create_shopify_order",
    outcome: "succeeded",
    providerReference: orderId,
    facts: {
      orderId,
      orderName: order.name,
      operationTag,
      financialStatus,
      adminUrl,
      totalAmount,
      currency,
    },
  };
  return { ...result, receipt };
}

export const CREATED_ORDER_LOOKUP_QUERY = `query FindShopkeeperCreatedOrder($query: String!) {
  orders(first: 2, query: $query, sortKey: CREATED_AT, reverse: true) {
    nodes {
      id
      legacyResourceId
      name
      email
      tags
      displayFinancialStatus
      totalPriceSet { shopMoney { amount currencyCode } }
    }
  }
}`;

// Shopify's order search lags writes by seconds, so an order created moments
// ago can be missing from a `tag:` search. The newest orders, listed without a
// search, show it sooner.
export const RECENT_ORDERS_QUERY = `query RecentShopkeeperOrders {
  orders(first: 50, sortKey: CREATED_AT, reverse: true) {
    nodes {
      id
      legacyResourceId
      name
      email
      tags
      displayFinancialStatus
      totalPriceSet { shopMoney { amount currencyCode } }
    }
  }
}`;

/**
 * The orders carrying an operation's tag: those the tag search finds or, when
 * it finds none, those among the newest orders. An empty answer does not prove
 * the order was never created; it may not be visible yet.
 */
export async function findCreatedOrders(ctx: ShopifyContext, operationTag: string): Promise<CreatedOrderNode[]> {
  const tagged = (data: CreatedOrderLookupData) =>
    (data.orders?.nodes ?? []).filter((order) => order.tags?.includes(operationTag));
  const searched = tagged(await shopifyGraphql<CreatedOrderLookupData>(
    ctx,
    CREATED_ORDER_LOOKUP_QUERY,
    { query: `tag:${operationTag}` },
    { maxRetries: 1 },
  ));
  if (searched.length > 0) return searched;
  return tagged(await shopifyGraphql<CreatedOrderLookupData>(ctx, RECENT_ORDERS_QUERY, {}, { maxRetries: 1 }));
}

async function reconcileCreatedOrder(
  ctx: ShopifyContext,
  operationTag: string,
  email: string,
  mutationError?: unknown,
): Promise<ToolResult> {
  try {
    const matches = await findCreatedOrders(ctx, operationTag);
    if (matches.length === 1) {
      return createdOrderResult(matches[0]!, ctx, email, operationTag, true);
    }
    if (matches.length > 1) {
      return orderCreationUnknown(
        ctx,
        { kind: "email", id: email },
        "multiple_operation_matches",
        `Unknown: Shopify returned multiple orders for operation ${operationTag}. Do not create another order or confirm one to the customer until they are reviewed.`,
      );
    }
    const detail = mutationError
      ? ` ${formatShopifyToolError("order creation reconciliation failed", mutationError)}`
      : "";
    return orderCreationUnknown(
      ctx,
      { kind: "email", id: email },
      "creation_not_confirmed",
      `Unknown: the order creation request may have committed at Shopify, but a follow-up lookup did not confirm it. Do not retry or confirm it to the customer until it is reconciled.${detail}`,
    );
  } catch (reconciliationError) {
    return orderCreationUnknown(
      ctx,
      { kind: "email", id: email },
      "creation_reconciliation_failed",
      `Unknown: the order creation request may have committed at Shopify and the follow-up lookup failed. Do not retry or confirm it to the customer until it is reconciled. ${formatShopifyToolError("order creation reconciliation failed", reconciliationError)}`,
    );
  }
}

export const ORDER_CREATE_MUTATION = `mutation ShopkeeperOrderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput!) {
  orderCreate(order: $order, options: $options) {
    order {
      id
      legacyResourceId
      name
      email
      tags
      displayFinancialStatus
      totalPriceSet { shopMoney { amount currencyCode } }
    }
    userErrors { field message }
  }
}`;

type OrderLine =
  | { variantId: string; quantity: number }
  | { title: string; price: string; quantity: number };

function buildLineItems(
  lineItems: CreateShopifyOrderLineItem[],
  options: CreateShopifyOrderOptions
): OrderLine[] {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    throw new ShopifyInputError("line_items must include at least one item.");
  }

  return lineItems.map((item, index) => {
    const quantity = optionalPositiveInteger(item.quantity, `line_items[${index}].quantity`, 1);
    const variantId = optionalString(item.variant_id);

    if (variantId) {
      return { variantId: requireNumericId(variantId, `line_items[${index}].variant_id`), quantity };
    }

    if (!options.allowCustomLineItems) {
      throw new ShopifyInputError("Custom line items are disabled. Each line item must include a variant_id.");
    }

    return {
      title: requireNonEmptyString(item.title, `line_items[${index}].title`),
      price: requireAmount(item.price, `line_items[${index}].price`),
      quantity,
    };
  });
}

// A custom line is priced in the shop's currency, as REST priced it.
function lineItemInput(line: OrderLine, shopCurrency: string | null) {
  if ("variantId" in line) {
    return { variantId: `gid://shopify/ProductVariant/${line.variantId}`, quantity: line.quantity };
  }
  return {
    title: line.title,
    quantity: line.quantity,
    requiresShipping: true,
    priceSet: { shopMoney: { amount: line.price, currencyCode: shopCurrency } },
  };
}

async function customLineCurrency(ctx: ShopifyContext, lines: OrderLine[]): Promise<string | null> {
  if (lines.every((line) => "variantId" in line)) return null;
  return (await fetchShopifyShop(ctx, { maxRetries: 1 })).currency;
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
    const currentOperationTag = shopifyOperationTag(ctx.operationId);
    operationTag = currentOperationTag;

    const existingMatches = await findCreatedOrders(ctx, currentOperationTag);
    if (existingMatches.length === 1) {
      return createdOrderResult(existingMatches[0]!, ctx, email, currentOperationTag, true);
    }
    if (existingMatches.length > 1) {
      return orderCreationUnknown(
        ctx,
        { kind: "email", id: email },
        "multiple_operation_matches",
        `Unknown: Shopify returned multiple orders for operation ${currentOperationTag}. Do not create another order or confirm one to the customer until they are reviewed.`,
      );
    }

    const shopCurrency = await customLineCurrency(ctx, lineItems);
    const address = mailingAddressInput(shippingAddress);

    mutationStarted = true;
    const data = await shopifyGraphql<{
      orderCreate: { order: CreatedOrderNode | null; userErrors: ShopifyGraphqlUserError[] };
    }>(ctx, ORDER_CREATE_MUTATION, {
      order: {
        email,
        // The customer with this email, or a new one, as REST attached it. Only
        // the email is sent, so an existing customer's profile is left as it is.
        customer: { toUpsert: { email } },
        financialStatus: "PENDING",
        lineItems: lineItems.map((line) => lineItemInput(line, shopCurrency)),
        shippingAddress: address,
        billingAddress: address,
        tags: [currentOperationTag],
        ...(note ? { note } : {}),
      },
      options: { sendReceipt: false, sendFulfillmentReceipt: false, inventoryBehaviour: "BYPASS" },
    });

    const rejection = formatUserErrors(data.orderCreate.userErrors);
    if (rejection) {
      return orderCreationReceipts.failure(
        ctx,
        email,
        toolError(`Error: failed to create order - ${rejection}`),
        "failed",
        "provider_rejected_creation",
      );
    }
    if (!data.orderCreate.order) {
      return reconcileCreatedOrder(ctx, currentOperationTag, email);
    }

    return createdOrderResult(data.orderCreate.order, ctx, email, currentOperationTag);
  } catch (err) {
    if (mutationStarted && operationTag && isAmbiguousShopifyMutationError(err)) {
      return reconcileCreatedOrder(ctx, operationTag, validatedEmail ?? "the customer", err);
    }
    const email = validatedEmail ?? (input.email.trim().toLowerCase() || "invalid");
    if (err instanceof ShopifyInputError) {
      return orderCreationReceipts.failure(
        ctx,
        email,
        toolPolicyBlock(formatShopifyToolError("failed to create order", err)),
        "rejected",
        "invalid_order_creation_input",
      );
    }
    return orderCreationReceipts.failure(
      ctx,
      email,
      toolError(formatShopifyToolError("failed to create order", err)),
      "failed",
      mutationStarted ? "provider_rejected_creation" : "pre_dispatch_failure",
    );
  }
}
