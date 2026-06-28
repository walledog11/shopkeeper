"use client"

import { ChevronDown, MapPin, MessageSquare, ShoppingBag, Sparkles } from "lucide-react"
import useSWR from "swr"
import { fetcher } from "@/lib/api/fetcher"
import { locationString } from "@/lib/format/shopify"
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
  lead: "font-medium text-foreground/80",
  muted: "text-foreground/50",
}

const ICON_TONE: Record<FactTone, string> = {
  value: "text-emerald-600/80",
  lead: "text-foreground/45",
  muted: "text-foreground/35",
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
        text: `${orders} · ${formatMoney(customer.total_spent, customer.currency)} spent`,
        tone: "value",
      })
    } else if (customer) {
      facts.push({ key: "shopify", icon: ShoppingBag, text: "Shopify customer, no orders yet", tone: "lead" })
    } else {
      facts.push({ key: "shopify", icon: ShoppingBag, text: "Not a Shopify customer", tone: "lead" })
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
    facts.push({ key: "past", icon: Sparkles, text: "First time reaching out", tone: "muted" })
  }

  if (location) {
    facts.push({ key: "location", icon: MapPin, text: location, tone: "muted" })
  }

  // The most meaningful fact leads; a paying customer keeps its emerald value tone.
  if (facts[0] && facts[0].tone === "muted") facts[0].tone = "lead"

  return (
    <div className="relative">
      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <button
          type="button"
          data-testid="conversation-context-bar"
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
          className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-foreground/[0.02]"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden whitespace-nowrap text-[13px]">
            {facts.map((fact, index) => {
              const Icon = fact.icon
              return (
                <span key={fact.key} className="flex min-w-0 items-center gap-2.5">
                  {index > 0 && <span aria-hidden className="h-3.5 w-px shrink-0 bg-foreground/10" />}
                  <span className={`flex min-w-0 items-center gap-1.5 ${TEXT_TONE[fact.tone]}`}>
                    <Icon className={`size-3.5 shrink-0 ${ICON_TONE[fact.tone]}`} />
                    <span className={index === 0 ? "truncate" : "shrink-0"}>{fact.text}</span>
                  </span>
                </span>
              )
            })}
          </div>
          <span className="ml-1 flex size-6 shrink-0 items-center justify-center rounded-full text-foreground/35 transition-colors group-hover:bg-foreground/[0.06] group-hover:text-foreground/60">
            <ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </span>
        </button>
      </div>

      {expanded && (
        <div className="absolute inset-x-0 top-[calc(100%+0.375rem)] z-30 max-h-[45vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-lg custom-scrollbar animate-in fade-in slide-in-from-top-1 duration-200">
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
