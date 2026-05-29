import type { CreateRefundInput } from "../tools";
import { formatShopifyToolError, shopifyRestJson, type ShopifyContext } from "./client";
import type {
  ShopifyCalculatedRefundLineItem,
  ShopifyOrder,
  ShopifyOrderLineItem,
  ShopifyTransaction,
} from "./types";
import { centsToMoney, moneyToCents, optionalString, requireAmount, requireNumericId, ShopifyInputError } from "./validation";

interface RefundCalculation {
  refund?: {
    currency?: string;
    shipping?: unknown;
    refund_line_items?: ShopifyCalculatedRefundLineItem[];
    transactions?: ShopifyTransaction[];
    suggested_transactions?: ShopifyTransaction[];
  };
}

interface RefundCreateResponse {
  refund?: {
    transactions?: { amount: string }[];
  };
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

export async function createRefund(
  input: CreateRefundInput,
  ctx: ShopifyContext
): Promise<string> {
  try {
    const orderId = requireNumericId(input.order_id, "order_id");
    const amount = input.amount !== undefined ? requireAmount(input.amount, "amount") : undefined;
    const note = optionalString(input.reason) ?? "";

    const orderData = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}.json`, {
      query: { fields: "id,name,currency,line_items,total_price,current_total_price,financial_status" },
    });

    if (!orderData.order) {
      return `Error: could not create refund - order ${orderId} was not returned by Shopify.`;
    }

    const refundLineItems = buildRefundLineItems(orderData.order);
    if (refundLineItems.length === 0 && !amount) {
      return "Error: could not create refund - no refundable line items were found on this order.";
    }

    const calculation = await calculateRefund(ctx, orderId, refundLineItems);
    const currency = calculation.refund?.currency ?? orderData.order.currency;
    const transactions = amount
      ? buildPartialRefundTransactions(calculation, amount)
      : buildFullRefundTransactions(calculation);

    if (transactions.length === 0) {
      return "Error: could not create refund - Shopify did not return refundable transactions.";
    }

    const data = await shopifyRestJson<RefundCreateResponse>(ctx, `orders/${orderId}/refunds.json`, {
      method: "POST",
      body: {
        refund: {
          notify: true,
          note,
          ...(currency ? { currency } : {}),
          ...(amount
            ? {}
            : {
                shipping: calculation.refund?.shipping ?? { full_refund: true },
                refund_line_items: calculation.refund?.refund_line_items ?? refundLineItems,
              }),
          transactions,
        },
      },
    });

    if (!data.refund) {
      return `Error: failed to create refund - Shopify did not return a refund for order ${orderId}.`;
    }

    const totalRefunded = (data.refund.transactions ?? [])
      .reduce((sum, transaction) => sum + moneyToCents(transaction.amount), 0);

    return `Refund of $${centsToMoney(totalRefunded)} issued successfully for order ${orderId}.${note ? ` Reason: ${note}.` : ""}`;
  } catch (err) {
    return formatShopifyToolError("failed to create refund", err);
  }
}
