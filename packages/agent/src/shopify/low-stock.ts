import { parseNextPageInfo, shopifyRest, type ShopifyContext } from "./client.js";
import type { ShopifyProduct, ShopifyProductVariant } from "./types.js";

const PRODUCT_PAGE_LIMIT = 250;
const DEFAULT_MAX_PAGES = 2;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_DISPLAY_LIMIT = 5;

export interface LowStockVariant {
  productTitle: string;
  variantTitle: string;
  inventoryQuantity: number;
}

export async function listLowStockVariants(
  ctx: ShopifyContext,
  threshold: number,
  options: { maxPages?: number; timeoutMs?: number; displayLimit?: number } = {},
): Promise<LowStockVariant[]> {
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const displayLimit = options.displayLimit ?? DEFAULT_DISPLAY_LIMIT;
  const matches: LowStockVariant[] = [];

  let pageInfo: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const query = pageInfo
      ? { limit: PRODUCT_PAGE_LIMIT, page_info: pageInfo, fields: "id,title,variants" }
      : { limit: PRODUCT_PAGE_LIMIT, fields: "id,title,variants" };

    const { data, headers } = await shopifyRest<{ products?: ShopifyProduct[] }>(ctx, "products.json", {
      query,
      timeoutMs,
    });

    for (const product of data.products ?? []) {
      collectLowStockVariants(product, threshold, matches, displayLimit);
      if (matches.length >= displayLimit) return matches;
    }

    pageInfo = parseNextPageInfo(headers);
    if (!pageInfo) break;
  }

  return matches;
}

function collectLowStockVariants(
  product: ShopifyProduct,
  threshold: number,
  matches: LowStockVariant[],
  displayLimit: number,
): void {
  for (const variant of product.variants ?? []) {
    if (matches.length >= displayLimit) return;
    const quantity = readInventoryQuantity(variant);
    if (quantity == null || quantity > threshold) continue;
    matches.push({
      productTitle: product.title,
      variantTitle: variant.title,
      inventoryQuantity: quantity,
    });
  }
}

function readInventoryQuantity(variant: ShopifyProductVariant): number | null {
  if (variant.inventory_quantity == null) return null;
  if (!Number.isFinite(variant.inventory_quantity)) return null;
  return variant.inventory_quantity;
}

function formatVariantLabel(item: LowStockVariant): string {
  const variantLabel = item.variantTitle === "Default Title"
    ? item.productTitle
    : `${item.productTitle} (${item.variantTitle})`;
  const left = item.inventoryQuantity === 1 ? "1 left" : `${item.inventoryQuantity} left`;
  return `${variantLabel} · ${left}`;
}

export function formatLowStockLine(
  items: LowStockVariant[],
  threshold: number,
  totalFound?: number,
): string | null {
  if (items.length === 0) return null;

  const shown = items.map(formatVariantLabel).join(" · ");
  const overflow = totalFound != null && totalFound > items.length
    ? ` · +${totalFound - items.length} more`
    : "";
  return `Low stock (≤${threshold}): ${shown}${overflow}`;
}
