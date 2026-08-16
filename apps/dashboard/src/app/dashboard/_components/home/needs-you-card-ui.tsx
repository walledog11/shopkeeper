"use client"

import Image from "next/image"
import type { ReactNode } from "react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/ui/cn"
import { getChannelInfoByName } from "@/lib/messaging/channels"
import { timeAgoCard } from "@/lib/messaging/customer-display"
import { getTagStyle } from "@/app/dashboard/_lib/ticket-tags"
import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"
import {
  BUBBLE_TONE,
  isInboundTone,
  needsYouMetaPillShellClassName,
  needsYouSoftShadowClassName,
  needsYouCardShellClassName,
  needsYouConversationSurfaceClassName,
  type BubbleTone,
  type NeedsYouCardVariant,
} from "./needs-you-card-styles"

export function NeedsYouCardShell({
  confirming = false,
  variant = "front",
  minHeight,
  pointerEventsNone = false,
  className,
  children,
}: {
  confirming?: boolean
  variant?: NeedsYouCardVariant
  minHeight?: number
  pointerEventsNone?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <Card
      className={cn(
        needsYouCardShellClassName(variant),
        pointerEventsNone && "pointer-events-none",
        className,
      )}
      style={minHeight ? { minHeight, maxHeight: minHeight } : undefined}
    >
      {confirming && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-16 bg-gradient-to-b from-amber-500/12 to-transparent"
        />
      )}
      {children}
    </Card>
  )
}

export function NeedsYouCardHeader({ children }: { children: ReactNode }) {
  return (
    <div className="relative z-10 rounded-t-3xl border-b border-border/60 bg-card px-5 py-3.5 sm:px-6">
      {children}
    </div>
  )
}

export function NeedsYouCardBody({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        "relative z-10 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-5 py-4 sm:px-6",
        needsYouConversationSurfaceClassName(),
      )}
    >
      {children}
    </div>
  )
}

export function NeedsYouCardFooter({ children }: { children: ReactNode }) {
  return (
    <div className="relative z-10 mt-auto rounded-b-3xl border-t border-border/50 bg-muted/30 px-5 py-4 sm:px-6">
      {children}
    </div>
  )
}

export function NeedsYouEscalationCallout({ reason }: { reason: string | null }) {
  return (
    <div
      className={cn(
        needsYouSoftShadowClassName,
        "mt-3 rounded-2xl border border-amber-600/20 bg-[#fff4e5] px-4 py-3",
      )}
    >
      <p className="text-sm font-semibold text-[#1a1a1a]">
        Needs a human — no reply drafted
      </p>
      <p className="mt-1 text-sm leading-relaxed text-[#6b5d4f]">
        {reason
          ? reason
          : "Shopkeeper flagged this for you instead of sending a customer message. Open the ticket to reply or re-draft."}
      </p>
    </div>
  )
}

function MetaPill({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn(needsYouMetaPillShellClassName, "bg-white", className)}>
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

  return (
    <div className="flex w-full min-w-0 items-center gap-2">
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

      <MetaPill className="min-w-0 flex-1 gap-1.5 px-3">
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

      <MetaPill className={cn("shrink-0 px-3", topicPillClassName)}>
        <span className="max-w-[5.5rem] truncate text-xs font-bold tabular-nums leading-none">
          {topicLabel}
        </span>
      </MetaPill>

      <MetaPill className="shrink-0 px-3">
        <time
          dateTime={item.lastMessageAt}
          className="text-xs font-semibold tabular-nums tracking-tight text-[#1a1a1a]"
        >
          {dateLabel}
        </time>
      </MetaPill>
    </div>
  )
}

export function NeedsYouCardHeaderRow({ item }: { item: HomeNeedsAttentionItem }) {
  return <NeedsYouTicketMetaPill item={item} />
}

export function NeedsYouBubble({
  tone,
  children,
  flush = false,
}: {
  tone: BubbleTone
  children: ReactNode
  flush?: boolean
}) {
  const styles = BUBBLE_TONE[tone]
  const inbound = isInboundTone(tone)

  return (
    <div
      className={cn(
        flush ? "" : "mt-1",
        "max-w-[88%]",
        inbound ? "self-start" : "self-end ml-auto",
      )}
    >
      <div className={cn("px-3.5 py-2.5", styles.bubble)}>
        <div className={cn("whitespace-pre-wrap break-words", styles.text)}>
          {children}
        </div>
      </div>
    </div>
  )
}

export function NeedsYouPrimaryButton({
  children,
  className,
  confirming = false,
  disabled = false,
  onClick,
}: {
  children: ReactNode
  className?: string
  confirming?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-semibold transition-all",
        "disabled:opacity-40 disabled:hover:translate-y-0",
        confirming
          ? "bg-gradient-to-b from-amber-600 to-amber-700 text-[#ffffff] shadow-md shadow-amber-600/20 hover:-translate-y-0.5 hover:from-amber-600 hover:to-amber-700/95"
          : "bg-gradient-to-b from-foreground to-foreground/90 text-background shadow-md shadow-foreground/10 hover:-translate-y-0.5 hover:from-foreground hover:to-foreground/85",
        className,
      )}
    >
      {children}
    </button>
  )
}
