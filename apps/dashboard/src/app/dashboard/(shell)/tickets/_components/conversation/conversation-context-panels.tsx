"use client"

import NextLink from "next/link"
import { cn } from "@/lib/ui/cn"
import {
  needsYouMetaPillClassName,
  needsYouSoftShadowClassName,
} from "@/app/dashboard/_components/home/needs-you-card-styles"
import { getCustomerName } from "@/lib/messaging/customer-name"
import { shopifyName } from "@/lib/format/shopify"
import type { ShopifyAddress } from "@/types/shopify"
import type { Thread } from "@/types"
import { OrderList } from "../context-panel/OrderList"
import { ShopifySection } from "../context-panel/ShopifySection"
import { formatShortDate } from "../context-panel/formatters"
import type { ShopifyCustomerState } from "../context-panel/useShopifyCustomer"

export type ConversationContextSection = "orders" | "customer" | "past"

const contactPillClassName = cn(
  needsYouMetaPillClassName,
  "h-9 max-w-full gap-1.5 px-3 text-xs font-medium text-[#6b5d4f] bg-[#f5ebe0] hover:bg-[#efe4d6]",
)

export function ConversationContextDropdown({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        needsYouSoftShadowClassName,
        "mt-2 max-h-[min(28rem,50vh)] overflow-y-auto rounded-2xl border border-border bg-white custom-scrollbar animate-in fade-in slide-in-from-top-1 duration-200",
      )}
    >
      <div className="p-4">{children}</div>
    </div>
  )
}

export function OrdersContextPanel({
  shopify,
}: {
  shopify: ShopifyCustomerState
}) {
  const customer = shopify.customer

  if (shopify.isLoading && !shopify.data) {
    return <p className="text-xs text-[#6b5d4f]">Checking Shopify…</p>
  }

  if (!customer) {
    return <p className="text-xs text-[#6b5d4f]">No Shopify customer is linked yet.</p>
  }

  if (shopify.orders.length === 0) {
    return <p className="text-xs text-[#6b5d4f]">No orders yet.</p>
  }

  return (
    <OrderList
      orders={shopify.orders}
      shop={shopify.shop}
      showHeader={false}
      showOlderNote={false}
      showPastOrderPills
    />
  )
}

export function CustomerContextPanel({
  thread,
  hasShopify,
  shopify,
  onLinkShopifyCustomer,
}: {
  thread: Thread
  hasShopify: boolean
  shopify: ShopifyCustomerState
  onLinkShopifyCustomer: (customerId: string | null) => Promise<void>
}) {
  const customer = shopify.customer
  const displayName = shopifyName(customer) ?? getCustomerName(thread.customer)
  const email = customer?.email
    ?? (thread.customer?.platformId?.includes("@") ? thread.customer.platformId : null)
  const phone = customer?.phone ?? null
  const lines = addressLines(customer?.default_address)

  const identity = (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <p className="shrink-0 text-sm font-semibold leading-5 text-[#1a1a1a]">{displayName}</p>
      {(email || phone) && (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {email && (
            <a href={`mailto:${email}`} className={contactPillClassName}>
              <span className="truncate">{email}</span>
            </a>
          )}
          {phone && (
            <a href={`tel:${phone}`} className={contactPillClassName}>
              <span className="truncate">{phone}</span>
            </a>
          )}
        </div>
      )}
    </div>
  )

  const address = lines.length > 0 ? (
    <div className="rounded-2xl bg-[#f5ebe0] px-3.5 py-3">
      {lines.map(line => (
        <p key={line} className="text-xs leading-5 text-[#1a1a1a]">
          {line}
        </p>
      ))}
    </div>
  ) : null

  if (!hasShopify) {
    return (
      <div className="flex flex-col gap-3">
        {identity}
        {address}
      </div>
    )
  }

  return (
    <ShopifySection
      thread={thread}
      shopify={shopify}
      onLinkShopifyCustomer={onLinkShopifyCustomer}
      hideHeader
      hideStats
      leading={identity}
    >
      {address}
    </ShopifySection>
  )
}

export function PastConversationsContextPanel({
  threadId,
  threads,
}: {
  threadId: string
  threads: Thread[]
}) {
  const earlier = threads.filter(item => item.id !== threadId).slice(0, 3)

  if (earlier.length === 0) {
    return <p className="text-xs text-[#6b5d4f]">No earlier conversations.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6b5d4f]">
        Past conversations
      </p>
      {earlier.map(item => {
        const preview = item.messages[0]?.contentText
        const title = item.tag || item.aiSummary || preview || "No content"
        return (
          <NextLink
            key={item.id}
            href={`?thread=${item.id}`}
            className="flex items-start justify-between gap-3 rounded-2xl bg-[#f5ebe0]/70 px-3.5 py-2.5 transition-colors hover:bg-[#f5ebe0]"
          >
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold leading-4 text-[#1a1a1a]">
                {title}
              </span>
              {preview && preview !== title && (
                <span className="mt-0.5 block truncate text-xs leading-4 text-[#6b5d4f]">
                  {preview}
                </span>
              )}
            </span>
            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[#6b5d4f]">
              {formatShortDate(item.updatedAt)}
            </span>
          </NextLink>
        )
      })}
    </div>
  )
}

function addressLines(addr: ShopifyAddress | null | undefined): string[] {
  if (!addr) return []
  return [
    addr.address1,
    [addr.city, addr.province, addr.zip].filter(Boolean).join(", ") || null,
    addr.country_name,
  ].filter((line): line is string => Boolean(line?.trim()))
}
