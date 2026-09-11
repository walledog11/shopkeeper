/**
 * One money value: an amount and the currency it is in, kept together.
 *
 * Every currency defect this module exists to end had the same shape — an
 * amount travelling as a bare string or number while its currency travelled
 * separately, or not at all, and was re-attached later by whichever caller
 * happened to be looking. That produced a refund priced in the shop's currency
 * and quoted in the customer's, a workspace cap comparing 59.90 CAD against a
 * limit of 50 dollars, and a spend ledger summing both into one column.
 *
 * Two monies exist for every order and they are not interchangeable:
 * - **settlement money** is what the customer was charged. Refunds settle in
 *   it, and replies quote it.
 * - **shop money** is the merchant's own books. Workspace caps and the spend
 *   ledger are in it, because that is the currency the merchant typed their
 *   limit in.
 *
 * Never compare, sum, or render an amount without the currency beside it.
 */

import type { ShopifyPriceSet } from "./shopify/types.js";

/**
 * The money-bearing fields of a Shopify order, as a shape rather than a type.
 * Six different order types exist across this package — the REST read, the
 * context summary, the serialized tool result — and every one of them carries
 * these same fields. Depending on any single one of them is how a caller ends
 * up re-deriving the currency itself.
 */
export interface OrderMonies {
  currency?: string | null;
  presentment_currency?: string | null;
  total_price?: string | null;
  current_total_price?: string | null;
  total_price_set?: ShopifyPriceSet;
  current_total_price_set?: ShopifyPriceSet;
}

export interface Money {
  /** Decimal string, always two fraction digits. */
  amount: string;
  /** Uppercase ISO 4217 code. */
  currency: string;
}

/** Two fraction digits, or null when the input is not a plain decimal amount. */
export function canonicalAmount(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
}

export function makeMoney(
  amount: string | null | undefined,
  currency: string | null | undefined,
): Money | null {
  const canonical = canonicalAmount(amount);
  const code = currency?.trim().toUpperCase();
  return canonical && code ? { amount: canonical, currency: code } : null;
}

export function moneyCents(money: Money): number {
  const [dollars, cents = ""] = money.amount.split(".");
  const total = Number(dollars) * 100 + Number(cents.padEnd(2, "0").slice(0, 2));
  return Number.isFinite(total) ? total : 0;
}

export function moneyFromCents(cents: number, currency: string): Money {
  return { amount: (cents / 100).toFixed(2), currency: currency.trim().toUpperCase() };
}

export function sameCurrency(a: Money, b: Money): boolean {
  return a.currency === b.currency;
}

/**
 * How money is written to a customer or a merchant: `$20.00` for USD, and
 * `18.50 EUR` otherwise, because a bare symbol on a non-USD amount is the
 * ambiguity this module exists to remove.
 */
export function formatMoney(money: Money): string {
  return money.currency === "USD" ? `$${money.amount}` : `${money.amount} ${money.currency}`;
}

function fromPriceSet(
  set: { amount?: string; currency_code?: string } | undefined,
): Money | null {
  return makeMoney(set?.amount, set?.currency_code);
}

/**
 * What the customer was charged. A refund settles in this and a reply quotes
 * it. Falls back to the shop's own figures on a single-currency store, where
 * the two are the same money.
 */
export function orderSettlementMoney(order: OrderMonies): Money | null {
  const priceSet = order.current_total_price_set ?? order.total_price_set;
  return fromPriceSet(priceSet?.presentment_money)
    ?? makeMoney(order.current_total_price ?? order.total_price, order.presentment_currency ?? order.currency);
}

/** The currency the customer was charged, when the amount is not needed. */
export function orderSettlementCurrency(order: OrderMonies): string | null {
  const priceSet = order.current_total_price_set ?? order.total_price_set;
  return (priceSet?.presentment_money?.currency_code
    ?? order.presentment_currency
    ?? order.currency)?.trim().toUpperCase() ?? null;
}

/**
 * The merchant's own books. Workspace caps and the spend ledger are denominated
 * here — the merchant typed "50" into a field labelled with their own currency,
 * not the customer's.
 */
export function orderShopCurrency(order: OrderMonies): string | null {
  const priceSet = order.current_total_price_set ?? order.total_price_set;
  return (priceSet?.shop_money?.currency_code ?? order.currency)?.trim().toUpperCase() ?? null;
}

export function orderShopMoney(order: OrderMonies): Money | null {
  const priceSet = order.current_total_price_set ?? order.total_price_set;
  return fromPriceSet(priceSet?.shop_money)
    ?? makeMoney(order.current_total_price ?? order.total_price, order.currency);
}

/**
 * Whether a workspace limit — a bare number the merchant typed in their own
 * currency — permits this amount. `null` means the limit cannot be judged
 * because the money is not in the shop's currency; the caller decides whether
 * that means "ask a human" or "let the authoritative check decide", and must
 * never treat it as permission.
 */
export function withinShopLimit(money: Money, shopCurrency: string | null, limit: number | null | undefined): boolean | null {
  if (limit === null || limit === undefined || limit <= 0) return true;
  if (!shopCurrency || money.currency !== shopCurrency.trim().toUpperCase()) return null;
  return moneyCents(money) <= Math.round(limit * 100);
}
