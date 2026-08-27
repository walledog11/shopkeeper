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
import { toolError, toolOk, toolPolicyBlock, toolUnknown } from "../tools/result.js";
import {
  ShopifyInputError,
  centsToMoney,
  moneyToCents,
  requireNumericId,
} from "./validation.js";
import type { RefundToolResult } from "../tools/registry/types.js";
import type { CreatePartialRefundInput } from "../tools/registry/types.js";
import type { OrgSettings } from "../types.js";
import type { ShopifyOrder, ShopifyOrderLineItem } from "./types.js";

/**
 * Refunding some of an order, deliberately kept apart from `createRefund`.
 *
 * The full-refund tool's safety property is an equality check: the requested
 * amount must equal Shopify's complete refundable balance, so a model that
 * miscounts cannot refund the wrong sum. That check is exactly what a partial
 * refund cannot satisfy, and loosening it into a range would have removed the
 * guarantee from both. So this is a separate path with a different guarantee:
 * the model never names an amount at all.
 *
 * It names line items and quantities; Shopify prices them. The money is
 * whatever `refunds/calculate.json` returns for that selection, which means a
 * model cannot understate a refund to get under a cap, and cannot overstate one
 * by arithmetic error. The cap is then applied to Shopify's figure, because that
 * is the only figure that exists.
 */

const PARTIAL_REFUND_MUTATION = `mutation partialRefundCreate($input: RefundInput!, $idempotencyKey: String) {
  refundCreate(input: $input, idempotencyKey: $idempotencyKey) {
    refund {
      id
      totalRefundedSet { presentmentMoney { amount } }
      transactions(first: 20) {
        nodes { status amountSet { presentmentMoney { amount } } }
      }
    }
    userErrors { field message }
  }
}`;

interface RefundCalculationLineItem {
  line_item_id?: number | string;
  quantity?: number;
  restock_type?: string;
  location_id?: number | string | null;
  subtotal?: string;
  total_tax?: string;
}

interface PartialRefundCalculation {
  refund?: {
    currency?: string;
    refund_line_items?: RefundCalculationLineItem[];
    transactions?: { amount?: string; gateway?: string; parent_id?: number; kind?: string }[];
    suggested_transactions?: { amount?: string; gateway?: string; parent_id?: number; kind?: string }[];
  };
}

interface RefundCreateData {
  refundCreate: {
    refund?: {
      id: string;
      totalRefundedSet?: { presentmentMoney?: { amount?: string } };
      transactions?: { nodes?: { status?: string }[] };
    } | null;
    userErrors?: ShopifyGraphqlUserError[];
  };
}

function refundableQuantity(lineItem: ShopifyOrderLineItem): number {
  const quantity = lineItem.current_quantity ?? lineItem.quantity;
  return Number.isFinite(quantity) ? Math.max(quantity, 0) : 0;
}

export interface RequestedRefundItem {
  lineItemId: string;
  quantity: number;
}

export function parseRefundItems(value: unknown): RequestedRefundItem[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ShopifyInputError("items must name at least one line item and quantity.");
  }
  const items = value.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new ShopifyInputError("each item must be an object with line_item_id and quantity.");
    }
    const record = entry as Record<string, unknown>;
    const lineItemId = String(record.line_item_id ?? "").trim();
    if (!lineItemId) throw new ShopifyInputError("each item needs a line_item_id.");
    const quantity = Number(record.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ShopifyInputError(`quantity for line item ${lineItemId} must be a positive whole number.`);
    }
    return { lineItemId, quantity };
  });
  const ids = items.map((item) => item.lineItemId);
  if (new Set(ids).size !== ids.length) {
    throw new ShopifyInputError("items names the same line item more than once.");
  }
  return items;
}

/**
 * Whether every requested item exists on the order with enough left to refund.
 *
 * Returned as a list rather than the first problem so the merchant sees the
 * whole mismatch at once.
 */
