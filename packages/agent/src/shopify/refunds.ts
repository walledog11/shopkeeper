import type { CreateRefundInput } from "../tools/index.js";
import {
  formatShopifyToolError,
  formatUserErrors,
  isAmbiguousShopifyMutationError,
  shopifyGraphql,
  shopifyIdempotencyKey,
  shopifyRestJson,
  type ShopifyContext,
  type ShopifyGraphqlUserError,
} from "./client.js";
import { toolError, toolOk, toolUnknown, type ToolResult } from "../tools/result.js";
import type {
  ShopifyCalculatedRefundLineItem,
  ShopifyOrder,
  ShopifyOrderLineItem,
  ShopifyTransaction,
} from "./types.js";
import { centsToMoney, moneyToCents, optionalString, requireAmount, requireNumericId, ShopifyInputError } from "./validation.js";

interface RefundCalculation {
  refund?: {
    currency?: string;
    shipping?: unknown;
    refund_line_items?: ShopifyCalculatedRefundLineItem[];
    transactions?: ShopifyTransaction[];
    suggested_transactions?: ShopifyTransaction[];
  };
}

interface RefundCreateData {
  refundCreate: {
    refund?: {
      id: string;
      totalRefundedSet?: {
        presentmentMoney?: { amount?: string };
      };
      transactions?: {
        nodes?: Array<{
          status?: string | null;
          amountSet?: { presentmentMoney?: { amount?: string } };
        }>;
      };
    } | null;
    userErrors?: ShopifyGraphqlUserError[];
  };
}

export interface RefundResult extends ToolResult {
  refundedCents: number | null;
}

function refundableQuantity(lineItem: ShopifyOrderLineItem): number {
  const quantity = lineItem.current_quantity ?? lineItem.quantity;
  return Number.isFinite(quantity) ? Math.max(quantity, 0) : 0;
}

function buildRefundLineItems(order: ShopifyOrder): ShopifyCalculatedRefundLineItem[] {
  return (order.line_items ?? []).flatMap((lineItem) => (
    lineItem.id !== undefined && lineItem.id !== null && refundableQuantity(lineItem) > 0 ? [{
      line_item_id: lineItem.id!,
      quantity: refundableQuantity(lineItem),
      restock_type: "no_restock",
    }] : []
  ));
}

function calculatedTransactions(calculation: RefundCalculation): ShopifyTransaction[] {
  const refund = calculation.refund;
  return refund?.transactions ?? refund?.suggested_transactions ?? [];
}

function normalizeRefundTransaction(transaction: ShopifyTransaction, amount?: string): ShopifyTransaction {
  return {
    kind: "refund",
    gateway: transaction.gateway,
    amount: amount ?? transaction.amount,
    ...(transaction.parent_id !== undefined ? { parent_id: transaction.parent_id } : {}),
    ...(transaction.currency ? { currency: transaction.currency } : {}),
  };
}

function buildFullRefundTransactions(calculation: RefundCalculation): ShopifyTransaction[] {
  return calculatedTransactions(calculation).flatMap((transaction) => (
    moneyToCents(transaction.amount) > 0 ? [normalizeRefundTransaction(transaction)] : []
  ));
}

function buildPartialRefundTransactions(calculation: RefundCalculation, amount: string): ShopifyTransaction[] {
  let remainingCents = moneyToCents(amount);
  const transactions: ShopifyTransaction[] = [];

  for (const transaction of calculatedTransactions(calculation)) {
    const maxRefundable = transaction.maximum_refundable ?? transaction.amount;
    const availableCents = moneyToCents(maxRefundable);
    const refundCents = Math.min(remainingCents, availableCents);

    if (refundCents > 0) {
      transactions.push(normalizeRefundTransaction(transaction, centsToMoney(refundCents)));
      remainingCents -= refundCents;
    }

    if (remainingCents === 0) break;
  }

  if (remainingCents > 0) {
    throw new ShopifyInputError("Requested refund amount exceeds the amount Shopify reports as refundable.");
  }

  return transactions;
}

async function calculateRefund(
  ctx: ShopifyContext,
  orderId: string,
  refundLineItems: ShopifyCalculatedRefundLineItem[]
): Promise<RefundCalculation> {
  return shopifyRestJson<RefundCalculation>(ctx, `orders/${orderId}/refunds/calculate.json`, {
    method: "POST",
    body: {
      refund: {
        shipping: { full_refund: true },
        refund_line_items: refundLineItems,
      },
    },
  });
}

function gid(resource: "Order" | "LineItem" | "Location" | "OrderTransaction", id: string | number): string {
  return `gid://shopify/${resource}/${id}`;
}

function graphqlRefundLineItems(lineItems: ShopifyCalculatedRefundLineItem[]) {
  return lineItems.map((lineItem) => {
    const restockType = lineItem.restock_type.toUpperCase();
    return {
      lineItemId: gid("LineItem", lineItem.line_item_id),
      quantity: lineItem.quantity,
      restockType,
      ...(restockType !== "NO_RESTOCK" && lineItem.location_id != null
        ? { locationId: gid("Location", lineItem.location_id) }
        : {}),
    };
  });
}

