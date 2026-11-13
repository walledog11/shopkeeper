import { currencyAmount } from "../money.js";
import { shopifyGraphql, type ShopifyContext } from "./client.js";
import type { ShopifyCalculatedRefundLineItem, ShopifyTransaction } from "./types.js";
import { legacyIdFromGid } from "./validation.js";

/**
 * Shopify's own pricing of a refund, replacing REST `refunds/calculate.json`
 * and returned in that endpoint's shape, which the refund paths are written
 * against: the currency the customer was charged, the line items priced, and
 * the transactions that would carry the money back.
 *
 * A full refund lets Shopify choose the lines, so an order's lines never have to
 * be read in full to price it. Shopify would suggest returning shipped lines to
 * stock; the agent's refunds never restock, so every line is kept as
 * `no_restock`, which does not change the amount.
 */
export const REFUND_CALCULATION_QUERY = `query ShopkeeperRefundCalculation($id: ID!, $refundLineItems: [RefundLineItemInput!], $refundShipping: Boolean!, $suggestFullRefund: Boolean!) {
  order(id: $id) {
    suggestedRefund(refundLineItems: $refundLineItems, refundShipping: $refundShipping, suggestFullRefund: $suggestFullRefund) {
      amountSet { presentmentMoney { currencyCode } }
      refundLineItems { lineItem { id } quantity }
      suggestedTransactions {
        amountSet { presentmentMoney { amount currencyCode } }
        gateway
        parentTransaction { id }
      }
    }
  }
}`;

export interface RefundCalculation {
  refund?: {
    currency?: string;
    refund_line_items?: ShopifyCalculatedRefundLineItem[];
    transactions?: ShopifyTransaction[];
  };
}

/** Every refundable line and all shipping, or the named lines without shipping. */
export type RefundSelection =
  | { kind: "full" }
  | { kind: "items"; items: readonly { lineItemId: string | number; quantity: number }[] };

interface SuggestedRefundNode {
  amountSet: { presentmentMoney: { currencyCode: string } };
  refundLineItems: { lineItem: { id: string }; quantity: number }[];
  suggestedTransactions: {
    amountSet: { presentmentMoney: { amount: string; currencyCode: string } };
    gateway: string | null;
    parentTransaction: { id: string } | null;
  }[];
}

export async function calculateShopifyRefund(
  ctx: ShopifyContext,
  orderId: string,
  selection: RefundSelection,
): Promise<RefundCalculation> {
  const full = selection.kind === "full";
  const data = await shopifyGraphql<{ order: { suggestedRefund: SuggestedRefundNode | null } | null }>(
    ctx,
    REFUND_CALCULATION_QUERY,
    {
      id: `gid://shopify/Order/${orderId}`,
      refundLineItems: full ? null : selection.items.map((item) => ({
        lineItemId: `gid://shopify/LineItem/${item.lineItemId}`,
        quantity: item.quantity,
        restockType: "NO_RESTOCK",
      })),
      refundShipping: full,
      suggestFullRefund: full,
    },
  );
  const suggestion = data.order?.suggestedRefund;
  if (!suggestion) return {};
  return {
    refund: {
      currency: suggestion.amountSet.presentmentMoney.currencyCode,
      refund_line_items: suggestion.refundLineItems.map((line) => ({
        line_item_id: legacyIdFromGid(line.lineItem.id),
        quantity: line.quantity,
        restock_type: "no_restock",
      })),
      transactions: suggestion.suggestedTransactions.map((transaction) => {
        const money = transaction.amountSet.presentmentMoney;
        return {
          kind: "suggested_refund",
          gateway: transaction.gateway ?? "",
          amount: currencyAmount(money.amount, money.currencyCode),
          currency: money.currencyCode,
          ...(transaction.parentTransaction ? { parent_id: legacyIdFromGid(transaction.parentTransaction.id) } : {}),
        };
      }),
    },
  };
}
