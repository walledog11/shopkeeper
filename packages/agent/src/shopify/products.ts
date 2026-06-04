import type { SearchShopifyProductsInput } from "../tools/index.js";
import { formatShopifyToolError, shopifyRestJson, type ShopifyContext } from "./client.js";
import { toolError, toolNotFound, toolOk, type ToolResult } from "../tools/result.js";
import { serializeProduct } from "./serializers.js";
import type { ShopifyProduct } from "./types.js";
import { clampLimit, requireNonEmptyString } from "./validation.js";

export async function searchShopifyProducts(
  input: SearchShopifyProductsInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  try {
    const query = requireNonEmptyString(input.query, "query");
    const limit = clampLimit(input.limit, 5, 10);
    const data = await shopifyRestJson<{ products?: ShopifyProduct[] }>(ctx, "products.json", {
      query: {
        title: query,
        limit,
        fields: "id,title,variants",
      },
    });

    const products = data.products ?? [];
    if (products.length === 0) return toolNotFound(`No products found matching "${query}".`);

    return toolOk(JSON.stringify(products.map(serializeProduct)));
  } catch (err) {
    return toolError(formatShopifyToolError("could not search products", err));
  }
}
