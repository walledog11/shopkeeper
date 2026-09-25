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
import { toolError, toolOk, toolPolicyBlock, toolUnknown, type ReceiptV1, type ToolResult } from "../tools/result.js";
import { shopifyFailureReceipt, shopifyReceiptEnvelope } from "./receipts.js";
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
          id?: string | null;
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
                id
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

function unknownRefundReceipt(
  ctx: ShopifyContext,
  orderId: string,
  code: string,
  providerReference: string | null = null,
): ReceiptV1 | undefined {
  const envelope = shopifyReceiptEnvelope(ctx, { kind: "order", id: orderId });
  return envelope ? {
    ...envelope,
    tool: "create_refund",
    outcome: "unknown",
    code,
    providerReference,
  } : undefined;
}

function refundNoEffect(
  ctx: ShopifyContext,
  orderId: string,
  result: ToolResult,
  outcome: "rejected" | "failed" | "not_found",
  code: string,
): RefundResult {
  const receipt = shopifyFailureReceipt(
    ctx,
    { kind: "order", id: orderId },
    "create_refund",
    outcome,
    code,
  );
  return { ...result, refundedCents: null, ...(receipt ? { receipt } : {}) };
}

interface PreparedFullRefund {
  orderId: string;
  note: string;
  currency: string;
  refundLineItems: ShopifyCalculatedRefundLineItem[];
  calculation: RefundCalculation;
  transactions: ShopifyTransaction[];
  refundableCents: number;
}

