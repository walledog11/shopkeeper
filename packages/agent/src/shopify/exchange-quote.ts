import type { ExchangeQuoteInput } from "../tools/registry/types.js";
import { toolError, toolNotFound, toolOk, toolPolicyBlock, type ToolResult } from "../tools/result.js";
import { formatShopifyToolError, shopifyGraphql, type ShopifyContext } from "./client.js";
import { allocateReturnQuantity, fetchReturnableLineItems, selectReturnLineItems } from "./returns.js";
import { optionalPositiveInteger, requireNumericId } from "./validation.js";

const MONEY_FIELDS = `shopMoney { amount currencyCode } presentmentMoney { amount currencyCode }`;

export const EXCHANGE_QUOTE_QUERY = `query ExchangeQuote($input: CalculateReturnInput!) {
  returnCalculate(input: $input) {
    returnLineItems {
      fulfillmentLineItem { id }
      quantity
      subtotalSet { ${MONEY_FIELDS} }
      totalTaxSet { ${MONEY_FIELDS} }
      restockingFee { amountSet { ${MONEY_FIELDS} } }
    }
    exchangeLineItems {
      variant { id }
      quantity
      subtotalSet { ${MONEY_FIELDS} }
      totalTaxSet { ${MONEY_FIELDS} }
    }
    returnShippingFee { amountSet { ${MONEY_FIELDS} } }
  }
}`;

interface Money {
  amount: string;
  currencyCode: string;
}
interface MoneyBag {
  shopMoney: Money;
  presentmentMoney: Money;
}
interface CalculatedLine {
  quantity: number;
  subtotalSet: MoneyBag;
  totalTaxSet: MoneyBag;
}
interface ExchangeQuoteData {
  returnCalculate: {
    returnLineItems: (CalculatedLine & {
      fulfillmentLineItem: { id: string };
      restockingFee: { amountSet: MoneyBag } | null;
    })[];
    exchangeLineItems: (CalculatedLine & { variant: { id: string } | null })[];
    returnShippingFee: { amountSet: MoneyBag } | null;
  } | null;
}

// Shopify supplies each component; sum exact decimals without floating-point
// rounding or converting currencies. Missing money is never treated as zero.
function totalMoney(bags: readonly (MoneyBag | undefined)[], view: keyof MoneyBag): Money {
  const currencyCode = bags[0]?.[view]?.currencyCode;
  if (!currencyCode || !/^[A-Z]{3}$/.test(currencyCode)) {
    throw new Error("Shopify returned incomplete exchange currency.");
  }
  const values = bags.map(bag => {
    const value = bag?.[view];
    if (!value || value.currencyCode !== currencyCode || !/^\d+(?:\.\d{1,3})?$/.test(value.amount)) {
      throw new Error("Shopify returned incomplete or inconsistent exchange amounts.");
    }
    return value;
  });
  const precision = Math.max(2, ...values.map(value => value.amount.split(".")[1]?.length ?? 0));
  const total = values.reduce((sum, value) => {
    return sum + decimalUnits(value.amount, precision);
  }, 0n);
  const digits = total.toString().padStart(precision + 1, "0");
  return { amount: `${digits.slice(0, -precision)}.${digits.slice(-precision)}`, currencyCode };
}

function decimalUnits(amount: string, precision: number): bigint {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole + fraction.padEnd(precision, "0"));
}

function difference(returned: Money, replacement: Money, fees: Money) {
  const totals = [returned, replacement, fees];
  if (totals.some(money => money.currencyCode !== returned.currencyCode)) {
    throw new Error("Shopify returned inconsistent exchange currencies.");
  }
  const precision = Math.max(...totals.map(money => money.amount.split(".")[1].length));
  const units = (money: Money) => decimalUnits(money.amount, precision);
  const net = units(replacement) + units(fees) - units(returned);
  const digits = (net < 0n ? -net : net).toString().padStart(precision + 1, "0");
  return {
    direction: net > 0n ? "additional_payment" : net < 0n ? "refund" : "even",
    amount: `${digits.slice(0, -precision)}.${digits.slice(-precision)}`,
    currency: returned.currencyCode,
  };
}