function graphqlRefundTransactions(orderId: string, transactions: ShopifyTransaction[]) {
  return transactions.map((transaction) => ({
    orderId: gid("Order", orderId),
    kind: "REFUND",
    gateway: transaction.gateway,
    amount: transaction.amount,
    ...(transaction.parent_id != null
      ? { parentId: gid("OrderTransaction", transaction.parent_id) }
      : {}),
  }));
}

export async function createRefund(
  input: CreateRefundInput,
  ctx: ShopifyContext
): Promise<RefundResult> {
  let mutationStarted = false;
  try {
    const orderId = requireNumericId(input.order_id, "order_id");
    const amount = input.amount !== undefined ? requireAmount(input.amount, "amount") : undefined;
    const note = optionalString(input.reason) ?? "";

    const orderData = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}.json`, {
      query: { fields: "id,name,currency,line_items,total_price,current_total_price,financial_status" },
    });

    if (!orderData.order) {
      return { ...toolError(`Error: could not create refund - order ${orderId} was not returned by Shopify.`), refundedCents: null };
    }

    const refundLineItems = buildRefundLineItems(orderData.order);
    if (refundLineItems.length === 0 && !amount) {
      return { ...toolError("Error: could not create refund - no refundable line items were found on this order."), refundedCents: null };
    }

    const calculation = await calculateRefund(ctx, orderId, refundLineItems);
    const currency = calculation.refund?.currency ?? orderData.order.currency;
    const transactions = amount
      ? buildPartialRefundTransactions(calculation, amount)
      : buildFullRefundTransactions(calculation);

    if (transactions.length === 0) {
      return { ...toolError("Error: could not create refund - Shopify did not return refundable transactions."), refundedCents: null };
    }

    const idempotencyKey = shopifyIdempotencyKey(ctx.operationId);
    const refundInput = {
      orderId: gid("Order", orderId),
      notify: true,
      note,
      ...(currency ? { currency } : {}),
      ...(!amount
        ? {
            shipping: { fullRefund: true },
            refundLineItems: graphqlRefundLineItems(
              calculation.refund?.refund_line_items ?? refundLineItems,
            ),
          }
        : {}),
      transactions: graphqlRefundTransactions(orderId, transactions),
    };
    mutationStarted = true;
    const data = await shopifyGraphql<RefundCreateData>(ctx, `
      mutation CreateRefund($input: RefundInput!, $idempotencyKey: String!) {
        refundCreate(input: $input) @idempotent(key: $idempotencyKey) {
          refund {
            id
            totalRefundedSet {
              presentmentMoney { amount }
            }
            transactions(first: 20) {
              nodes {
                status
                amountSet { presentmentMoney { amount } }
              }
            }
          }
          userErrors { field message code }
        }
      }
    `, {
      input: refundInput,
      idempotencyKey,
    }, {
      // This retry is safe because every attempt reuses the exact same input
      // and Shopify's provider-owned idempotency key.
      maxRetries: 1,
    });

    const userError = formatUserErrors(data.refundCreate.userErrors);
    if (userError) {
      return { ...toolError(`Error: failed to create refund - ${userError}`), refundedCents: null };
    }

    const refund = data.refundCreate.refund;
    if (!refund) {
      return {
        ...toolUnknown(`Unknown: Shopify accepted the refund request for order ${orderId} but did not return a refund. Do not retry or confirm it to the customer until it is reconciled.`),
        refundedCents: null,
      };
    }

    const transactionStatuses = (refund.transactions?.nodes ?? [])
      .map((transaction) => transaction.status?.toUpperCase())
      .filter((status): status is string => Boolean(status));
    if (transactionStatuses.length === 0 || transactionStatuses.some((status) => status !== "SUCCESS")) {
      return {
        ...toolUnknown(`Unknown: Shopify created refund ${refund.id} for order ${orderId}, but its payment status is ${transactionStatuses.join(", ") || "unavailable"}. Do not retry or confirm it to the customer until it is reconciled.`),
        refundedCents: null,
      };
    }

    const refundedAmount = refund.totalRefundedSet?.presentmentMoney?.amount;
    if (!refundedAmount) {
      return {
        ...toolUnknown(`Unknown: Shopify created refund ${refund.id} for order ${orderId}, but did not return the committed amount. Do not retry or confirm it to the customer until it is reconciled.`),
        refundedCents: null,
      };
    }
    const totalRefunded = moneyToCents(refundedAmount);

    return {
      ...toolOk(`Refund of $${centsToMoney(totalRefunded)} issued successfully for order ${orderId}.${note ? ` Reason: ${note}.` : ""}`),
      refundedCents: totalRefunded,
    };
  } catch (err) {
    if (mutationStarted && isAmbiguousShopifyMutationError(err)) {
      return {
        ...toolUnknown(`Unknown: the refund request may have committed at Shopify, but its final state could not be confirmed. Do not retry or confirm it to the customer until it is reconciled. ${formatShopifyToolError("refund reconciliation failed", err)}`),
        refundedCents: null,
      };
    }
    return { ...toolError(formatShopifyToolError("failed to create refund", err)), refundedCents: null };
  }
}
