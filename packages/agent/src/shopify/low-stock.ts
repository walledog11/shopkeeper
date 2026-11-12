import { shopifyGraphql, type ShopifyContext } from "./client.js";
import { isShopifySimulatorContext } from "./simulator-store.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_DISPLAY_LIMIT = 5;

export interface LowStockVariant {
  productTitle: string;
  variantTitle: string;
  inventoryQuantity: number;
}

// Shopify filters on the server, so this is one request rather than a scan of
// every product's variants.
export const LOW_STOCK_VARIANTS_QUERY = `query ShopkeeperLowStockVariants($query: String!, $first: Int!) {
  productVariants(first: $first, query: $query) {
    nodes {
      title
      inventoryQuantity
      product { title }
    }
  }
}`;

export async function listLowStockVariants(
  ctx: ShopifyContext,
  threshold: number,
  options: { timeoutMs?: number; displayLimit?: number } = {},
): Promise<LowStockVariant[]> {
  // The simulator's catalog carries no inventory.
  if (isShopifySimulatorContext(ctx)) return [];
  const displayLimit = options.displayLimit ?? DEFAULT_DISPLAY_LIMIT;
  const data = await shopifyGraphql<{
    productVariants: { nodes: { title: string; inventoryQuantity: number | null; product: { title: string } }[] };
  }>(
    ctx,
    LOW_STOCK_VARIANTS_QUERY,
    { query: `inventory_quantity:<=${Math.trunc(threshold)}`, first: displayLimit },
    { timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS },
  );
  return data.productVariants.nodes.flatMap((node) => (
    node.inventoryQuantity != null && Number.isFinite(node.inventoryQuantity) && node.inventoryQuantity <= threshold
      ? [{ productTitle: node.product.title, variantTitle: node.title, inventoryQuantity: node.inventoryQuantity }]
      : []
  ));
}

function formatVariantLabel(item: LowStockVariant): string {
  const variantLabel = item.variantTitle === "Default Title"
    ? item.productTitle
    : `${item.productTitle} (${item.variantTitle})`;
  return `- ${variantLabel} is down to ${item.inventoryQuantity}`;
}

// Bulleted rather than middot-joined: with a `·` between the product and its
// count *and* between products, a two-item list reads as one four-item list.
export function formatLowStockLine(
  items: LowStockVariant[],
  totalFound?: number,
): string | null {
  if (items.length === 0) return null;

  const lines = ["Running low:", ...items.map(formatVariantLabel)];
  if (totalFound != null && totalFound > items.length) {
    lines.push(`- …and ${totalFound - items.length} more`);
  }
  return lines.join("\n");
}
