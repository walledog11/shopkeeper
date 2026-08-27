import { noShopify, requireShopify } from "./helpers.js";
import { defineTool, numberArg, stringArg } from "./schema.js";
import type { GetInventoryStatusInput, SearchShopifyProductsInput } from "./types.js";

export const PRODUCT_TOOL_DEFINITIONS = [
  defineTool({
    name: "search_shopify_products",
    description:
      "Search the Shopify product catalog by title or keyword. Returns matching products with their variants and variant IDs. Use this when the operator describes a product by name (e.g. 'pencil half zip, size L') so you can resolve the correct variant_id before creating an order.",
    fields: {
      query: stringArg("Product title or keyword to search for (e.g. 'pencil half zip').", { required: true }),
      limit: numberArg("Maximum number of products to return (default 5, max 10)."),
    },
    category: "read",
    group: "product",
    capabilities: ["shopify"],
    label: "Searched products",
    planStepLabel: "Search Shopify products",
    execute: async (input: SearchShopifyProductsInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.searchShopifyProducts(input, shopify) : noShopify;
    },
  }),
  defineTool({
    name: "get_inventory_status",
    description:
      "Read current stock levels. Give a query to check specific products (e.g. 'olive linen napkins'), or omit it to list everything at or below the low-stock threshold. Reports units in stock per variant, whether a variant is untracked, and whether it is set to keep selling past zero. This reads stock; it does not change it.",
    fields: {
      query: stringArg("Product title or keyword. Omit to list low-stock items instead."),
      limit: numberArg("Maximum number of products to return when querying (default 5, max 10)."),
      low_stock_threshold: numberArg("Units at or below which an item counts as low (default 5). Only used when no query is given."),
    },
    category: "read",
    group: "product",
    capabilities: ["shopify"],
    label: "Checked inventory",
    planStepLabel: "Check inventory",
    requiredScopes: ["read_products"],
    execute: async (input: GetInventoryStatusInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.getInventoryStatus(input, shopify) : noShopify;
    },
  }),
] as const;
