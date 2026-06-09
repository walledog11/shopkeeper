"use client"

import Image from "next/image"
import NextLink from "next/link"
import { Mail, MapPin, ShoppingBagIcon } from "lucide-react"
import useSWR from "swr"
import { getChannelInfo } from "@/lib/messaging/channels"
import { getCustomerName } from "@/lib/messaging/customer-name"
import { fetcher } from "@/lib/api/fetcher"
import { SectionHeader } from "./SectionHeader"
import { ShopifySection } from "./ShopifySection"
import { formatShortDate } from "./formatters"
import { locationString, shopifyName } from "@/lib/format/shopify"
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
  const location = locationString(shopifyCustomer?.default_address)
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

  const basePill = "inline-flex h-6 items-center gap-2 rounded border border-white/[0.10] bg-white/[0.035] px-2 text-xs font-medium text-white/80"
  const actionPill = `${basePill} transition-colors hover:border-white/[0.18] hover:bg-white/[0.07]`

  return (
    <aside className="w-full xl:w-[300px] shrink-0 xl:border-l xl:border-white/[0.12] flex flex-col xl:overflow-y-auto bg-[#030303]">
      <section className="px-3.5 pt-3 pb-3 border-b border-white/[0.08]">
        <div className="flex flex-row items-center gap-4">
          <div className="size-8 rounded-full overflow-hidden bg-[#ff7a1a] flex items-center justify-center text-white text-xs font-semibold shrink-0">
            {thread.customer?.profilePicUrl ? (
              <Image src={thread.customer.profilePicUrl} alt={displayName} width={40} height={40} className="size-full object-cover" />
            ) : initials}
          </div>

          <div className="mt-1 min-w-0">
            <p className="text-sm leading-5 font-semibold text-white/90 truncate">{displayName}</p>
            {secondaryHandle && secondaryHandle !== displayName && (
              <p className="mt-0.5 text-xs leading-4 text-white/50 truncate">{secondaryHandle}</p>
            )}
            {location && (
              <p className="mt-0.5 flex items-center gap-1 text-xs italic leading-4 text-white/40 truncate">
                {location}
              </p>
            )}
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
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
      </section>

      {hasShopify && (
        <ShopifySection
          thread={thread}
          shopify={shopify}
          onLinkShopifyCustomer={onLinkShopifyCustomer}
        />
      )}

      <section className="px-3.5 py-3">
        <SectionHeader title="RECENT TICKETS" />
        {recentThreads.length > 0 ? (
          <div className="divide-y divide-dashed divide-white/[0.08]">
            {recentThreads.map(t => {
              const preview = t.messages[0]?.contentText
              const title = t.tag || t.aiSummary || preview || 'No content'
              return (
                <NextLink
                  key={t.id}
                  href={`?thread=${t.id}`}
                  className="flex items-start justify-between gap-2 py-1.5 first:pt-0 last:pb-0 group"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs leading-4 text-white/80 group-hover:text-white transition-colors">
                      {title}
                    </span>
                    {preview && preview !== title && (
                      <span className="mt-0.5 block truncate text-xs leading-3 text-white/40">
                        {preview}
                      </span>
                    )}
                  </span>
                  <span className="text-xs leading-4 text-white/50 shrink-0">
                    {formatShortDate(t.updatedAt)}
                  </span>
                </NextLink>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-white/40">No recent tickets.</p>
        )}
      </section>
    </aside>
  )
}
