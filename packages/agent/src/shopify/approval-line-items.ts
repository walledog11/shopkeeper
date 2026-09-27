import type {
  ApprovalLineItem,
  CreateExchangeInput,
  CreateReturnInput,
  EditShopifyOrderInput,
} from "../tools/registry/types.js";
import { shopifyGraphql, shopifyRestJson, type ShopifyContext } from "./client.js";
import { VARIANT_PRICES_QUERY, variantDisplayName } from "./exchanges.js";
import {
  allocateReturnQuantity,
  fetchReturnableLineItems,
  selectReturnLineItems,
} from "./returns.js";
import type { ShopifyOrder, ShopifyOrderLineItem } from "./types.js";
import { optionalPositiveInteger, requireNumericId, ShopifyInputError } from "./validation.js";

/**
 * Names the line items a write targets before it is approved.
 *
 * A line-item write carries only IDs, and the model chose them, so the card has
 * to say what they point at or a wrong line reads exactly like the right one.
 * Each lookup reads what its write reads to select the same lines, and never
 * starts a write. `null` means Shopify does not show the target the way the
 * write needs it, so there is nothing true to name.
 */

interface VariantNamesData {
  nodes: ({ id: string; title?: string | null; product?: { title?: string | null } | null } | null)[];
}

function variantGid(id: string): string {
  return `gid://shopify/ProductVariant/${id}`;
}

export function orderLineItemName(lineItem: Pick<ShopifyOrderLineItem, "title" | "variant_title">): string {
  return variantDisplayName({ title: lineItem.variant_title, product: { title: lineItem.title } });
}

async function variantNames(ctx: ShopifyContext, ids: string[]): Promise<Map<string, string>> {
  const data = await shopifyGraphql<VariantNamesData>(ctx, VARIANT_PRICES_QUERY, { ids: ids.map(variantGid) });
  return new Map((data.nodes ?? []).flatMap((node) => (
    node?.id ? [[node.id, variantDisplayName(node)] as const] : []
  )));
}

async function resolve(lookup: () => Promise<ApprovalLineItem[] | null>): Promise<ApprovalLineItem[] | null> {
  try {
    return await lookup();
  } catch (error) {
    // An ID the write would refuse as malformed names nothing. A provider error
    // is not an answer about the target, so it propagates.
    if (error instanceof ShopifyInputError) return null;
    throw error;
  }
}

export function returnApprovalLineItems(
  input: CreateReturnInput,
  ctx: ShopifyContext,
): Promise<ApprovalLineItem[] | null> {
  return resolve(async () => {
    const orderId = requireNumericId(input.order_id, "order_id");
    const returnable = await fetchReturnableLineItems(ctx, `gid://shopify/Order/${orderId}`);
    if (!returnable) return null;
    const selected = selectReturnLineItems(returnable, input.variant_id?.trim() || undefined);
    if (selected.length === 0) return null;
    return selected.map((item) => ({ name: item.name, quantity: item.quantity, change: "return" }));
  });
}

export function exchangeApprovalLineItems(
  input: CreateExchangeInput,
  ctx: ShopifyContext,
): Promise<ApprovalLineItem[] | null> {
  return resolve(async () => {
    const orderId = requireNumericId(input.order_id, "order_id");
    const returnVariantId = requireNumericId(input.variant_id, "variant_id");
    const replacementVariantId = requireNumericId(input.exchange_variant_id, "exchange_variant_id");
    const quantity = optionalPositiveInteger(input.quantity, "quantity", 1);
    if (returnVariantId === replacementVariantId) return null;
    const returnable = await fetchReturnableLineItems(ctx, `gid://shopify/Order/${orderId}`);
    if (!returnable) return null;
    const returned = allocateReturnQuantity(selectReturnLineItems(returnable, returnVariantId), quantity);
    if (returned.reduce((units, line) => units + line.quantity, 0) < quantity) return null;
    const replacementName = (await variantNames(ctx, [replacementVariantId])).get(variantGid(replacementVariantId));
    if (!replacementName) return null;
    return [
      ...returned.map(({ item, quantity: units }) => ({ name: item.name, quantity: units, change: "return" as const })),
      { name: replacementName, quantity, change: "replacement" },
    ];
  });
}

export function orderEditApprovalLineItems(
  input: EditShopifyOrderInput,
  ctx: ShopifyContext,
): Promise<ApprovalLineItem[] | null> {
  return resolve(async () => {
    const orderId = requireNumericId(input.order_id, "order_id");
    const addVariantId = input.variant_id?.trim() ? requireNumericId(input.variant_id, "variant_id") : null;
    const removeVariantId = input.remove_variant_id?.trim()
      ? requireNumericId(input.remove_variant_id, "remove_variant_id")
      : null;
    if (!addVariantId && !removeVariantId) return null;
    const items: ApprovalLineItem[] = [];

    if (removeVariantId) {
      const data = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}.json`, {
        query: { fields: "id,line_items" },
      });
      // The edit removes the whole line, and refuses a variant on two lines.
      const matches = (data.order?.line_items ?? []).filter((lineItem) => (
        String(lineItem.variant_id ?? "") === removeVariantId
        && (lineItem.current_quantity ?? lineItem.quantity) > 0
      ));
      if (matches.length !== 1) return null;
      const line = matches[0]!;
      items.push({ name: orderLineItemName(line), quantity: line.current_quantity ?? line.quantity, change: "remove" });
    }

    if (addVariantId) {
      const name = (await variantNames(ctx, [addVariantId])).get(variantGid(addVariantId));
      if (!name) return null;
      items.push({ name, quantity: optionalPositiveInteger(input.quantity, "quantity", 1), change: "add" });
    }
    return items;
  });
}
