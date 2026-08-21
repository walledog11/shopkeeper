import type { SearchShopifyProductsInput } from "../tools/index.js";
import { formatShopifyToolError, shopifyGraphql, type ShopifyContext } from "./client.js";
import { toolError, toolNotFound, toolOk, type ToolResult } from "../tools/result.js";
import { serializeProduct } from "./serializers.js";
import type { ShopifyProduct } from "./types.js";
import { clampLimit, requireNonEmptyString } from "./validation.js";

// GraphQL, not REST, because REST `products.json` has no search at all: every
// filter it offers — `title`, `handle`, `vendor` — is exact equality. This tool
// spent its whole life sending `?title=<query>`, so `title=snowboard` returned
// zero rows on a store selling four snowboards, and the model escalated instead
// of answering. Found live 2026-08-20; the eval suite could not have caught it,
// because fixtures inject tool output and never execute this file.
export const PRODUCT_SEARCH_QUERY = `query productSearch($query: String!, $first: Int!) {
  products(first: $first, query: $query) {
    nodes {
      id
      title
      variants(first: 10) {
        nodes {
          id
          title
          price
          inventoryQuantity
        }
      }
    }
  }
}`;

interface ProductSearchVariantNode {
  id: string;
  title: string;
  price: string;
  inventoryQuantity?: number | null;
}

interface ProductSearchNode {
  id: string;
  title: string;
  variants?: { nodes?: (ProductSearchVariantNode | null)[] | null } | null;
}

interface ProductSearchData {
  products?: { nodes?: (ProductSearchNode | null)[] | null } | null;
}

// Shopify's search syntax reads `:` as field/value, quotes as phrases and
// parentheses as grouping. Product titles here contain colons ("The Collection
// Snowboard: Liquid"), so a query echoing one back would parse as a field
// filter and match nothing. Strip the operators and let the remaining terms AND
// together, which is the default.
//
// Note this is a term match, not a stemmer: `snowboard` finds the boards,
// `snowboards` finds nothing. The model writes this argument and normalizes in
// practice, so that is left alone rather than guessed at here.
const SEARCH_OPERATORS = /[():"*\\]/g;

function toSearchTerms(query: string): string {
  const stripped = query.replace(SEARCH_OPERATORS, " ").replace(/\s+/g, " ").trim();
  return stripped.length > 0 ? stripped : query;
}

function numericId(gid: string): string {
  const tail = gid.split("/").pop();
  return tail && tail.length > 0 ? tail : gid;
}

export async function searchShopifyProducts(
  input: SearchShopifyProductsInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  try {
    const query = requireNonEmptyString(input.query, "query");
    const limit = clampLimit(input.limit, 5, 10);
    const data = await shopifyGraphql<ProductSearchData>(ctx, PRODUCT_SEARCH_QUERY, {
      query: toSearchTerms(query),
      first: limit,
    });

    // Mapped back onto the REST shape so `serializeProduct` — and the tool
    // result the model has always seen — stay byte-identical.
    const products: ShopifyProduct[] = (data.products?.nodes ?? [])
      .filter((node): node is ProductSearchNode => node != null)
      .map((node) => ({
        id: numericId(node.id),
        title: node.title,
        variants: (node.variants?.nodes ?? [])
          .filter((variant): variant is ProductSearchVariantNode => variant != null)
          .map((variant) => ({
            id: numericId(variant.id),
            title: variant.title,
            price: variant.price,
            inventory_quantity: variant.inventoryQuantity ?? null,
          })),
      }));

    if (products.length === 0) return toolNotFound(`No products found matching "${query}".`);

    return toolOk(JSON.stringify(products.map(serializeProduct)));
  } catch (err) {
    return toolError(formatShopifyToolError("could not search products", err));
  }
}
