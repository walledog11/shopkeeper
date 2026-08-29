import {
  formatShopifyToolError,
  isAmbiguousShopifyMutationError,
  formatUserErrors,
  shopifyGraphql,
  type ShopifyContext,
  type ShopifyGraphqlUserError,
} from "./client.js";
import { toolError, toolOk, toolUnknown, type ToolResult } from "../tools/result.js";
import {
  centsToMoney,
  moneyToCents,
  requireVariantGid,
  ShopifyInputError,
} from "./validation.js";
import type { SetVariantPricesInput } from "../tools/registry/types.js";

/**
 * Direct repricing, for the cases a discount cannot express — a permanent price
 * correction rather than a sale.
 *
 * Two properties make this safe to have at all. Every variant is named
 * individually: there is no query, no collection, no "all products", so a bulk
 * wildcard reprice is not something the schema can express. And every original
 * price is read before the write and returned with the result, so the audit
 * record carries what the price was, not only what it became.
 *
 * Nothing here bounds the depth of the change. A merchant setting a price knows
 * what it is worth, and the guard that used to second-guess that also blocked
 * the undo of its own permitted write.
 */

export const VARIANT_PRICE_UPDATE_MUTATION = `mutation variantPriceUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { id price }
    userErrors { field message }
  }
}`;

export const VARIANT_PRODUCT_QUERY = `query variantProducts($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on ProductVariant {
      id
      price
      product { id }
    }
  }
}`;

interface VariantProductNode {
  id?: string | null;
  price?: string | null;
  product?: { id?: string | null } | null;
}

interface VariantProductsData {
  nodes?: (VariantProductNode | null)[] | null;
}

interface VariantBulkUpdateData {
  productVariantsBulkUpdate?: {
    productVariants?: { id?: string | null; price?: string | null }[] | null;
    userErrors?: ShopifyGraphqlUserError[];
  } | null;
}

export interface RecordedPriceChange {
  variantId: string;
  originalPriceCents: number;
  newPriceCents: number;
}

function centsToPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

function requirePriceEntries(value: unknown): { variantId: string; priceCents: number }[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ShopifyInputError("prices must name at least one variant and its new price.");
  }
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new ShopifyInputError("each price entry must be an object.");
    }
    const record = entry as Record<string, unknown>;
    const variantId = requireVariantGid(record.variant_id, "variant_id");
    const price = typeof record.price === "number"
      ? record.price
      : Number.parseFloat(String(record.price ?? ""));
    if (!Number.isFinite(price) || price < 0) {
      throw new ShopifyInputError(`price for ${variantId} must be a non-negative number.`);
    }
    return { variantId, priceCents: Math.round(price * 100) };
  });
}

export async function setVariantPrices(
  input: SetVariantPricesInput,
  ctx: ShopifyContext,
): Promise<ToolResult> {
  // Hoisted so an ambiguous failure can still name what it got through. The
  // loop below commits one product at a time, so a mid-loop timeout leaves
  // earlier products definitely repriced and the current one in question.
  const applied: string[] = [];
  let changes: RecordedPriceChange[] = [];
  let mutationStarted = false;
  try {
    const entries = requirePriceEntries(input.prices);
    const variantIds = entries.map((entry) => entry.variantId);
    if (new Set(variantIds).size !== variantIds.length) {
      throw new ShopifyInputError("prices names the same variant more than once.");
    }

    const data = await shopifyGraphql<VariantProductsData>(ctx, VARIANT_PRODUCT_QUERY, {
      ids: variantIds,
    });
    const current = new Map<string, { priceCents: number; productId: string }>();
    for (const node of data.nodes ?? []) {
      if (!node?.id || !node.product?.id) continue;
      current.set(node.id, { priceCents: moneyToCents(node.price), productId: node.product.id });
    }

    const missing = variantIds.filter((id) => !current.has(id));
    if (missing.length > 0) {
      return toolError(
        `Error: ${missing.length} of those variant IDs do not exist in this store, so no price was `
        + `changed: ${missing.join(", ")}.`,
      );
    }

    changes = entries.map((entry) => ({
      variantId: entry.variantId,
      originalPriceCents: current.get(entry.variantId)!.priceCents,
      newPriceCents: entry.priceCents,
    }));

    // Shopify's bulk update is per product, so one call per product.
    const byProduct = new Map<string, { id: string; price: string }[]>();
    for (const entry of entries) {
      const productId = current.get(entry.variantId)!.productId;
      const list = byProduct.get(productId) ?? [];
      list.push({ id: entry.variantId, price: centsToPrice(entry.priceCents) });
      byProduct.set(productId, list);
    }

    mutationStarted = true;
    for (const [productId, variantInputs] of byProduct) {
      const result = await shopifyGraphql<VariantBulkUpdateData>(
        ctx,
        VARIANT_PRICE_UPDATE_MUTATION,
        { productId, variants: variantInputs },
      );
      const payload = result.productVariantsBulkUpdate;
      const userErrors = formatUserErrors(payload?.userErrors);
      if (userErrors) {
        return toolError(
          `Error: repricing stopped partway - ${userErrors}. `
          + `Applied so far: ${applied.length ? applied.join(", ") : "none"}. `
          + `Original prices: ${formatOriginalPrices(changes)}`,
        );
      }
      for (const variant of payload?.productVariants ?? []) {
        if (variant?.id) applied.push(variant.id);
      }
    }

    return toolOk(
      [
        `Repriced ${applied.length} variant(s).`,
        `Original prices, for the record: ${formatOriginalPrices(changes)}`,
      ].join("\n"),
      { priceChanges: changes },
    );
  } catch (err) {
    if (err instanceof ShopifyInputError) return toolError(`Error: ${err.message}`);
    if (mutationStarted && isAmbiguousShopifyMutationError(err)) {
      // A price the merchant cannot see is worse than one they can undo, so the
      // original prices ride along even here: they are the only record of what
      // to restore, and this path is exactly where the merchant needs it.
      return toolUnknown(
        `Unknown: repricing may have committed at Shopify but could not be confirmed. `
        + `Confirmed repriced before contact was lost: ${applied.length ? applied.join(", ") : "none"}. `
        + `Check the store's prices before repricing again. `
        + `Original prices: ${formatOriginalPrices(changes)}. `
        + formatShopifyToolError("reprice reconciliation failed", err),
      );
    }
    return toolError(formatShopifyToolError("failed to reprice", err));
  }
}

export function formatOriginalPrices(changes: readonly RecordedPriceChange[]): string {
  return changes
    .map((change) => (
      `${change.variantId} $${centsToMoney(change.originalPriceCents)} -> `
      + `$${centsToMoney(change.newPriceCents)}`
    ))
    .join("; ");
}
