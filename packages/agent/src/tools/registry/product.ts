import { noShopify, requireShopify } from "./helpers.js";
import { isStorefrontContext } from "../../guest-policy.js";
import { defineTool } from "./schema.js";
import { TOOL_INPUT_FIELDS } from "./input-fields.js";

export const PRODUCT_TOOL_DEFINITIONS = [
  defineTool({
    name: "search_shopify_products",
    description:
      "Search the Shopify product catalog by title or keyword. Returns matching products with their variants and variant IDs. Use this when the operator describes a product by name (e.g. 'pencil half zip, size L') so you can resolve the correct variant_id before creating an order.",
    fields: TOOL_INPUT_FIELDS.search_shopify_products,
    category: "read",
    group: "product",
    capabilities: ["shopify"],
    requiredScopes: ["read_products"],
    label: "Searched products",
    planStepLabel: "Search Shopify products",
    execute: async (input, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.searchShopifyProducts(input, shopify, isStorefrontContext(ctx)) : noShopify;
    },
  }),
  defineTool({
    name: "get_inventory_status",
    description:
      "Read current stock levels. Give a query to check specific products (e.g. 'olive linen napkins'), or omit it to list everything at or below the low-stock threshold. Reports units in stock per variant, whether a variant is untracked, and whether it is set to keep selling past zero. This reads stock; it does not change it.",
    fields: TOOL_INPUT_FIELDS.get_inventory_status,
    category: "read",
    group: "product",
    capabilities: ["shopify"],
    label: "Checked inventory",
    planStepLabel: "Check inventory",
    requiredScopes: ["read_products"],
    execute: async (input, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.getInventoryStatus(input, shopify) : noShopify;
    },
  }),
] as const;
