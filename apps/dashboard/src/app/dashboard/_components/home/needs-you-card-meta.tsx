"use client"

import { cn } from "@/lib/ui/cn"
import { getTagStyle } from "@/lib/ui/ticket-tags"
import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"
import { merchantSandInkClass } from "@/lib/ui/merchant-palette"
import { ChannelPill, CustomerIdentity, DatePill, MetaPill, ticketTopicLabel } from "@/components/support-card/meta-pills"

const KIND_TOPIC_LABELS: Record<HomeNeedsAttentionItem["kind"], string> = {
  quick_reply: "Reply",
  needs_review: "Review",
  needs_merchant_input: "Question",
  invalid: "Fix draft",
}

function NeedsYouTicketMetaPill({ item }: { item: HomeNeedsAttentionItem }) {
  const orderRef = item.orderRef?.trim() || null
  const customerLabel = item.customerName?.trim() || null
  const topicLabel = orderRef ?? ticketTopicLabel(item.tag, KIND_TOPIC_LABELS[item.kind])
  const topicPillClassName = orderRef
    ? merchantSandInkClass
    : getTagStyle(item.tag).className

  const channelPill = <ChannelPill channelName={item.channelName} className="w-10 shrink-0" />

  const headline = item.headline?.trim() || null

  // On desktop, with a headline, the customer hugs its name and the headline
  // takes the remaining width. On mobile the headline gets the second row.
  const customerPill = (
    <MetaPill className={cn("min-w-0 flex-1 gap-1.5 px-3", headline && "sm:max-w-[16rem] sm:flex-none sm:shrink")}>
      <CustomerIdentity
        name={customerLabel}
        isVip={item.isVip}
        className="truncate text-sm font-semibold leading-tight text-[#1a1a1a]"
        emailClassName="min-w-0 truncate text-sm font-semibold leading-tight text-[#1a1a1a]"
        domainClassName="font-medium text-[#6b5d4f]"
      />
    </MetaPill>
  )

  const headlinePill = headline ? (
    <MetaPill className="min-w-0 flex-1 px-3">
      <span className="truncate text-sm font-medium leading-tight text-[#6b5d4f]">{headline}</span>
    </MetaPill>
  ) : null

  // The headline is the merchant's context for the card, so on mobile it gets
  // its own row and wraps instead of truncating.
  const mobileHeadlinePill = headline ? (
    <MetaPill className="h-auto min-h-10 w-full px-3 py-2">
      <span className="text-sm font-medium leading-snug text-[#6b5d4f]">{headline}</span>
    </MetaPill>
  ) : null

  const topicPill = (
    <MetaPill className={cn("min-w-0 flex-1 px-3 sm:max-w-none sm:flex-none sm:shrink-0", topicPillClassName)}>
      <span className="truncate text-xs font-bold tabular-nums leading-none sm:max-w-[5.5rem]">
        {topicLabel}
      </span>
    </MetaPill>
  )

  const datePill = (
    <DatePill
      at={item.lastMessageAt}
      className="shrink-0 px-3"
      textClassName="text-xs font-semibold tabular-nums tracking-tight text-[#1a1a1a]"
    />
  )

  return (
    <>
      <div className="hidden w-full min-w-0 items-center gap-2 sm:flex">
        {channelPill}
        {customerPill}
        {headlinePill}
        {topicPill}
        {datePill}
      </div>

      <div className="flex w-full min-w-0 flex-col gap-2 sm:hidden">
        <div className="flex min-w-0 items-center gap-2">
          {channelPill}
          {customerPill}
        </div>
        {mobileHeadlinePill}
        <div className="flex min-w-0 items-center gap-2">
          {topicPill}
          {datePill}
        </div>
      </div>
    </>
  )
}

export function NeedsYouCardHeaderRow({ item }: { item: HomeNeedsAttentionItem }) {
  return <NeedsYouTicketMetaPill item={item} />
}
