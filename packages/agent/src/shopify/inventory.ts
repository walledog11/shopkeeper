import { shopifyGraphql, type ShopifyContext } from "./client.js";
import { toolNotFound, toolOk, type ToolResult } from "../tools/result.js";
import { clampLimit, moneyToCents, requireNonEmptyString } from "./validation.js";
import { listLowStockVariants } from "./low-stock.js";
import type { GetInventoryStatusInput } from "../tools/registry/types.js";

/**
 * Stock as the merchant asks about it: "how many of X do I have left", and
 * "what am I about to run out of".
 *
 * Variant quantities come back under `read_products`, which is the same grant
 * `listLowStockVariants` has always relied on, so this needs no new scope. It
 * reads inventory as the variant reports it and does not touch location-level
 * `InventoryLevel` records — a solo merchant with one location gets the same
 * answer, and a multi-location store gets the total rather than a wrong split.
 */

export const INVENTORY_STATUS_QUERY = `query inventoryStatus($query: String!, $first: Int!) {
  products(first: $first, query: $query) {
    nodes {
      id
      title
      totalInventory
      tracksInventory
      variants(first: 100) {
        nodes {
          id
          title
          sku
          price
          inventoryQuantity
          inventoryPolicy
        }
      }
    }
  }
}`;

interface InventoryVariantNode {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  inventoryQuantity: number | null;
  inventoryPolicy: string | null;
}

interface InventoryProductNode {
  id: string;
  title: string;
  totalInventory: number | null;
  tracksInventory: boolean | null;
  variants?: { nodes?: (InventoryVariantNode | null)[] } | null;
}

interface InventoryStatusData {
  products?: { nodes?: (InventoryProductNode | null)[] } | null;
}

export interface InventoryVariantStatus {
  variantId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  priceCents: number;
  /** Null when the variant does not track inventory at all. */
  quantity: number | null;
  /** True when Shopify will keep selling past zero. */
  oversellAllowed: boolean;
}

function toSearchTerms(query: string): string {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `title:*${term}*`)
    .join(" OR ");
}

export function readInventoryStatus(data: InventoryStatusData): InventoryVariantStatus[] {
  const statuses: InventoryVariantStatus[] = [];
  for (const product of data.products?.nodes ?? []) {
    if (!product) continue;
    for (const variant of product.variants?.nodes ?? []) {
      if (!variant) continue;
      statuses.push({
        variantId: variant.id,
        productTitle: product.title,
        variantTitle: variant.title,
        sku: variant.sku || null,
        priceCents: moneyToCents(variant.price),
        quantity: product.tracksInventory === false ? null : variant.inventoryQuantity ?? null,
        oversellAllowed: (variant.inventoryPolicy ?? "").toUpperCase() === "CONTINUE",
      });
    }
  }
  return statuses;
}

/** Composed from fields; the caller chooses how many to render, never truncates. */
export function formatInventoryStatusLine(status: InventoryVariantStatus): string {
  const label = status.variantTitle === "Default Title"
    ? status.productTitle
    : `${status.productTitle} (${status.variantTitle})`;
  const sku = status.sku ? ` [${status.sku}]` : "";
  if (status.quantity === null) return `${label}${sku}: not tracked`;
  const oversell = status.oversellAllowed ? ", oversell allowed" : "";
  return `${label}${sku}: ${status.quantity} in stock${oversell}`;
}

export async function getInventoryStatus(
  input: GetInventoryStatusInput,
  ctx: ShopifyContext,
): Promise<ToolResult> {
  if (input.query === undefined) {
    const threshold = input.low_stock_threshold ?? 5;
    const items = await listLowStockVariants(ctx, threshold, { displayLimit: 20 });
    if (items.length === 0) {
      return toolOk(`Nothing is at or below ${threshold} units.`);
    }
    const lines = items.map((item) => {
      const label = item.variantTitle === "Default Title"
        ? item.productTitle
        : `${item.productTitle} (${item.variantTitle})`;
      return `${label}: ${item.inventoryQuantity} in stock`;
    });
    return toolOk(
      [`${items.length} at or below ${threshold} units:`, ...lines].join("\n"),
      { lowStockThreshold: threshold, count: items.length },
    );
  }

  const query = requireNonEmptyString(input.query, "query");
  const limit = clampLimit(input.limit, 5, 10);
  const data = await shopifyGraphql<InventoryStatusData>(ctx, INVENTORY_STATUS_QUERY, {
    query: toSearchTerms(query),
    first: limit,
  });

  const statuses = readInventoryStatus(data);
  if (statuses.length === 0) {
    return toolNotFound(`No products found matching "${query}".`);
  }

  return toolOk(
    statuses.map(formatInventoryStatusLine).join("\n"),
    { variants: statuses },
  );
}
