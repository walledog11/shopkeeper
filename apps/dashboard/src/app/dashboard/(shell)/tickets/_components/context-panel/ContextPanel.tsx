"use client"

import Image from "next/image"
import NextLink from "next/link"
import { Mail, ShoppingBagIcon } from "lucide-react"
import useSWR from "swr"
import { getChannelInfo } from "@/lib/messaging/channels"
import { getCustomerName } from "@/lib/messaging/customer-name"
import { fetcher } from "@/lib/api/fetcher"
import { SectionHeader } from "./SectionHeader"
import { ShopifySection } from "./ShopifySection"
import { OrderList } from "./OrderList"
import { formatShortDate } from "./formatters"
import { shopifyName } from "@/lib/format/shopify"
import { useShopifyCustomer } from "./useShopifyCustomer"
import type { Thread } from "@/types"

interface Props {
  thread: Thread
  hasShopify: boolean
  onLinkShopifyCustomer: (customerId: string | null) => Promise<void>
}

export default function ContextPanel({
  thread,
  hasShopify,
  onLinkShopifyCustomer,
}: Props) {
  const channel = getChannelInfo(thread.channelType)
  const fallbackName = getCustomerName(thread.customer)
  const platformHandle = thread.customer?.platformId || ''
  const shopify = useShopifyCustomer(thread, hasShopify)
  const shopifyCustomer = shopify.customer
  const displayName = shopifyName(shopifyCustomer) ?? fallbackName
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?'
  const emailAddress = shopifyCustomer?.email || (platformHandle.includes('@') ? platformHandle : null)
  const secondaryHandle = emailAddress || (platformHandle ? (platformHandle.startsWith('@') ? platformHandle : `@${platformHandle}`) : null)
  const shopifyAdminCustomerUrl = shopify.shop && shopifyCustomer
    ? `https://${shopify.shop}/admin/customers/${shopifyCustomer.id}`
    : null

  const { data: pastThreadsData } = useSWR<{ threads: Thread[] }>(
    thread.customer?.id ? `/api/threads/customer/${thread.customer.id}?limit=4` : null,
    fetcher,
  )
  const recentThreads = (pastThreadsData?.threads ?? [])
    .filter(t => t.id !== thread.id)
    .slice(0, 3)

  const showOrder = hasShopify && !!shopifyCustomer && shopify.orders.length > 0
  const olderOrderCount = Math.max((shopifyCustomer?.orders_count ?? 0) - shopify.orders.length, 0)

  const basePill = "inline-flex h-7 items-center gap-2 rounded-full border border-border bg-foreground/[0.04] px-3 text-xs font-medium text-strong"
  const actionPill = `${basePill} transition-colors hover:border-foreground/20 hover:bg-foreground/[0.07]`

  return (
    <aside className="@container flex w-full flex-col bg-background">
      <header className="flex items-center justify-between gap-4 border-b border-foreground/[0.08] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="size-9 shrink-0 overflow-hidden rounded-full bg-foreground/[0.08] flex items-center justify-center text-xs font-semibold text-muted-foreground">
            {thread.customer?.profilePicUrl ? (
              <Image src={thread.customer.profilePicUrl} alt={displayName} width={40} height={40} className="size-full object-cover" />
            ) : initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-5 text-strong">{displayName}</p>
            {secondaryHandle && secondaryHandle !== displayName && (
              <p className="mt-0.5 truncate text-xs leading-4 text-muted-foreground">{secondaryHandle}</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {emailAddress ? (
            <a href={`mailto:${emailAddress}`} className={actionPill}>
              <Mail className="size-3" />
              Email
            </a>
          ) : (
            <span className={basePill}>
              <Image src={channel.logo} alt={channel.name} width={16} height={16} className="object-contain opacity-75" />
              {channel.name}
            </span>
          )}

          {hasShopify && (
            shopifyAdminCustomerUrl ? (
              <a href={shopifyAdminCustomerUrl} target="_blank" rel="noopener noreferrer" className={actionPill}>
                <ShoppingBagIcon className="size-3" />
                Shopify
              </a>
            ) : (
              <span className={basePill}>
                <ShoppingBagIcon className="size-3" />
                Shopify
              </span>
            )
          )}
        </div>
      </header>

      <div className="flex flex-col divide-y divide-foreground/[0.08] @3xl:flex-row @3xl:divide-x @3xl:divide-y-0">
        {hasShopify && (
          <div className="min-w-0 flex-1 p-4">
            <ShopifySection
              thread={thread}
              shopify={shopify}
              onLinkShopifyCustomer={onLinkShopifyCustomer}
            />
          </div>
        )}

        {showOrder && (
          <div className="min-w-0 flex-1 p-4">
            <OrderList orders={shopify.orders} shop={shopify.shop} olderOrderCount={olderOrderCount} />
          </div>
        )}

        <div className="min-w-0 flex-1 p-4">
          <SectionHeader title="Past conversations" />
          {recentThreads.length > 0 ? (
            <div className="divide-y divide-dashed divide-foreground/[0.08]">
              {recentThreads.map(t => {
                const preview = t.messages[0]?.contentText
                const title = t.tag || t.aiSummary || preview || 'No content'
                return (
                  <NextLink
                    key={t.id}
                    href={`?thread=${t.id}`}
                    className="group flex items-start justify-between gap-2 py-1.5 first:pt-0 last:pb-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs leading-4 text-strong transition-colors group-hover:text-foreground">
                        {title}
                      </span>
                      {preview && preview !== title && (
                        <span className="mt-0.5 block truncate text-xs leading-3 text-faint">
                          {preview}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs leading-4 text-muted-foreground">
                      {formatShortDate(t.updatedAt)}
                    </span>
                  </NextLink>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-faint">No earlier conversations.</p>
          )}
        </div>
      </div>
    </aside>
  )
}
