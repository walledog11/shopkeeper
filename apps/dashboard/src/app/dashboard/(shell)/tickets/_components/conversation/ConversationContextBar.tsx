"use client"

import { MapPin, MessageSquare, ShoppingBag, Sparkles } from "lucide-react"
import useSWR from "swr"
import { fetcher } from "@/lib/api/fetcher"
import { locationString } from "@/lib/format/shopify"
import { cn } from "@/lib/ui/cn"
import { merchantSandInkClass } from "@/lib/ui/merchant-palette"
import type { Thread } from "@/types"
import { useShopifyCustomer } from "../context-panel/useShopifyCustomer"
import { formatMoney } from "@shopkeeper/agent/money"
import {
  ConversationContextDropdown,
  CustomerContextPanel,
  OrdersContextPanel,
  PastConversationsContextPanel,
  type ConversationContextSection,
} from "./conversation-context-panels"

interface Props {
  thread: Thread
  hasShopify: boolean
  onLinkShopifyCustomer: (customerId: string | null) => Promise<void>
  openSection: ConversationContextSection | null
  onOpenSectionChange: (section: ConversationContextSection | null) => void
  flush?: boolean
}

type FactTone = "value" | "lead" | "muted"

interface Fact {
  key: string
  icon: typeof ShoppingBag
  text: string
  tone: FactTone
  section: ConversationContextSection
}

const TEXT_TONE: Record<FactTone, string> = {
  value: "font-semibold text-emerald-700",
  lead: "font-semibold text-[#1a1a1a]",
  muted: "font-medium text-[#6b5d4f]",
}

const PILL_TONE: Record<FactTone, string> = {
  value: "bg-emerald-600/10 text-emerald-800 hover:bg-emerald-600/15",
  lead: "text-[#1a1a1a] hover:bg-foreground/[0.05]",
  muted: "text-[#6b5d4f] hover:bg-foreground/[0.05]",
}

export default function ConversationContextBar({
  thread,
  hasShopify,
  onLinkShopifyCustomer,
  openSection,
  onOpenSectionChange,
  flush = false,
}: Props) {
  const shopify = useShopifyCustomer(thread, hasShopify)
  const customer = shopify.customer
  const location = locationString(customer?.default_address)

  const { data: pastThreadsData } = useSWR<{ threads: Thread[] }>(
    thread.customer?.id ? `/api/threads/customer/${thread.customer.id}?limit=4` : null,
    fetcher,
  )
  const pastThreads = pastThreadsData?.threads ?? []
  const pastCount = pastThreads.filter(item => item.id !== thread.id).length

  const facts: Fact[] = []

  if (hasShopify) {
    if (shopify.isLoading && !shopify.data) {
      facts.push({
        key: "shopify",
        icon: ShoppingBag,
        text: "Checking Shopify…",
        tone: "muted",
        section: "orders",
      })
    } else if (customer && customer.orders_count > 0) {
      const orders = `${customer.orders_count} order${customer.orders_count === 1 ? "" : "s"}`
      facts.push({
        key: "shopify",
        icon: ShoppingBag,
        text: `${orders} · ${formatMoney(customer.total_spent, customer.currency, { exact: true })}`,
        tone: "value",
        section: "orders",
      })
    } else if (customer) {
      facts.push({
        key: "shopify",
        icon: ShoppingBag,
        text: "No orders yet",
        tone: "lead",
        section: "orders",
      })
    } else {
      facts.push({
        key: "shopify",
        icon: ShoppingBag,
        text: "Not in Shopify",
        tone: "lead",
        section: "customer",
      })
    }
  }

  if (pastCount > 0) {
    facts.push({
      key: "past",
      icon: MessageSquare,
      text: `${pastCount} past chat${pastCount === 1 ? "" : "s"}`,
      tone: "muted",
      section: "past",
    })
  } else {
    facts.push({
      key: "past",
      icon: Sparkles,
      text: "First chat",
      tone: "muted",
      section: "past",
    })
  }

  if (location) {
    facts.push({
      key: "location",
      icon: MapPin,
      text: location,
      tone: "muted",
      section: "customer",
    })
  }

  if (facts[0] && facts[0].tone === "muted") facts[0].tone = "lead"

  const toggleSection = (section: ConversationContextSection) => {
    onOpenSectionChange(openSection === section ? null : section)
  }

  return (
    <div className={cn("shrink-0", flush ? "" : "px-4 py-2.5 sm:px-5 sm:py-3 md:px-6")}>
      <div className="-ml-2 flex w-full min-w-0 flex-wrap items-center gap-1">
        {facts.map(fact => {
          const Icon = fact.icon
          const isOpen = openSection === fact.section
          return (
            <button
              key={fact.key}
              type="button"
              data-testid="conversation-context-bar"
              data-context-section={fact.section}
              aria-expanded={isOpen}
              onClick={() => toggleSection(fact.section)}
              className={cn(
                "inline-flex h-7 min-w-0 max-w-full items-center gap-1 rounded-lg px-2 transition-colors",
                isOpen ? merchantSandInkClass : PILL_TONE[fact.tone],
              )}
            >
              <Icon className="size-3.5 shrink-0 opacity-70" />
              <span className={cn(
                "min-w-0 truncate text-xs leading-none",
                isOpen ? "font-semibold text-[#1a1a1a]" : TEXT_TONE[fact.tone],
              )}
              >
                {fact.text}
              </span>
            </button>
          )
        })}
      </div>

      {openSection === "orders" && (
        <ConversationContextDropdown>
          <OrdersContextPanel shopify={shopify} />
        </ConversationContextDropdown>
      )}
      {openSection === "customer" && (
        <ConversationContextDropdown>
          <CustomerContextPanel
            thread={thread}
            hasShopify={hasShopify}
            shopify={shopify}
            onLinkShopifyCustomer={onLinkShopifyCustomer}
          />
        </ConversationContextDropdown>
      )}
      {openSection === "past" && (
        <ConversationContextDropdown>
          <PastConversationsContextPanel threadId={thread.id} threads={pastThreads} />
        </ConversationContextDropdown>
      )}
    </div>
  )
}