/** Read-only preview of the selected exchange, never an executed money receipt. */
export async function getExchangeQuote(input: ExchangeQuoteInput, ctx: ShopifyContext): Promise<ToolResult> {
  try {
    const orderId = requireNumericId(input.order_id, "order_id");
    const variantId = requireNumericId(input.variant_id, "variant_id");
    const replacementId = requireNumericId(input.exchange_variant_id, "exchange_variant_id");
    const quantity = optionalPositiveInteger(input.quantity, "quantity", 1);
    if (variantId === replacementId) return toolPolicyBlock("Choose a different replacement variant.");
    const orderGid = `gid://shopify/Order/${orderId}`;
    const returnable = await fetchReturnableLineItems(ctx, orderGid);
    if (!returnable) return toolNotFound("Shopify did not return the order; its exchange balance is unavailable.");
    const allocated = allocateReturnQuantity(selectReturnLineItems(returnable, variantId), quantity);
    if (allocated.reduce((sum, line) => sum + line.quantity, 0) !== quantity) {
      return toolPolicyBlock("The selected quantity is not returnable; its exchange balance is unavailable.");
    }
    const selected = allocated.map(({ item, quantity: units }) => ({
      fulfillmentLineItemId: item.fulfillmentLineItemId, quantity: units,
    }));
    const replacementGid = `gid://shopify/ProductVariant/${replacementId}`;
    const data = await shopifyGraphql<ExchangeQuoteData>(ctx, EXCHANGE_QUOTE_QUERY, {
      input: { orderId: orderGid, returnLineItems: selected, exchangeLineItems: [{ variantId: replacementGid, quantity }] },
    });
    const quote = data.returnCalculate;
    if (!quote || !Array.isArray(quote.returnLineItems) || !Array.isArray(quote.exchangeLineItems)
      || quote.returnLineItems.length !== selected.length
      || selected.some(line => !quote.returnLineItems.some(result => (
        result.fulfillmentLineItem?.id === line.fulfillmentLineItemId && result.quantity === line.quantity
      )))
      || quote.exchangeLineItems.length !== 1 || quote.exchangeLineItems[0].variant?.id !== replacementGid
      || quote.exchangeLineItems[0].quantity !== quantity) {
      return toolError("Shopify did not calculate the exact selected exchange; its balance is unavailable.");
    }
    const returnBags = quote.returnLineItems.flatMap(line => [line.subtotalSet, line.totalTaxSet]);
    const replacementBags = quote.exchangeLineItems.flatMap(line => [line.subtotalSet, line.totalTaxSet]);
    const feeBags = quote.returnLineItems.flatMap(line => line.restockingFee === null ? [] : [line.restockingFee?.amountSet]);
    if (quote.returnShippingFee !== null) feeBags.push(quote.returnShippingFee?.amountSet);
    const money = (view: keyof MoneyBag) => {
      const returned = totalMoney(returnBags, view);
      const replacement = totalMoney(replacementBags, view);
      const fees = feeBags.length ? totalMoney(feeBags, view) : { amount: "0.00", currencyCode: returned.currencyCode };
      return { returned, replacement, fees, difference: difference(returned, replacement, fees) };
    };
    return toolOk(JSON.stringify({
      source: "Shopify returnCalculate", orderId, variantId, replacementVariantId: replacementId, quantity,
      calculatedAt: new Date().toISOString(),
      presentmentMoney: money("presentmentMoney"), shopMoney: money("shopMoney"),
      scope: "Selected items, taxes and fees returned by Shopify; excludes other outstanding order balances or later merchant adjustments.",
      finalBalanceEstablished: false, financialTransferPerformed: false,
      guidance: "Describe this as Shopify's current exchange estimate, not a settled balance or a promise that nothing will be owed. The merchant handles any payment or refund separately in Shopify.",
    }));
  } catch (error) {
    return toolError(formatShopifyToolError("exchange estimate unavailable; do not infer a zero balance", error));
  }
}
