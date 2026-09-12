import type { CreateExchangeInput } from "../tools/index.js";
import {
  formatShopifyToolError,
  isAmbiguousShopifyMutationError,
  shopifyGraphql,
  type ShopifyContext,
} from "./client.js";
import {
  toolError,
  toolNotFound,
  toolOk,
  toolPolicyBlock,
  toolUnknown,
  type ReceiptV1,
  type ToolResult,
} from "../tools/result.js";
import { shopifyFailureReceipt, shopifyReceiptEnvelope } from "./receipts.js";
import { moneyToCents, optionalPositiveInteger, requireNumericId } from "./validation.js";
import { fetchReturnableLineItems, mapReturnReason, runReturnCreate, type ReturnWatchToolData } from "./returns.js";

interface VariantPricesData {
  nodes: ({
    id: string;
    title?: string | null;
    price?: string | null;
    product?: { title?: string | null } | null;
  } | null)[];
}

// Shared with the flash-sale variant load, which uses the titles. Exchanges and
// that caller both ignore `inventoryQuantity`; it stays because the document is
// shared and other readers of this query still ask for stock.
export const VARIANT_PRICES_QUERY = `query variantPrices($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on ProductVariant {
      id
      title
      price
      inventoryQuantity
      product { title }
    }
  }
}`;

function variantDisplayName(variant: { title?: string | null; product?: { title?: string | null } | null }): string {
  const product = variant.product?.title ?? null;
  const title = variant.title && variant.title !== "Default Title" ? variant.title : null;
  return [product, title].filter(Boolean).join(" - ") || "item";
}

function exchangeFailure(
  ctx: ShopifyContext,
  orderId: string,
  result: ToolResult,
  outcome: "rejected" | "failed" | "not_found",
  code: string,
): ToolResult {
  const receipt = shopifyFailureReceipt(
    ctx,
    { kind: "order", id: orderId },
    "create_exchange",
    outcome,
    code,
  );
  return receipt ? { ...result, receipt } : result;
}

function unknownExchangeReceipt(
  ctx: ShopifyContext,
  orderId: string,
  code: string,
  providerReference: string | null = null,
): ReceiptV1 | undefined {
  const envelope = shopifyReceiptEnvelope(ctx, { kind: "order", id: orderId });
  return envelope ? {
    ...envelope,
    tool: "create_exchange",
    outcome: "unknown",
    code,
    providerReference,
  } : undefined;
}

