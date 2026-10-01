import { shopifyGraphql, type ShopifyContext } from "./client.js";
import { moneyToCents } from "./validation.js";

// A workspace's refund limits (the per-refund cap and the daily budget) are set in
// the shop's own currency, but Shopify quotes a refund in the currency the
// customer was charged. When the two differ the quoted number says nothing about
// what the refund costs the merchant, so the limits are applied to Shopify's own
// shop-currency figure for the same refund. A rate of our own is never used.

export const SUGGESTED_REFUND_QUERY = `query RefundShopMoney($id: ID!, $refundLineItems: [RefundLineItemInput!], $refundShipping: Boolean) {
  order(id: $id) {
    suggestedRefund(refundLineItems: $refundLineItems, refundShipping: $refundShipping) {
      amountSet {
        shopMoney { amount currencyCode }
        presentmentMoney { amount currencyCode }
      }
    }
  }
}`;

interface MoneyView {
  amount?: string | null;
  currencyCode?: string | null;
}

interface SuggestedRefundData {
  order?: {
    suggestedRefund?: {
      amountSet?: {
        shopMoney?: MoneyView | null;
        presentmentMoney?: MoneyView | null;
      } | null;
    } | null;
  } | null;
}

interface RefundShopMoneyQuery {
  orderGid: string;
  /** The shop's own currency, as the order reports it. */
  shopCurrency: string | undefined;
  /** The refund as Shopify's calculation priced it: in the currency the customer was charged. */
  quote: { cents: number; currency: string };
  /** The selection the calculation priced, in GraphQL's shape. */
  refundLineItems: readonly Record<string, unknown>[];
  refundShipping: boolean;
}

/**
 * What a refund costs the merchant in the shop's own currency, or null when
 * Shopify's figure cannot be tied to the quote, in which case the caller refuses
 * rather than guess. When the customer was charged in the shop's currency the
 * quote already is that figure and nothing is looked up.
 */
export async function refundShopCents(
  ctx: ShopifyContext,
  query: RefundShopMoneyQuery,
): Promise<number | null> {
  const shopCurrency = query.shopCurrency?.trim().toUpperCase();
  if (!shopCurrency) return null;
  if (query.quote.currency === shopCurrency) return query.quote.cents;

  const data = await shopifyGraphql<SuggestedRefundData>(ctx, SUGGESTED_REFUND_QUERY, {
    id: query.orderGid,
    refundLineItems: query.refundLineItems,
    refundShipping: query.refundShipping,
  });
  const amount = data.order?.suggestedRefund?.amountSet;
  const shop = amount?.shopMoney;
  const presentment = amount?.presentmentMoney;
  if (!shop?.amount || !presentment?.amount) return null;
  // Shopify's figure has to describe the refund the quote priced, in the
  // currencies this code says they are. Anything else is a different refund.
  if (shop.currencyCode?.trim().toUpperCase() !== shopCurrency) return null;
  if (presentment.currencyCode?.trim().toUpperCase() !== query.quote.currency) return null;
  if (moneyToCents(presentment.amount) !== query.quote.cents) return null;
  const cents = moneyToCents(shop.amount);
  return cents > 0 ? cents : null;
}

/**
 * What a committed refund cost the merchant in the shop's currency: Shopify's
 * report of it when it gives one, otherwise the quote's figure, but only when
 * the refund that committed is the one that was quoted. Null leaves the executor
 * unable to verify the committed amount, which it treats as an unknown outcome.
 */
export function committedShopCents(
  committed: {
    presentmentMoney?: { amount?: string } | null;
    shopMoney?: { amount?: string } | null;
  } | undefined,
  quoted: { presentmentCents: number; shopCents: number },
): number | null {
  const shop = committed?.shopMoney?.amount;
  if (shop) return moneyToCents(shop);
  return moneyToCents(committed?.presentmentMoney?.amount) === quoted.presentmentCents
    ? quoted.shopCents
    : null;
}