async function prepareFullRefund(
  input: CreateRefundInput,
  ctx: ShopifyContext,
  requireApprovedQuote: boolean,
): Promise<PreparedFullRefund | RefundResult> {
  const orderId = requireNumericId(input.order_id, "order_id");
  const approvedAmount = requireApprovedQuote ? requireAmount(input.amount, "amount") : null;
  const approvedCents = approvedAmount === null ? null : moneyToCents(approvedAmount);
  const approvedCurrency = requireApprovedQuote
    ? optionalString(input.currency)?.toUpperCase()
    : undefined;
  const note = optionalString(input.reason) ?? "";

  const orderData = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}.json`, {
    query: { fields: "id,name,currency,line_items,total_price,current_total_price,financial_status,refunds" },
  });

  if (!orderData.order) {
    return refundNoEffect(
      ctx,
      orderId,
      toolPolicyBlock(`Error: refund policy blocked - order ${orderId} could not be resolved at Shopify.`, { code: "order_unresolved" }),
      "rejected",
      "order_unresolved",
    );
  }

  const financialStatus = orderData.order.financial_status?.toLowerCase() ?? "unknown";
  if (financialStatus !== "paid") {
    return refundNoEffect(ctx, orderId, toolPolicyBlock(`Error: refund policy blocked - order ${orderId} has financial status "${financialStatus}"; only a fully paid order with no prior refund can be refunded by the agent.`, { code: "order_not_paid", financialStatus }), "rejected", "order_not_paid");
  }
  if ((orderData.order.refunds?.length ?? 0) > 0) {
    return refundNoEffect(ctx, orderId, toolPolicyBlock(`Error: refund policy blocked - order ${orderId} already has a refund record and requires merchant review.`, { code: "prior_refund" }), "rejected", "prior_refund");
  }

  const refundLineItems = buildRefundLineItems(orderData.order);
  if (refundLineItems.length === 0) {
    return refundNoEffect(ctx, orderId, toolPolicyBlock("Error: refund policy blocked - Shopify returned no refundable line items for the complete order.", { code: "no_refundable_line_items" }), "rejected", "no_refundable_line_items");
  }

  const calculation = await calculateRefund(ctx, orderId, refundLineItems);
  // A refund settles in the currency the customer was charged, which Shopify
  // returns here. `order.currency` is the shop's own currency and can differ on
  // international orders.
  const currency = calculation.refund?.currency?.toUpperCase()
    ?? orderData.order.currency?.toUpperCase();
  if (!currency) {
    return refundNoEffect(ctx, orderId, toolPolicyBlock("Error: refund policy blocked - Shopify returned no refund currency.", { code: "currency_missing" }), "rejected", "currency_missing");
  }
  if (approvedCurrency && approvedCurrency !== currency) {
    return refundNoEffect(ctx, orderId, toolPolicyBlock(`Error: refund policy blocked - approved currency ${approvedCurrency} does not match Shopify currency ${currency}.`, { code: "currency_mismatch", approvedCurrency, currency }), "rejected", "currency_mismatch");
  }

  const transactions = buildFullRefundTransactions(calculation);
  if (transactions.length === 0) {
    return refundNoEffect(ctx, orderId, toolPolicyBlock("Error: refund policy blocked - Shopify did not return a complete refundable balance.", { code: "no_refundable_balance" }), "rejected", "no_refundable_balance");
  }
  if (transactions.some(transaction => transaction.currency && transaction.currency.toUpperCase() !== currency)) {
    return refundNoEffect(ctx, orderId, toolPolicyBlock(`Error: refund policy blocked - a refundable transaction uses a different currency from the ${currency} refund.`, { code: "currency_mismatch", currency }), "rejected", "currency_mismatch");
  }
  const refundableCents = transactions.reduce(
    (total, transaction) => total + moneyToCents(transaction.amount),
    0,
  );
  if (approvedCents !== null && approvedCents !== refundableCents) {
    return refundNoEffect(ctx, orderId, toolPolicyBlock(
      `Error: refund policy blocked - Shopify now calculates ${centsToMoney(refundableCents)} ${currency}, not the approved ${centsToMoney(approvedCents)} ${currency}; ask for approval again.`,
      { code: "amount_mismatch", approvedCents, refundableCents, currency },
    ), "rejected", "amount_mismatch");
  }

  return { orderId, note, currency, refundLineItems, calculation, transactions, refundableCents };
}

/** Bind Shopify's current complete refundable balance into the proposal. */
export async function quoteFullRefundForApproval(
  input: CreateRefundInput,
  ctx: ShopifyContext,
): Promise<CreateRefundInput> {
  const prepared = await prepareFullRefund(input, ctx, false);
  if ("status" in prepared) throw new ShopifyInputError(prepared.message);
  return {
    ...input,
    amount: centsToMoney(prepared.refundableCents),
    currency: prepared.currency,
  };
}

export async function createRefund(
  input: CreateRefundInput,
  ctx: ShopifyContext
): Promise<RefundResult> {
  let mutationStarted = false;
  try {
    const prepared = await prepareFullRefund(input, ctx, true);
    if ("status" in prepared) return prepared;
    const { orderId, note, currency, refundLineItems, calculation, transactions } = prepared;

    const idempotencyKey = shopifyIdempotencyKey(ctx.operationId);
    const refundInput = {
      orderId: gid("Order", orderId),
      notify: true,
      note,
      ...(currency ? { currency } : {}),
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
      return refundNoEffect(ctx, orderId, toolError(`Error: failed to create refund - ${userError}`), "failed", "provider_rejected");
    }

    const refund = data.refundCreate.refund;
    if (!refund) {
      const receipt = unknownRefundReceipt(ctx, orderId, "provider_refund_missing");
      return {
        ...toolUnknown(`Unknown: Shopify accepted the refund request for order ${orderId} but did not return a refund. Do not retry or confirm it to the customer until it is reconciled.`),
        refundedCents: null,
        ...(receipt ? { receipt } : {}),
      };
    }

    const transactionNodes = refund.transactions?.nodes ?? [];
    const transactionStatuses = transactionNodes
      .map((transaction) => transaction.status?.toUpperCase())
      .filter((status): status is string => Boolean(status));
    if (transactionStatuses.length === 0 || transactionStatuses.some((status) => status !== "SUCCESS")) {
      const receipt = unknownRefundReceipt(ctx, orderId, "transaction_not_successful", refund.id);
      return {
        ...toolUnknown(`Unknown: Shopify created refund ${refund.id} for order ${orderId}, but its payment status is ${transactionStatuses.join(", ") || "unavailable"}. Do not retry or confirm it to the customer until it is reconciled.`),
        refundedCents: null,
        ...(receipt ? { receipt } : {}),
      };
    }

    const refundedAmount = refund.totalRefundedSet?.presentmentMoney?.amount;
    if (!refundedAmount) {
      const receipt = unknownRefundReceipt(ctx, orderId, "committed_amount_missing", refund.id);
      return {
        ...toolUnknown(`Unknown: Shopify created refund ${refund.id} for order ${orderId}, but did not return the committed amount. Do not retry or confirm it to the customer until it is reconciled.`),
        refundedCents: null,
        ...(receipt ? { receipt } : {}),
      };
    }
    const transactionReferences = transactionNodes
      .map((transaction) => transaction.id?.trim())
      .filter((id): id is string => Boolean(id));
    if (!refund.id?.trim() || transactionReferences.length !== transactionNodes.length) {
      const receipt = unknownRefundReceipt(
        ctx,
        orderId,
        "provider_reference_missing",
        refund.id?.trim() || null,
      );
      return {
        ...toolUnknown(`Unknown: Shopify created a refund for order ${orderId}, but did not return complete provider references. Do not retry or confirm it to the customer until it is reconciled.`),
        refundedCents: null,
        ...(receipt ? { receipt } : {}),
      };
    }
    const totalRefunded = moneyToCents(refundedAmount);
    const envelope = shopifyReceiptEnvelope(ctx, { kind: "order", id: orderId });
    const receipt: ReceiptV1 | undefined = envelope ? {
      ...envelope,
      tool: "create_refund",
      outcome: "succeeded",
      providerReference: refund.id,
      facts: {
        orderId,
        refundId: refund.id,
        amount: refundedAmount,
        currency,
        transactionStatus: "SUCCESS",
        transactionReference: transactionReferences.join(","),
        classification: "full",
      },
    } : undefined;

    return {
      ...toolOk(`Refund of $${centsToMoney(totalRefunded)} issued successfully for order ${orderId}.${note ? ` Reason: ${note}.` : ""}`),
      refundedCents: totalRefunded,
      ...(receipt ? { receipt } : {}),
    };
  } catch (err) {
    if (mutationStarted && isAmbiguousShopifyMutationError(err)) {
      const receipt = unknownRefundReceipt(ctx, input.order_id, "provider_response_ambiguous");
      return {
        ...toolUnknown(`Unknown: the refund request may have committed at Shopify, but its final state could not be confirmed. Do not retry or confirm it to the customer until it is reconciled. ${formatShopifyToolError("refund reconciliation failed", err)}`),
        refundedCents: null,
        ...(receipt ? { receipt } : {}),
      };
    }
    if (!mutationStarted && err instanceof ShopifyInputError) {
      return refundNoEffect(ctx, input.order_id.trim() || "invalid", toolPolicyBlock(`Error: refund policy blocked - ${err.message}`, { code: "invalid_refund_input" }), "rejected", "invalid_refund_input");
    }
    return refundNoEffect(ctx, input.order_id.trim() || "invalid", toolError(formatShopifyToolError("failed to create refund", err)), "failed", mutationStarted ? "provider_definite_failure" : "preflight_failed");
  }
}