export async function createExchange(
  input: CreateExchangeInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  let mutationStarted = false;
  try {
    const orderId = requireNumericId(input.order_id, "order_id");
    const returnVariantId = requireNumericId(input.variant_id, "variant_id");
    const exchangeVariantId = requireNumericId(input.exchange_variant_id, "exchange_variant_id");
    const quantity = optionalPositiveInteger(input.quantity, "quantity", 1);
    const returnReason = mapReturnReason(input.reason);

    if (returnVariantId === exchangeVariantId) {
      return exchangeFailure(
        ctx,
        orderId,
        toolPolicyBlock("Error: could not set up exchange - the replacement variant is the same as the item being returned."),
        "rejected",
        "same_variant",
      );
    }

    const orderGid = `gid://shopify/Order/${orderId}`;
    const returnVariantGid = `gid://shopify/ProductVariant/${returnVariantId}`;
    const exchangeVariantGid = `gid://shopify/ProductVariant/${exchangeVariantId}`;

    const returnable = await fetchReturnableLineItems(ctx, orderGid);
    if (!returnable) {
      return exchangeFailure(
        ctx,
        orderId,
        toolNotFound(`Order ${orderId} was not returned by Shopify.`),
        "not_found",
        "order_not_found",
      );
    }

    const selected = returnable.filter((item) => item.variantId === returnVariantGid);
    if (selected.length === 0) {
      return exchangeFailure(
        ctx,
        orderId,
        toolPolicyBlock(`Error: could not set up exchange - variant ${returnVariantId} is not a returnable item on order ${orderId}. It may not have shipped yet, or was already returned.`),
        "rejected",
        "variant_not_returnable",
      );
    }

    const returnableQuantity = selected.reduce((sum, item) => sum + item.quantity, 0);
    if (quantity > returnableQuantity) {
      return exchangeFailure(
        ctx,
        orderId,
        toolPolicyBlock(`Error: could not set up exchange - only ${returnableQuantity} unit(s) of this item can still be returned on order ${orderId}.`),
        "rejected",
        "quantity_not_returnable",
      );
    }

    const priceData = await shopifyGraphql<VariantPricesData>(
      ctx,
      VARIANT_PRICES_QUERY,
      { ids: [returnVariantGid, exchangeVariantGid] }
    );

    const variants = new Map(
      (priceData.nodes ?? []).flatMap((node) => (node?.id ? [[node.id, node] as const] : []))
    );
    const returnedVariant = variants.get(returnVariantGid);
    const replacementVariant = variants.get(exchangeVariantGid);

    if (!replacementVariant?.price) {
      return exchangeFailure(
        ctx,
        orderId,
        toolNotFound(`Replacement variant ${exchangeVariantId} was not returned by Shopify.`),
        "not_found",
        "replacement_variant_not_found",
      );
    }
    if (!returnedVariant?.price) {
      return exchangeFailure(
        ctx,
        orderId,
        toolPolicyBlock("Error: could not set up exchange - the returned item's variant no longer exists in the catalog, so prices cannot be compared. Escalate to the merchant."),
        "rejected",
        "returned_variant_price_unavailable",
      );
    }
    if (moneyToCents(replacementVariant.price) > moneyToCents(returnedVariant.price)) {
      return exchangeFailure(
        ctx,
        orderId,
        toolPolicyBlock(`Error: could not set up exchange - the replacement costs more ($${replacementVariant.price} vs $${returnedVariant.price}), so the customer would owe a balance. Escalate to the merchant to handle the price difference.`),
        "rejected",
        "replacement_price_higher",
      );
    }

    const returnLineItems: { fulfillmentLineItemId: string; quantity: number; returnReason: string }[] = [];
    let remaining = quantity;
    for (const item of selected) {
      if (remaining <= 0) break;
      const take = Math.min(item.quantity, remaining);
      returnLineItems.push({
        fulfillmentLineItemId: item.fulfillmentLineItemId,
        quantity: take,
        returnReason,
      });
      remaining -= take;
    }

    mutationStarted = true;
    const created = await runReturnCreate(ctx, {
      orderId: orderGid,
      returnLineItems,
      exchangeLineItems: [{ variantId: exchangeVariantGid, quantity }],
    });

    if ("errorMessage" in created) {
      const result = created.outcome === "unknown"
        ? toolUnknown(`Unknown: Shopify may have opened the exchange return on order ${orderId}, but did not return a complete return record. Do not retry or confirm it to the customer until it is reconciled.`)
        : toolError(`Error: could not set up exchange - ${created.errorMessage}`);
      if (created.outcome === "unknown") {
        const receipt = unknownExchangeReceipt(ctx, orderId, created.code);
        return receipt ? { ...result, receipt } : result;
      }
      return exchangeFailure(ctx, orderId, result, "failed", created.code);
    }

    const returnId = created.createdReturn.id?.trim();
    const returnName = created.createdReturn.name?.trim();
    const returnStatus = created.createdReturn.status?.trim();
    if (!returnId || !returnName || !returnStatus) {
      const result = toolUnknown(
        `Unknown: Shopify opened an exchange return on order ${orderId}, but did not return complete confirmed return state. Do not retry or confirm it to the customer until it is reconciled.`,
      );
      const receipt = unknownExchangeReceipt(
        ctx,
        orderId,
        "confirmed_state_incomplete",
        returnId || null,
      );
      return receipt ? { ...result, receipt } : result;
    }
    const returnedName = selected[0].name;
    const replacementName = variantDisplayName(replacementVariant);
    const envelope = shopifyReceiptEnvelope(ctx, { kind: "order", id: orderId });
    const receipt: ReceiptV1 | undefined = envelope ? {
      ...envelope,
      tool: "create_exchange",
      outcome: "succeeded",
      providerReference: returnId,
      facts: {
        orderId,
        returnId,
        returnName,
        status: returnStatus,
        returnedItems: returnLineItems.map((item) => ({
          variantId: returnedVariant.id,
          fulfillmentLineItemId: item.fulfillmentLineItemId,
          quantity: item.quantity,
        })),
        replacementItems: [{ variantId: replacementVariant.id, quantity }],
        // returnCreate does not expose a money-set or transaction. Do not infer
        // one from the catalog price comparison used as a precondition.
        financialConsequence: null,
      },
    } : undefined;
    const result = toolOk(
      `Opened exchange ${returnName} (status ${returnStatus}) on order ${orderId}: returning ${quantity}x ${returnedName} in exchange for ${quantity}x ${replacementName}. No refund was issued and the customer was not charged. The replacement ships once the return is processed in Shopify. Tell the customer the exchange is set up and how to send the item back.`,
      {
        returnWatch: {
          shopifyReturnId: returnId,
          returnName,
          orderId,
          tool: "create_exchange",
        },
      } satisfies ReturnWatchToolData,
    );
    return receipt ? { ...result, receipt } : result;
  } catch (err) {
    if (mutationStarted && isAmbiguousShopifyMutationError(err)) {
      const result = toolUnknown(
        `Unknown: the exchange return may have been opened at Shopify, but it could not be confirmed. Do not create another exchange, retry, or tell the customer the exchange is set up until order ${input.order_id} is reviewed. ${formatShopifyToolError("exchange reconciliation failed", err)}`,
      );
      const receipt = unknownExchangeReceipt(
        ctx,
        input.order_id.trim() || "invalid",
        "ambiguous_provider_response",
      );
      return receipt ? { ...result, receipt } : result;
    }
    return exchangeFailure(
      ctx,
      input.order_id.trim() || "invalid",
      toolError(formatShopifyToolError("failed to set up exchange", err)),
      "failed",
      "definite_failure",
    );
  }
}
