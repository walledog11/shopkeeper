import type { CancelOrderInput, CreateGiftCardInput, CreateRefundInput, CreateShopifyOrderInput, EditShopifyOrderInput, IssueStoreCreditInput, UpdateShopifyOrderAddressInput } from "../tools/index.js";
import { buildOrderAddress } from "./order-address.js";
import {
  formatShopifyToolError,
  shopifyGraphql,
  shopifyIdempotencyKey,
  shopifyRestJson,
  type ShopifyContext,
} from "./client.js";
import type { ShopifyOrder, ShopifyOrderLineItem } from "./types.js";
import { moneyToCents, optionalPositiveInteger, optionalString, requireAmount, requireNumericId } from "./validation.js";

export type ShopifyReconciliationProbeResult =
  | { outcome: "committed"; message: string; spentCents?: number | null }
  | { outcome: "no_effect"; message: string }
  | { outcome: "still_unknown"; message: string };

const OPERATION_TAG_PREFIX = "shopkeeper-op-";

export const RECONCILABLE_SHOPIFY_MUTATION_TOOLS = new Set([
  "create_refund",
  "cancel_order",
  "create_shopify_order",
  "create_gift_card",
  "issue_store_credit",
  "edit_shopify_order",
  "update_shopify_order_address",
]);

function operationTag(operationId?: string): string | null {
  if (!operationId) return null;
  return `${OPERATION_TAG_PREFIX}${shopifyIdempotencyKey(operationId)}`;
}

