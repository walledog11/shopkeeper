"use client"

import Image from "next/image"
import type { ReactNode } from "react"
import { cn } from "@/lib/ui/cn"
import { getChannelInfoByName } from "@/lib/messaging/channels"
import { timeAgoCard } from "@/lib/messaging/customer-display"
import { getTagStyle } from "@/app/dashboard/_lib/ticket-tags"
import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"
import { needsYouMetaPillShellClassName } from "./needs-you-card-styles"

function MetaPill({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn(needsYouMetaPillShellClassName, "justify-start bg-white", className)}>
      {children}
    </div>
  )
}

const ONE_WORD_TAG_LABELS: Record<string, string> = {
  "Order Status": "Status",
  "Product Inquiry": "Product",
  needs_human: "Escalated",
}

const KIND_TOPIC_LABELS: Record<HomeNeedsAttentionItem["kind"], string> = {
  quick_reply: "Reply",
  needs_review: "Review",
  needs_merchant_input: "Question",
  invalid: "Fix draft",
}

export type TicketCardMetaStatusTone = "send" | "caution" | "neutral" | "danger"

export interface TicketCardMeta {
  channelName: string
  customerName: string | null
  lastMessageAt: string
  tag: string | null
  orderRef?: string | null
  isVip?: boolean
  topicLabel?: string | null
  /** When set, renders instead of the tag topic pill (inbox status, etc.). */
  statusLabel?: string | null
  statusTone?: TicketCardMetaStatusTone
}

const META_STATUS_PILL_CLASS: Record<TicketCardMetaStatusTone, string> = {
  send: "bg-[#f5ebe0] text-[#1a1a1a]",
  caution: "bg-[#fff4e5] text-[#1a1a1a]",
  neutral: "bg-white text-[#6b5d4f]",
  danger: "bg-[#fff4e5] text-red-800",
}

function topicLabelFromTag(tag: string | null, fallback: string | null = null): string | null {
  if (!tag || tag === "General") return fallback
  if (ONE_WORD_TAG_LABELS[tag]) return ONE_WORD_TAG_LABELS[tag]
  const tagLabel = getTagStyle(tag).label
  const [firstWord] = tagLabel.split(/\s+/)
  return firstWord || fallback
}

function categoryLabelFromMeta(meta: TicketCardMeta): string | null {
  if (meta.topicLabel?.trim()) return meta.topicLabel.trim()
  return topicLabelFromTag(meta.tag ?? null)
}

const ORDER_PILL_CLASS_NAME = "bg-[#f5ebe0] text-[#1a1a1a]"

const META_PILL_HEIGHT_CLASS = "h-9 sm:h-10"
const META_CHANNEL_PILL_CLASS = "h-9 w-9 shrink-0 sm:h-10 sm:w-10"
const META_HUG_PILL_CLASS = "shrink-0 px-2.5 sm:px-3"
const META_FILL_PILL_CLASS = "min-w-0 flex-1 justify-center px-2"

