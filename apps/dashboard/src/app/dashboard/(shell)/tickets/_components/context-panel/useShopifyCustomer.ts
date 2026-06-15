"use client"

import useSWR from "swr"
import { fetcher } from "@/lib/api/fetcher"
import { buildShopifyCustomerKey } from "@/lib/shopify/customer-key"
import type { Thread } from "@/types"
import type { ShopifyData } from "@/types/shopify"

export function useShopifyCustomer(thread: Thread, enabled: boolean) {
  const swrKey = enabled
    ? buildShopifyCustomerKey({
        channelType: thread.channelType,
        customerPlatformId: thread.customer?.platformId,
        shopifyCustomerId: thread.shopifyCustomerId,
        orderLimit: 1,
      })
    : null

  const swr = useSWR<ShopifyData>(swrKey, fetcher, {
    revalidateOnFocus: false,
  })

  return {
    ...swr,
    swrKey,
    customer: swr.data?.customer ?? null,
    orders: swr.data?.orders ?? [],
    shop: swr.data?.shop,
  }
}

export type ShopifyCustomerState = ReturnType<typeof useShopifyCustomer>
