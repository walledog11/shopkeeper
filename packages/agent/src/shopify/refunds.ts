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
import { toolError, toolOk, toolPolicyBlock, toolUnknown, type ToolResult } from "../tools/result.js";
import type {
  ShopifyCalculatedRefundLineItem,
  ShopifyOrder,
  ShopifyOrderLineItem,
  ShopifyTransaction,
} from "./types.js";
import { centsToMoney, moneyToCents, optionalString, requireAmount, requireNumericId, ShopifyInputError } from "./validation.js";
import { ORDER_CURRENCY_FIELDS } from "./serializers.js";
import { formatMoney, makeMoney, moneyCents, moneyFromCents, orderSettlementCurrency, orderShopCurrency, orderShopMoney, withinShopLimit } from "../money.js";
import type { OrgSettings } from "../types.js";

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
  /** Shop money, in cents: the merchant's own currency, which is what the daily
   *  compensation ledger and the workspace caps are denominated in. */
  refundedShopCents: number | null;
}

export const REFUND_CREATE_MUTATION = `
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
          userErrors { field message }
        }
      }
    `;

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

// `currency` is not optional on a multi-currency order: omit it and Shopify
// prices the refund in the shop's own currency, which is neither what the
// customer paid nor what the refund can settle against.
async function calculateRefund(
  ctx: ShopifyContext,
  orderId: string,
  refundLineItems: ShopifyCalculatedRefundLineItem[],
  currency: string
): Promise<RefundCalculation> {
  return shopifyRestJson<RefundCalculation>(ctx, `orders/${orderId}/refunds/calculate.json`, {
    method: "POST",
    body: {
      refund: {
        currency,
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
  ctx: ShopifyContext,
  settings?: Pick<OrgSettings, "maxRefundAmount">
): Promise<RefundResult> {
  let mutationStarted = false;
  try {
    const orderId = requireNumericId(input.order_id, "order_id");
    const amount = requireAmount(input.amount, "amount");
    const requestedCents = moneyToCents(amount);
    const requestedCurrency = optionalString(input.currency)?.toUpperCase();
    const note = optionalString(input.reason) ?? "";

    const orderData = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}.json`, {
      query: { fields: `id,name,${ORDER_CURRENCY_FIELDS},line_items,total_price,current_total_price,financial_status,refunds` },
    });

    if (!orderData.order) {
      return {
        ...toolPolicyBlock(`Error: refund policy blocked - order ${orderId} could not be resolved at Shopify.`, { code: "order_unresolved" }),
        refundedShopCents: null,
      };
    }

    const financialStatus = orderData.order.financial_status?.toLowerCase() ?? "unknown";
    if (financialStatus !== "paid") {
      return {
        ...toolPolicyBlock(`Error: refund policy blocked - order ${orderId} has financial status "${financialStatus}"; only a fully paid order with no prior refund can be refunded by the agent.`, { code: "order_not_paid", financialStatus }),
        refundedShopCents: null,
      };
    }
    if ((orderData.order.refunds?.length ?? 0) > 0) {
      return {
        ...toolPolicyBlock(`Error: refund policy blocked - order ${orderId} already has a refund record and requires merchant review.`, { code: "prior_refund" }),
        refundedShopCents: null,
      };
    }

    // The currency is settled before any money is priced, because it is an input
    // to the pricing rather than a property of the answer.
    const currency = orderSettlementCurrency(orderData.order);
    if (!currency) {
      return {
        ...toolPolicyBlock("Error: refund policy blocked - Shopify returned no currency for this order.", { code: "currency_missing" }),
        refundedShopCents: null,
      };
    }
    if (requestedCurrency && requestedCurrency !== currency) {
      return {
        ...toolPolicyBlock(`Error: refund policy blocked - requested currency ${requestedCurrency} does not match the ${currency} this order was charged in.`, { code: "currency_mismatch", requestedCurrency, currency }),
        refundedShopCents: null,
      };
    }

    // The workspace cap is a number the merchant typed in their own currency, so
    // it is judged against the shop's books rather than the customer's. Comparing
    // it to the settlement amount would refuse a refund for being large in a
    // currency the merchant never set a limit in. This is the authoritative
    // check: the static pre-check cannot see either figure.
    const shopCurrency = orderShopCurrency(orderData.order);
    // The order's own shop-money total when Shopify gave one; otherwise the
    // amount the caller named, but only once it is known to be in the shop's
    // currency. A capped workspace never skips this check silently.
    const shopMoney = orderShopMoney(orderData.order)
      ?? (currency === shopCurrency ? makeMoney(amount, currency) : null);
    const withinCap = shopMoney
      ? withinShopLimit(shopMoney, shopCurrency, settings?.maxRefundAmount)
      : null;
    if (shopMoney && withinCap === false) {
      return {
        ...toolPolicyBlock(
          `Error: refund policy blocked - ${formatMoney(shopMoney)} exceeds the workspace refund limit of ${formatMoney(moneyFromCents(Math.round((settings?.maxRefundAmount ?? 0) * 100), shopMoney.currency))}.`,
          { code: "amount_over_cap", shopCents: moneyCents(shopMoney), capCents: Math.round((settings?.maxRefundAmount ?? 0) * 100) },
        ),
        refundedShopCents: null,
      };
    }

    const refundLineItems = buildRefundLineItems(orderData.order);
    if (refundLineItems.length === 0) {
      return {
        ...toolPolicyBlock("Error: refund policy blocked - Shopify returned no refundable line items for the complete order.", { code: "no_refundable_line_items" }),
        refundedShopCents: null,
      };
    }

    const calculation = await calculateRefund(ctx, orderId, refundLineItems, currency);
    const calculatedCurrency = calculation.refund?.currency?.toUpperCase();
    if (calculatedCurrency && calculatedCurrency !== currency) {
      return {
        ...toolPolicyBlock(`Error: refund policy blocked - Shopify priced the refund in ${calculatedCurrency}, not the ${currency} this order was charged in.`, { code: "currency_mismatch", requestedCurrency: currency, currency: calculatedCurrency }),
        refundedShopCents: null,
      };
    }

    const transactions = buildFullRefundTransactions(calculation);

    if (transactions.length === 0) {
      return {
        ...toolPolicyBlock("Error: refund policy blocked - Shopify did not return a complete refundable balance.", { code: "no_refundable_balance" }),
        refundedShopCents: null,
      };
    }
    if (transactions.some(transaction => transaction.currency && transaction.currency.toUpperCase() !== currency)) {
      return {
        ...toolPolicyBlock(`Error: refund policy blocked - a refundable transaction uses a different currency from the ${currency} refund.`, { code: "currency_mismatch", currency }),
        refundedShopCents: null,
      };
    }
    const refundableCents = transactions.reduce(
      (total, transaction) => total + moneyToCents(transaction.amount),
      0,
    );
    if (requestedCents !== refundableCents) {
      return {
        ...toolPolicyBlock(
          `Error: refund policy blocked - requested amount ${centsToMoney(requestedCents)} ${currency} does not equal Shopify's complete refundable balance of ${centsToMoney(refundableCents)} ${currency}. Partial or custom refunds require merchant handling.`,
          { code: "amount_mismatch", requestedCents, refundableCents, currency },
        ),
        refundedShopCents: null,
      };
    }

    const idempotencyKey = shopifyIdempotencyKey(ctx.operationId);
    const refundInput = {
      orderId: gid("Order", orderId),
      notify: true,
      note,
      currency,
      shipping: { fullRefund: true },
      refundLineItems: graphqlRefundLineItems(
        calculation.refund?.refund_line_items ?? refundLineItems,
      ),
      transactions: graphqlRefundTransactions(orderId, transactions),
    };
    mutationStarted = true;
    const data = await shopifyGraphql<RefundCreateData>(ctx, REFUND_CREATE_MUTATION, {
      input: refundInput,
      idempotencyKey,
    }, {
      // This retry is safe because every attempt reuses the exact same input
      // and Shopify's provider-owned idempotency key.
      maxRetries: 1,
    });

    const userError = formatUserErrors(data.refundCreate.userErrors);
    if (userError) {
      return { ...toolError(`Error: failed to create refund - ${userError}`), refundedShopCents: null };
    }

    const refund = data.refundCreate.refund;
    if (!refund) {
      return {
        ...toolUnknown(`Unknown: Shopify accepted the refund request for order ${orderId} but did not return a refund. Do not retry or confirm it to the customer until it is reconciled.`),
        refundedShopCents: null,
      };
    }

    const transactionStatuses = (refund.transactions?.nodes ?? [])
      .map((transaction) => transaction.status?.toUpperCase())
      .filter((status): status is string => Boolean(status));
    if (transactionStatuses.length === 0 || transactionStatuses.some((status) => status !== "SUCCESS")) {
      return {
        ...toolUnknown(`Unknown: Shopify created refund ${refund.id} for order ${orderId}, but its payment status is ${transactionStatuses.join(", ") || "unavailable"}. Do not retry or confirm it to the customer until it is reconciled.`),
        refundedShopCents: null,
      };
    }

    const refundedAmount = refund.totalRefundedSet?.presentmentMoney?.amount;
    if (!refundedAmount) {
      return {
        ...toolUnknown(`Unknown: Shopify created refund ${refund.id} for order ${orderId}, but did not return the committed amount. Do not retry or confirm it to the customer until it is reconciled.`),
        refundedShopCents: null,
      };
    }
    const settled = makeMoney(refundedAmount, currency) ?? { amount: refundedAmount, currency };

    return {
      // What the customer sees named in the currency they were charged; what the
      // compensation ledger counts in the merchant's own.
      ...toolOk(`Refund of ${formatMoney(settled)} issued successfully for order ${orderId}.${note ? ` Reason: ${note}.` : ""}`),
      refundedShopCents: shopMoney ? moneyCents(shopMoney) : moneyCents(settled),
    };
  } catch (err) {
    if (mutationStarted && isAmbiguousShopifyMutationError(err)) {
      return {
        ...toolUnknown(`Unknown: the refund request may have committed at Shopify, but its final state could not be confirmed. Do not retry or confirm it to the customer until it is reconciled. ${formatShopifyToolError("refund reconciliation failed", err)}`),
        refundedShopCents: null,
      };
    }
    if (!mutationStarted && err instanceof ShopifyInputError) {
      return {
        ...toolPolicyBlock(`Error: refund policy blocked - ${err.message}`, { code: "invalid_refund_input" }),
        refundedShopCents: null,
      };
    }
    return { ...toolError(formatShopifyToolError("failed to create refund", err)), refundedShopCents: null };
  }
}
