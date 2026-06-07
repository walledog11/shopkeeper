import { requestJson } from "@/lib/api/fetcher"
import type { ProductsResponse } from "./products-page-utils"

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

export async function fetchProductsPage(pageInfo: string): Promise<ProductsResponse> {
  const fallback = "Unable to load more products."
  const payload = await requestJson<Partial<ProductsResponse>>(
    `/api/shopify/products?page_info=${encodeURIComponent(pageInfo)}`,
    {},
    fallback,
  )
  if (!Array.isArray(payload.products) || !isNullableString(payload.nextPageInfo)) {
    throw new Error(fallback)
  }
  return {
    products: payload.products,
    nextPageInfo: payload.nextPageInfo,
    shop: typeof payload.shop === "string" ? payload.shop : "",
  }
}