export function TicketCardMetaRow({
  meta,
  leading,
  trailing,
  onCustomerClick,
}: {
  meta: TicketCardMeta
  leading?: ReactNode
  trailing?: ReactNode
  onCustomerClick?: () => void
}) {
  const channel = getChannelInfoByName(meta.channelName)
  const orderRef = meta.orderRef?.trim() || null
  const categoryLabel = categoryLabelFromMeta(meta)
  const customerLabel = meta.customerName?.trim() || null
  const at = new Date(meta.lastMessageAt)
  const timeLabel = timeAgoCard(at, new Date())
  const isRelative = timeLabel === "Just now" || timeLabel === "Yesterday" || timeLabel.includes("ago")
  const dateLabel = isRelative
    ? timeLabel
    : at.toLocaleDateString("en-US", { month: "short", day: "numeric" })

  const emailAt = customerLabel?.indexOf("@") ?? -1
  const isEmail = emailAt > 0
  const localPart = customerLabel && isEmail ? customerLabel.slice(0, emailAt) : customerLabel
  const emailDomain = customerLabel && isEmail ? customerLabel.slice(emailAt + 1) : null

  const channelPill = (
    <div className={cn(needsYouMetaPillShellClassName, META_PILL_HEIGHT_CLASS, META_CHANNEL_PILL_CLASS, channel.badgeClassName)}>
      <Image
        src={channel.logo}
        alt=""
        width={16}
        height={16}
        className="size-4 shrink-0 object-contain"
        aria-hidden
      />
      <span className="sr-only">{channel.label}</span>
    </div>
  )

  const customerInner = (
    <>
      {customerLabel && (
        isEmail ? (
          <span className="min-w-0 truncate text-center text-xs font-semibold leading-tight text-[#1a1a1a] sm:text-left sm:text-sm">
            <span>{localPart}</span>
            <span className="font-medium text-[#6b5d4f]">@{emailDomain}</span>
          </span>
        ) : (
          <span className="truncate text-center text-xs font-semibold leading-tight text-[#1a1a1a] sm:text-left sm:text-sm">
            {customerLabel}
          </span>
        )
      )}
      {meta.isVip && (
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-violet-700">
          VIP
        </span>
      )}
    </>
  )

  const customerPill = onCustomerClick ? (
    <button
      type="button"
      onClick={onCustomerClick}
      className={cn(
        needsYouMetaPillShellClassName,
        "min-w-0 flex-1 cursor-pointer gap-1.5 bg-white px-2.5 justify-center sm:justify-start sm:px-3",
        META_PILL_HEIGHT_CLASS,
      )}
    >
      {customerInner}
    </button>
  ) : (
    <MetaPill className={cn("min-w-0 flex-1 justify-center gap-1.5 px-2.5 sm:justify-start sm:px-3", META_PILL_HEIGHT_CLASS)}>
      {customerInner}
    </MetaPill>
  )

  const tailLabelClass = (fill: boolean, tabular = false) => cn(
    "text-[11px] font-bold leading-none sm:text-xs",
    tabular && "tabular-nums",
    fill ? "min-w-0 truncate text-center" : "whitespace-nowrap",
  )

  const renderOrderPill = (fill = false) => orderRef ? (
    <MetaPill className={cn(fill ? META_FILL_PILL_CLASS : META_HUG_PILL_CLASS, META_PILL_HEIGHT_CLASS, ORDER_PILL_CLASS_NAME)}>
      <span className={tailLabelClass(fill, true)}>
        {orderRef}
      </span>
    </MetaPill>
  ) : null

  const renderStatusPill = (fill = false) => meta.statusLabel ? (
    <MetaPill className={cn(
      fill ? META_FILL_PILL_CLASS : META_HUG_PILL_CLASS,
      META_PILL_HEIGHT_CLASS,
      META_STATUS_PILL_CLASS[meta.statusTone ?? "neutral"],
    )}
    >
      <span className={tailLabelClass(fill)}>
        {meta.statusLabel}
      </span>
    </MetaPill>
  ) : null

  const renderTopicPill = (fill = false) => !meta.statusLabel && categoryLabel ? (
    <MetaPill className={cn(fill ? META_FILL_PILL_CLASS : META_HUG_PILL_CLASS, META_PILL_HEIGHT_CLASS, getTagStyle(meta.tag).className)}>
      <span className={tailLabelClass(fill)}>
        {categoryLabel}
      </span>
    </MetaPill>
  ) : null

  const renderDatePill = (fill = false) => (
    <MetaPill className={cn(fill ? META_FILL_PILL_CLASS : META_HUG_PILL_CLASS, META_PILL_HEIGHT_CLASS)}>
      <time
        dateTime={meta.lastMessageAt}
        className={cn(
          tailLabelClass(fill, true),
          "font-semibold tracking-tight text-[#1a1a1a]",
        )}
      >
        {dateLabel}
      </time>
    </MetaPill>
  )

  const orderPill = renderOrderPill()
  const statusPill = renderStatusPill()
  const topicPill = renderTopicPill()
  const datePill = renderDatePill()
  const hasTailPills = Boolean(orderPill || statusPill || topicPill || datePill)

  return (
    <>
      <div className="hidden w-full min-w-0 items-center gap-2 sm:flex">
        {leading}
        {channelPill}
        {customerPill}
        {orderPill}
        {statusPill}
        {topicPill}
        {datePill}
        {trailing}
      </div>

      <div className="flex w-full min-w-0 flex-col gap-2 sm:hidden">
        <div className="flex w-full min-w-0 items-center gap-1.5">
          {leading}
          {channelPill}
          {customerPill}
          {trailing}
        </div>
        {hasTailPills ? (
          <div className="flex w-full min-w-0 items-center gap-1.5">
            {renderOrderPill(true)}
            {renderStatusPill(true)}
            {renderTopicPill(true)}
            {renderDatePill(true)}
          </div>
        ) : null}
      </div>
    </>
  )
}

