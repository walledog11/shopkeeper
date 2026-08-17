"use client"

import { ChevronDown, MapPin, MessageSquare, ShoppingBag, Sparkles } from "lucide-react"
import useSWR from "swr"
import { fetcher } from "@/lib/api/fetcher"
import { locationString } from "@/lib/format/shopify"
import { cn } from "@/lib/ui/cn"
import {
  needsYouMetaPillClassName,
  needsYouSoftShadowClassName,
} from "@/app/dashboard/_components/home/needs-you-card-styles"
import type { Thread } from "@/types"
import ContextPanel from "../context-panel/ContextPanel"
import { useShopifyCustomer } from "../context-panel/useShopifyCustomer"
import { formatMoney } from "../context-panel/formatters"

interface Props {
  thread: Thread
  hasShopify: boolean
  onLinkShopifyCustomer: (customerId: string | null) => Promise<void>
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
}

type FactTone = "value" | "lead" | "muted"

interface Fact {
  key: string
  icon: typeof ShoppingBag
  text: string
  tone: FactTone
}

const TEXT_TONE: Record<FactTone, string> = {
  value: "font-semibold text-emerald-700",
  lead: "font-semibold text-[#1a1a1a]",
  muted: "font-medium text-[#6b5d4f]",
}

const PILL_TONE: Record<FactTone, string> = {
  value: "bg-emerald-600/10 text-emerald-800",
  lead: "bg-white text-[#1a1a1a]",
  muted: "bg-white text-[#6b5d4f]",
}

export default function ConversationContextBar({
  thread,
  hasShopify,
  onLinkShopifyCustomer,
  expanded,
  onExpandedChange,
}: Props) {
  const shopify = useShopifyCustomer(thread, hasShopify)
  const customer = shopify.customer
  const location = locationString(customer?.default_address)

  const { data: pastThreadsData } = useSWR<{ threads: Thread[] }>(
    thread.customer?.id ? `/api/threads/customer/${thread.customer.id}?limit=4` : null,
    fetcher,
  )
  const pastCount = (pastThreadsData?.threads ?? []).filter(t => t.id !== thread.id).length

  const facts: Fact[] = []

  if (hasShopify) {
    if (shopify.isLoading && !shopify.data) {
      facts.push({ key: "shopify", icon: ShoppingBag, text: "Checking Shopify…", tone: "muted" })
    } else if (customer && customer.orders_count > 0) {
      const orders = `${customer.orders_count} order${customer.orders_count === 1 ? "" : "s"}`
      facts.push({
        key: "shopify",
        icon: ShoppingBag,
        text: `${orders} · ${formatMoney(customer.total_spent, customer.currency)}`,
        tone: "value",
      })
    } else if (customer) {
      facts.push({ key: "shopify", icon: ShoppingBag, text: "No orders yet", tone: "lead" })
    } else {
      facts.push({ key: "shopify", icon: ShoppingBag, text: "Not in Shopify", tone: "lead" })
    }
  }

  if (pastCount > 0) {
    facts.push({
      key: "past",
      icon: MessageSquare,
      text: `${pastCount} past chat${pastCount === 1 ? "" : "s"}`,
      tone: "muted",
    })
  } else {
    facts.push({ key: "past", icon: Sparkles, text: "First time", tone: "muted" })
  }

  if (location) {
    facts.push({ key: "location", icon: MapPin, text: location, tone: "muted" })
  }

  if (facts[0] && facts[0].tone === "muted") facts[0].tone = "lead"

  return (
    <div className="relative shrink-0 px-5 pb-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto custom-scrollbar">
        {facts.map(fact => {
          const Icon = fact.icon
          return (
            <button
              key={fact.key}
              type="button"
              data-testid="conversation-context-bar"
              aria-expanded={expanded}
              onClick={() => onExpandedChange(!expanded)}
              className={cn(
                needsYouMetaPillClassName,
                "h-9 shrink-0 gap-1.5 px-3 transition-colors hover:bg-white/90",
                PILL_TONE[fact.tone],
              )}
            >
              <Icon className="size-3.5 shrink-0 opacity-70" />
              <span className={cn("truncate text-xs leading-none", TEXT_TONE[fact.tone])}>
                {fact.text}
              </span>
            </button>
          )
        })}
        <button
          type="button"
          aria-label="Customer details"
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
          className={cn(
            needsYouMetaPillClassName,
            "size-9 shrink-0 text-[#6b5d4f] transition-colors hover:text-[#1a1a1a]",
          )}
        >
          <ChevronDown
            className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
          />
        </button>
      </div>

      {expanded && (
        <div
          className={cn(
            needsYouSoftShadowClassName,
            "absolute inset-x-5 top-[calc(100%+0.375rem)] z-30 max-h-[45vh] overflow-y-auto rounded-2xl border border-border bg-card custom-scrollbar animate-in fade-in slide-in-from-top-1 duration-200 sm:inset-x-6",
          )}
        >
          <ContextPanel
            thread={thread}
            hasShopify={hasShopify}
            onLinkShopifyCustomer={onLinkShopifyCustomer}
          />
        </div>
      )}
    </div>
  )
}