function giftCardCode(operationId?: string): string | null {
  if (!operationId) return null;
  return shopifyIdempotencyKey(operationId).replaceAll("-", "").slice(0, 20);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stillUnknown(message: string): ShopifyReconciliationProbeResult {
  return { outcome: "still_unknown", message };
}

function committed(message: string, spentCents?: number | null): ShopifyReconciliationProbeResult {
  return { outcome: "committed", message, spentCents };
}

function noEffect(message: string): ShopifyReconciliationProbeResult {
  return { outcome: "no_effect", message };
}

async function probeRefund(
  input: CreateRefundInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const orderId = requireNumericId(input.order_id, "order_id");
  const requestedAmount = input.amount !== undefined ? requireAmount(input.amount, "amount") : null;
  const requestedCents = requestedAmount ? moneyToCents(requestedAmount) : null;

  const data = await shopifyRestJson<{ refunds?: Array<{ id: number; transactions?: Array<{ status?: string; amount?: string }> }> }>(
    ctx,
    `orders/${orderId}/refunds.json`,
    { maxRetries: 1 },
  );
  const refunds = data.refunds ?? [];
  const successful = refunds.filter((refund) => (
    (refund.transactions ?? []).some((transaction) => transaction.status?.toUpperCase() === "SUCCESS")
  ));
  const matches = successful.filter((refund) => {
    if (requestedCents === null) return true;
    const total = (refund.transactions ?? [])
      .filter((transaction) => transaction.status?.toUpperCase() === "SUCCESS")
      .reduce((sum, transaction) => sum + moneyToCents(transaction.amount ?? "0"), 0);
    return total === requestedCents;
  });

  if (matches.length === 1) {
    const total = (matches[0]!.transactions ?? [])
      .filter((transaction) => transaction.status?.toUpperCase() === "SUCCESS")
      .reduce((sum, transaction) => sum + moneyToCents(transaction.amount ?? "0"), 0);
    return committed(
      `Reconciled refund on order ${orderId} for $${(total / 100).toFixed(2)}.`,
      total,
    );
  }
  if (matches.length > 1) {
    return stillUnknown(`Multiple successful refunds match order ${orderId}; manual review required.`);
  }
  if (successful.length > 0 && requestedCents === null) {
    return stillUnknown(`Order ${orderId} has successful refunds but the requested amount is unknown.`);
  }
  return noEffect(`No successful refund matching order ${orderId} was found at Shopify.`);
}

async function probeCancellation(
  input: CancelOrderInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const orderId = requireNumericId(input.order_id, "order_id");
  const data = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}.json`, {
    query: { fields: "id,name,cancelled_at,cancel_reason,financial_status" },
    maxRetries: 1,
  });
  if (!data.order?.cancelled_at) {
    return noEffect(`Order ${orderId} is not cancelled at Shopify.`);
  }
  const expectedReason = (input.reason ?? "other").toLowerCase();
  const actualReason = data.order.cancel_reason?.toLowerCase();
  if (actualReason && actualReason !== expectedReason) {
    return stillUnknown(
      `Order ${orderId} is cancelled with reason "${actualReason}" instead of "${expectedReason}".`,
    );
  }
  return committed(`Reconciled cancellation for order ${data.order.name ?? orderId}.`);
}

async function probeCreatedOrder(
  input: CreateShopifyOrderInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const tag = operationTag(ctx.operationId);
  if (!tag) {
    return stillUnknown("Order creation reconciliation requires a stable operation identity.");
  }
  const data = await shopifyGraphql<{
    orders?: { nodes?: Array<{ legacyResourceId?: string | null; name?: string | null; tags?: string[] | null }> } | null;
  }>(ctx, `
    query FindShopkeeperCreatedOrder($query: String!) {
      orders(first: 2, query: $query, sortKey: CREATED_AT, reverse: true) {
        nodes { legacyResourceId name tags }
      }
    }
  `, { query: `tag:${tag}` }, { maxRetries: 1 });
  const matches = (data.orders?.nodes ?? []).filter((order) => order.tags?.includes(tag));
  if (matches.length === 1) {
    return committed(`Reconciled created order ${matches[0]!.name ?? matches[0]!.legacyResourceId ?? "unknown"}.`);
  }
  if (matches.length > 1) {
    return stillUnknown(`Multiple Shopify orders match operation tag ${tag}.`);
  }
  const email = optionalString(input.email);
  if (email) {
    return noEffect(`No Shopify order with operation tag ${tag} was found for ${email}.`);
  }
  return noEffect(`No Shopify order with operation tag ${tag} was found.`);
}

async function probeGiftCard(
  input: CreateGiftCardInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const code = giftCardCode(ctx.operationId);
  if (!code) {
    return stillUnknown("Gift-card reconciliation requires a stable operation identity.");
  }
  const amount = requireAmount(input.amount, "amount");
  const data = await shopifyGraphql<{
    giftCards?: {
      nodes?: Array<{
        id?: string | null;
        initialValue?: { amount?: string | null } | null;
        note?: string | null;
      }>;
    } | null;
  }>(ctx, `
    query GiftCardsByCode($query: String!) {
      giftCards(first: 2, query: $query) {
        nodes { id initialValue { amount } note }
      }
    }
  `, { query: `code:${code}` }, { maxRetries: 1 });
  const matches = (data.giftCards?.nodes ?? []).filter((card) => (
    card.id
    && moneyToCents(card.initialValue?.amount ?? "0") === moneyToCents(amount)
    && card.note?.includes(`Shopkeeper operation: ${code}`)
  ));
  if (matches.length === 1) {
    return committed(`Reconciled gift card with code ${code}.`, moneyToCents(amount));
  }
  if (matches.length > 1) {
    return stillUnknown(`Multiple gift cards match code ${code}.`);
  }
  return noEffect(`No gift card with code ${code} was found at Shopify.`);
}

async function probeStoreCredit(
  input: IssueStoreCreditInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const customerId = requireNumericId(input.customer_id, "customer_id");
  const amount = requireAmount(input.amount, "amount");
  const data = await shopifyGraphql<{
    customer?: {
      storeCreditAccounts?: {
        nodes?: Array<{
          transactions?: {
            nodes?: Array<{
              amount?: { amount?: string | null } | null;
              event?: string | null;
            }>;
          } | null;
        }>;
      } | null;
    } | null;
  }>(ctx, `
    query CustomerStoreCreditTransactions($id: ID!) {
      customer(id: $id) {
        storeCreditAccounts(first: 1) {
          nodes {
            transactions(first: 10, reverse: true) {
              nodes {
                amount { amount }
                event
              }
            }
          }
        }
      }
    }
  `, { id: `gid://shopify/Customer/${customerId}` }, { maxRetries: 1 });
  const transactions = data.customer?.storeCreditAccounts?.nodes?.[0]?.transactions?.nodes ?? [];
  const matches = transactions.filter((transaction) => (
    transaction.event === "CREDIT"
    && moneyToCents(transaction.amount?.amount ?? "0") === moneyToCents(amount)
  ));
  if (matches.length === 1) {
    return committed(`Reconciled $${amount} store credit for customer ${customerId}.`, moneyToCents(amount));
  }
  if (matches.length > 1) {
    return stillUnknown(`Multiple store-credit transactions match customer ${customerId} and amount $${amount}.`);
  }
  return noEffect(`No store-credit transaction matching $${amount} was found for customer ${customerId}.`);
}