function oneWordTicketTopicLabel(item: HomeNeedsAttentionItem): string {
  if (item.tag) {
    if (ONE_WORD_TAG_LABELS[item.tag]) return ONE_WORD_TAG_LABELS[item.tag]
    const tagLabel = getTagStyle(item.tag).label
    const [firstWord] = tagLabel.split(/\s+/)
    if (firstWord) return firstWord
  }
  return KIND_TOPIC_LABELS[item.kind]
}

function NeedsYouTicketMetaPill({ item }: { item: HomeNeedsAttentionItem }) {
  const channel = getChannelInfoByName(item.channelName)
  const orderRef = item.orderRef?.trim() || null
  const customerLabel = item.customerName?.trim() || null
  const at = new Date(item.lastMessageAt)
  const timeLabel = timeAgoCard(at, new Date())
  const isRelative = timeLabel === "Just now" || timeLabel === "Yesterday" || timeLabel.includes("ago")
  const dateLabel = isRelative
    ? timeLabel
    : at.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  const topicLabel = orderRef ?? oneWordTicketTopicLabel(item)
  const topicPillClassName = orderRef
    ? "bg-[#f5ebe0] text-[#1a1a1a]"
    : getTagStyle(item.tag).className

  const emailAt = customerLabel?.indexOf("@") ?? -1
  const isEmail = emailAt > 0
  const localPart = customerLabel && isEmail ? customerLabel.slice(0, emailAt) : customerLabel
  const emailDomain = customerLabel && isEmail ? customerLabel.slice(emailAt + 1) : null

  const channelPill = (
    <div className={cn(needsYouMetaPillShellClassName, channel.badgeClassName, "w-10 shrink-0")}>
      <Image
        src={channel.logo}
        alt=""
        width={16}
        height={16}
        className="size-4 shrink-0 object-contain"
        aria-hidden
      />
      <span className="sr-only">{channel.label}</span>
    </div>
  )

  const headline = item.headline?.trim() || null

  // On desktop, with a headline, the customer hugs its name and the headline
  // takes the remaining width. On mobile the headline gets the second row.
  const customerPill = (
    <MetaPill className={cn("min-w-0 flex-1 gap-1.5 px-3", headline && "sm:max-w-[16rem] sm:flex-none sm:shrink")}>
      {customerLabel && (
        isEmail ? (
          <span className="min-w-0 truncate text-sm font-semibold leading-tight text-[#1a1a1a]">
            <span>{localPart}</span>
            <span className="font-medium text-[#6b5d4f]">@{emailDomain}</span>
          </span>
        ) : (
          <span className="truncate text-sm font-semibold leading-tight text-[#1a1a1a]">
            {customerLabel}
          </span>
        )
      )}
      {item.isVip && (
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-violet-700">
          VIP
        </span>
      )}
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
    <MetaPill className="shrink-0 px-3">
      <time
        dateTime={item.lastMessageAt}
        className="text-xs font-semibold tabular-nums tracking-tight text-[#1a1a1a]"
      >
        {dateLabel}
      </time>
    </MetaPill>
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
