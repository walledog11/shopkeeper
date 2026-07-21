import type { CreateExchangeInput } from "../tools/index.js";
import { formatShopifyToolError, shopifyGraphql, type ShopifyContext } from "./client.js";
import { toolError, toolOk, type ToolResult } from "../tools/result.js";
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

function variantDisplayName(variant: { title?: string | null; product?: { title?: string | null } | null }): string {
  const product = variant.product?.title ?? null;
  const title = variant.title && variant.title !== "Default Title" ? variant.title : null;
  return [product, title].filter(Boolean).join(" - ") || "item";
}

export async function createExchange(
  input: CreateExchangeInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  try {
    const orderId = requireNumericId(input.order_id, "order_id");
    const returnVariantId = requireNumericId(input.variant_id, "variant_id");
    const exchangeVariantId = requireNumericId(input.exchange_variant_id, "exchange_variant_id");
    const quantity = optionalPositiveInteger(input.quantity, "quantity", 1);
    const returnReason = mapReturnReason(input.reason);

    if (returnVariantId === exchangeVariantId) {
      return toolError("Error: could not set up exchange - the replacement variant is the same as the item being returned.");
    }

    const orderGid = `gid://shopify/Order/${orderId}`;
    const returnVariantGid = `gid://shopify/ProductVariant/${returnVariantId}`;
    const exchangeVariantGid = `gid://shopify/ProductVariant/${exchangeVariantId}`;

    const returnable = await fetchReturnableLineItems(ctx, orderGid);
    if (!returnable) {
      return toolError(`Error: failed to set up exchange - order ${orderId} was not found.`);
    }

    const selected = returnable.filter((item) => item.variantId === returnVariantGid);
    if (selected.length === 0) {
      return toolError(`Error: could not set up exchange - variant ${returnVariantId} is not a returnable item on order ${orderId}. It may not have shipped yet, or was already returned.`);
    }

    const returnableQuantity = selected.reduce((sum, item) => sum + item.quantity, 0);
    if (quantity > returnableQuantity) {
      return toolError(`Error: could not set up exchange - only ${returnableQuantity} unit(s) of this item can still be returned on order ${orderId}.`);
    }

    const priceData = await shopifyGraphql<VariantPricesData>(
      ctx,
      `query variantPrices($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            id
            title
            price
            product { title }
          }
        }
      }`,
      { ids: [returnVariantGid, exchangeVariantGid] }
    );

    const variants = new Map(
      (priceData.nodes ?? []).flatMap((node) => (node?.id ? [[node.id, node] as const] : []))
    );
    const returnedVariant = variants.get(returnVariantGid);
    const replacementVariant = variants.get(exchangeVariantGid);

    if (!replacementVariant?.price) {
      return toolError(`Error: could not set up exchange - replacement variant ${exchangeVariantId} was not found in the catalog.`);
    }
    if (!returnedVariant?.price) {
      return toolError("Error: could not set up exchange - the returned item's variant no longer exists in the catalog, so prices cannot be compared. Escalate to the merchant.");
    }
    if (moneyToCents(replacementVariant.price) > moneyToCents(returnedVariant.price)) {
      return toolError(`Error: could not set up exchange - the replacement costs more ($${replacementVariant.price} vs $${returnedVariant.price}), so the customer would owe a balance. Escalate to the merchant to handle the price difference.`);
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

    const created = await runReturnCreate(ctx, {
      orderId: orderGid,
      returnLineItems,
      exchangeLineItems: [{ variantId: exchangeVariantGid, quantity }],
    });

    if ("errorMessage" in created) {
      return toolError(`Error: could not set up exchange - ${created.errorMessage}`);
    }

    const label = created.createdReturn.name ?? created.createdReturn.id;
    const returnedName = selected[0].name;
    const replacementName = variantDisplayName(replacementVariant);
    return toolOk(
      `Opened exchange ${label} (status ${created.createdReturn.status ?? "REQUESTED"}) on order ${orderId}: returning ${quantity}x ${returnedName} in exchange for ${quantity}x ${replacementName}. No refund was issued and the customer was not charged. The replacement ships once the return is processed in Shopify. Tell the customer the exchange is set up and how to send the item back.`,
      {
        returnWatch: {
          shopifyReturnId: created.createdReturn.id,
          returnName: created.createdReturn.name ?? null,
          orderId,
          tool: "create_exchange",
        },
      } satisfies ReturnWatchToolData,
    );
  } catch (err) {
    return toolError(formatShopifyToolError("failed to set up exchange", err));
  }
}
