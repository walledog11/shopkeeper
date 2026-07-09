import { noShopify, requireShopify } from "./helpers.js";
import { defineTool, numberArg, stringArg } from "./schema.js";
import type { SearchShopifyProductsInput } from "./types.js";

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
] as const;