function lineItemQuantity(item: ShopifyOrderLineItem): number {
  const quantity = item.current_quantity ?? item.quantity;
  return Number.isFinite(quantity) ? Math.max(quantity, 0) : 0;
}

function variantQuantities(order: ShopifyOrder): Map<string, number> {
  const quantities = new Map<string, number>();
  for (const item of order.line_items ?? []) {
    if (item.variant_id == null) continue;
    const key = String(item.variant_id);
    quantities.set(key, (quantities.get(key) ?? 0) + lineItemQuantity(item));
  }
  return quantities;
}

async function probeOrderEdit(
  input: EditShopifyOrderInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const orderId = requireNumericId(input.order_id, "order_id");
  const data = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}.json`, {
    query: { fields: "id,name,line_items" },
    maxRetries: 1,
  });
  if (!data.order) {
    return stillUnknown(`Order ${orderId} was not returned by Shopify during reconciliation.`);
  }
  const current = variantQuantities(data.order);
  const addVariantId = optionalString(input.variant_id);
  const removeVariantId = optionalString(input.remove_variant_id);
  if (!addVariantId && !removeVariantId) {
    return stillUnknown("Order-edit reconciliation requires variant_id or remove_variant_id.");
  }

  let committedEvidence = false;
  if (removeVariantId) {
    const key = requireNumericId(removeVariantId, "remove_variant_id");
    if ((current.get(key) ?? 0) === 0) {
      committedEvidence = true;
    }
  }
  if (addVariantId) {
    const key = requireNumericId(addVariantId, "variant_id");
    const quantity = optionalPositiveInteger(input.quantity, "quantity", 1);
    if ((current.get(key) ?? 0) >= quantity) {
      committedEvidence = true;
    }
  }

  if (committedEvidence) {
    return committed(`Reconciled order edit for order ${data.order.name ?? orderId}.`);
  }
  return noEffect(`Order ${orderId} does not reflect the requested edit at Shopify.`);
}

async function probeOrderAddress(
  input: UpdateShopifyOrderAddressInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const orderId = requireNumericId(input.order_id, "order_id");
  const expected = buildOrderAddress(input);
  const data = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}.json`, {
    query: { fields: "id,name,shipping_address" },
    maxRetries: 1,
  });
  const actual = data.order?.shipping_address;
  if (!actual) {
    return noEffect(`Order ${orderId} has no shipping address at Shopify.`);
  }
  const matches = ["address1", "city", "zip", "country"].every((field) => (
    String((actual as Record<string, unknown>)[field] ?? "").trim().toLowerCase()
      === String(expected[field] ?? "").trim().toLowerCase()
  ));
  if (matches) {
    return committed(`Reconciled shipping-address update for order ${data.order?.name ?? orderId}.`);
  }
  return noEffect(`Order ${orderId} shipping address does not match the requested update.`);
}

export async function probeUnknownShopifyMutation(
  tool: string,
  input: unknown,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const record = asRecord(input);
  if (!record) {
    return stillUnknown(`Tool ${tool} has no structured input to reconcile.`);
  }

  try {
    switch (tool) {
      case "create_refund":
        return await probeRefund(record as unknown as CreateRefundInput, ctx);
      case "cancel_order":
        return await probeCancellation(record as unknown as CancelOrderInput, ctx);
      case "create_shopify_order":
        return await probeCreatedOrder(record as unknown as CreateShopifyOrderInput, ctx);
      case "create_gift_card":
        return await probeGiftCard(record as unknown as CreateGiftCardInput, ctx);
      case "issue_store_credit":
        return await probeStoreCredit(record as unknown as IssueStoreCreditInput, ctx);
      case "edit_shopify_order":
        return await probeOrderEdit(record as unknown as EditShopifyOrderInput, ctx);
      case "update_shopify_order_address":
        return await probeOrderAddress(record as unknown as UpdateShopifyOrderAddressInput, ctx);
      default:
        return stillUnknown(`Tool ${tool} does not have a Shopify reconciliation probe.`);
    }
  } catch (error) {
    return stillUnknown(formatShopifyToolError(`${tool} reconciliation probe failed`, error));
  }
}