export function unrefundableItems(
  order: ShopifyOrder,
  items: readonly RequestedRefundItem[],
): string[] {
  const available = new Map<string, number>();
  for (const lineItem of order.line_items ?? []) {
    if (lineItem.id === undefined || lineItem.id === null) continue;
    available.set(String(lineItem.id), refundableQuantity(lineItem));
  }

  const problems: string[] = [];
  for (const item of items) {
    const refundable = available.get(item.lineItemId);
    if (refundable === undefined) {
      problems.push(`line item ${item.lineItemId} is not on this order`);
      continue;
    }
    if (item.quantity > refundable) {
      problems.push(
        `line item ${item.lineItemId} has ${refundable} refundable, not ${item.quantity}`,
      );
    }
  }
  return problems;
}

function gid(resource: "Order" | "LineItem" | "OrderTransaction", id: string | number): string {
  return `gid://shopify/${resource}/${id}`;
}

export async function createPartialRefund(
  input: CreatePartialRefundInput,
  ctx: ShopifyContext,
  settings: OrgSettings,
): Promise<RefundToolResult> {
  let mutationStarted = false;
  let orderId = "";
  try {
    orderId = requireNumericId(input.order_id, "order_id");
    const items = parseRefundItems(input.items);
    const note = typeof input.reason === "string" ? input.reason.trim() : "";

    const orderData = await shopifyRestJson<{ order?: ShopifyOrder }>(
      ctx,
      `orders/${orderId}.json`,
      { query: { fields: "id,name,currency,line_items,financial_status,refunds" } },
    );
    const order = orderData.order;
    if (!order) {
      return {
        ...toolPolicyBlock(
          `Error: refund policy blocked - order ${orderId} could not be resolved at Shopify.`,
          { code: "order_unresolved" },
        ),
        refundedCents: null,
      };
    }

    const financialStatus = order.financial_status?.toLowerCase() ?? "unknown";
    if (financialStatus !== "paid") {
      return {
        ...toolPolicyBlock(
          `Error: refund policy blocked - order ${orderId} has financial status "${financialStatus}"; only a fully paid order can be partially refunded by the agent.`,
          { code: "order_not_paid", financialStatus },
        ),
        refundedCents: null,
      };
    }

    // A prior refund is escalated rather than stacked. Two refunds on one order
    // is also what would make the reconciliation probe ambiguous, so this guard
    // is what keeps an unknown outcome answerable.
    if ((order.refunds?.length ?? 0) > 0) {
      return {
        ...toolPolicyBlock(
          `Error: refund policy blocked - order ${orderId} already has a refund record and requires merchant review.`,
          { code: "prior_refund" },
        ),
        refundedCents: null,
      };
    }

    const problems = unrefundableItems(order, items);
    if (problems.length > 0) {
      return {
        ...toolPolicyBlock(
          `Error: refund policy blocked - ${problems.join("; ")}.`,
          { code: "line_items_unrefundable" },
        ),
        refundedCents: null,
      };
    }

    // Shopify prices the selection. Shipping is not refunded: a partial return
    // of goods does not undo the delivery that was already performed.
    const calculation = await shopifyRestJson<PartialRefundCalculation>(
      ctx,
      `orders/${orderId}/refunds/calculate.json`,
      {
        method: "POST",
        body: {
          refund: {
            shipping: { full_refund: false },
            refund_line_items: items.map((item) => ({
              line_item_id: item.lineItemId,
              quantity: item.quantity,
              restock_type: "no_restock",
            })),
          },
        },
      },
    );

    const currency = calculation.refund?.currency?.toUpperCase()
      ?? order.currency?.toUpperCase();
    const suggested = calculation.refund?.transactions
      ?? calculation.refund?.suggested_transactions
      ?? [];
    if (suggested.length === 0) {
      return {
        ...toolPolicyBlock(
          "Error: refund policy blocked - Shopify calculated no refundable amount for those items.",
          { code: "no_refundable_balance" },
        ),
        refundedCents: null,
      };
    }

    const calculatedCents = suggested.reduce(
      (total, transaction) => total + moneyToCents(transaction.amount ?? "0"),
      0,
    );
    if (calculatedCents <= 0) {
      return {
        ...toolPolicyBlock(
          "Error: refund policy blocked - Shopify calculated a zero refund for those items.",
          { code: "no_refundable_balance" },
        ),
        refundedCents: null,
      };
    }

    // The cap applies to Shopify's figure, because that is the only amount that
    // exists. The static policy cannot do this: it runs before the calculation.
    const perCallCap = settings.maxRefundAmount;
    if (perCallCap !== null && perCallCap > 0 && calculatedCents > Math.round(perCallCap * 100)) {
      return {
        ...toolPolicyBlock(
          `Error: refund policy blocked - those items come to $${centsToMoney(calculatedCents)}, over the workspace limit of $${perCallCap}.`,
          { code: "amount_over_cap", calculatedCents, capCents: Math.round(perCallCap * 100) },
        ),
        refundedCents: null,
      };
    }

    const idempotencyKey = shopifyIdempotencyKey(ctx.operationId);
    mutationStarted = true;
    const data = await shopifyGraphql<RefundCreateData>(ctx, PARTIAL_REFUND_MUTATION, {
      input: {
        orderId: gid("Order", orderId),
        notify: true,
        note,
        ...(currency ? { currency } : {}),
        shipping: { fullRefund: false },
        refundLineItems: items.map((item) => ({
          lineItemId: gid("LineItem", item.lineItemId),
          quantity: item.quantity,
          restockType: "NO_RESTOCK",
        })),
        transactions: suggested.map((transaction) => ({
          orderId: gid("Order", orderId),
          gateway: transaction.gateway,
          kind: "REFUND",
          amount: transaction.amount,
          ...(transaction.parent_id
            ? { parentId: gid("OrderTransaction", transaction.parent_id) }
            : {}),
        })),
      },
      idempotencyKey,
    }, { maxRetries: 1 });

    const userError = formatUserErrors(data.refundCreate.userErrors);
    if (userError) {
      return { ...toolError(`Error: failed to create refund - ${userError}`), refundedCents: null };
    }

    const refund = data.refundCreate.refund;
    if (!refund) {
      return {
        ...toolUnknown(`Unknown: Shopify accepted the partial refund for order ${orderId} but did not return a refund. Do not retry or confirm it to the customer until it is reconciled.`),
        refundedCents: null,
      };
    }

    const statuses = (refund.transactions?.nodes ?? [])
      .map((transaction) => transaction.status?.toUpperCase())
      .filter((status): status is string => Boolean(status));
    if (statuses.length === 0 || statuses.some((status) => status !== "SUCCESS")) {
      return {
        ...toolUnknown(`Unknown: Shopify created refund ${refund.id} for order ${orderId}, but its payment status is ${statuses.join(", ") || "unavailable"}. Do not retry or confirm it to the customer until it is reconciled.`),
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
    const unitCount = items.reduce((total, item) => total + item.quantity, 0);
    return {
      ...toolOk(
        `Refunded $${centsToMoney(totalRefunded)} for ${unitCount} item(s) on order ${orderId}.`
        + `${note ? ` Reason: ${note}.` : ""}`,
      ),
      refundedCents: totalRefunded,
    };
  } catch (err) {
    if (err instanceof ShopifyInputError) {
      return { ...toolError(`Error: ${err.message}`), refundedCents: null };
    }
    if (mutationStarted && isAmbiguousShopifyMutationError(err)) {
      return {
        ...toolUnknown(`Unknown: a partial refund for order ${orderId} may have been created at Shopify but could not be confirmed. Do not retry or confirm it to the customer until it is reconciled. ${formatShopifyToolError("partial refund reconciliation failed", err)}`),
        refundedCents: null,
      };
    }
    return {
      ...toolError(formatShopifyToolError("failed to create partial refund", err)),
      refundedCents: null,
    };
  }
}
