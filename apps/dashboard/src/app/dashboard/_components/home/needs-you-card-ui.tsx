"use client"

import Image from "next/image"
import type { ReactNode } from "react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/ui/cn"
import { getChannelInfoByName } from "@/lib/messaging/channels"
import { timeAgoCard } from "@/lib/messaging/customer-display"
import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"
import {
  BUBBLE_TONE,
  isInboundTone,
  needsYouMetaPillClassName,
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

function NeedsYouTicketMetaPill({ item }: { item: HomeNeedsAttentionItem }) {
  const channel = getChannelInfoByName(item.channelName)
  const orderRef = item.orderRef?.trim()
  const showOrderRef = Boolean(orderRef && !item.headline.includes(orderRef.replace(/^#/, "")))
  const customerLabel = item.customerName?.trim() || null
  const at = new Date(item.lastMessageAt)
  const timeLabel = timeAgoCard(at, new Date())
  const isRelative = timeLabel === "Just now" || timeLabel === "Yesterday" || timeLabel.includes("ago")

  const emailAt = customerLabel?.indexOf("@") ?? -1
  const isEmail = emailAt > 0
  const localPart = customerLabel && isEmail ? customerLabel.slice(0, emailAt) : customerLabel
  const emailDomain = customerLabel && isEmail ? customerLabel.slice(emailAt + 1) : null

  return (
    <div
      className={cn(
        "flex w-full min-w-0 items-stretch divide-x divide-border/60",
        needsYouMetaPillClassName,
      )}
    >
      {customerLabel && (
        <div className="flex min-w-0 flex-1 flex-col justify-center px-3 py-1.5">
          <span className="text-[8px] font-bold uppercase tracking-[0.14em] text-[#6b5d4f]">
            From
          </span>
          {isEmail ? (
            <span className="min-w-0 truncate text-xs font-semibold leading-tight text-[#1a1a1a]">
              <span>{localPart}</span>
              <span className="font-medium text-[#6b5d4f]">@{emailDomain}</span>
            </span>
          ) : (
            <span className="truncate text-xs font-semibold leading-tight text-[#1a1a1a]">
              {customerLabel}
            </span>
          )}
        </div>
      )}

      {(showOrderRef || item.isVip) && (
        <div className="flex shrink-0 flex-col items-center justify-center gap-0.5 bg-[#f5ebe0] px-2.5 py-1.5">
          {showOrderRef && orderRef && (
            <span className="text-[10px] font-bold tabular-nums leading-none text-[#1a1a1a]">
              {orderRef}
            </span>
          )}
          {item.isVip && (
            <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-violet-700">
              VIP
            </span>
          )}
        </div>
      )}

      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 px-2.5 py-1.5 text-[10px] font-semibold",
          channel.badgeClassName,
        )}
      >
        <Image
          src={channel.logo}
          alt=""
          width={12}
          height={12}
          className="size-3 shrink-0 object-contain"
          aria-hidden
        />
        <span className="max-w-[5rem] truncate">{channel.label}</span>
      </span>

      {isRelative ? (
        <time
          dateTime={item.lastMessageAt}
          className="flex shrink-0 items-center px-2.5 py-1.5 text-[10px] font-semibold tabular-nums tracking-tight text-[#1a1a1a]"
        >
          {timeLabel}
        </time>
      ) : (
        <time
          dateTime={item.lastMessageAt}
          className="flex min-w-[2.65rem] shrink-0 flex-col items-center justify-center bg-[#f5ebe0] px-2 py-1 text-center"
        >
          <span className="text-[8px] font-bold uppercase tracking-[0.14em] text-[#6b5d4f]">
            {at.toLocaleDateString("en-US", { month: "short" })}
          </span>
          <span className="text-sm font-bold tabular-nums leading-none text-[#1a1a1a]">
            {at.getDate()}
          </span>
        </time>
      )}
    </div>
  )
}

export function NeedsYouCardHeaderRow({ item }: { item: HomeNeedsAttentionItem }) {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <NeedsYouTicketMetaPill item={item} />

      <h3 className="w-full text-balance text-center font-sans text-xl font-semibold leading-tight tracking-tight text-foreground line-clamp-2 sm:text-2xl">
        {item.headline}
      </h3>
    </div>
  )
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
        <div className={cn("whitespace-pre-wrap break-words line-clamp-4", styles.text)}>
          {children}
        </div>
      </div>
    </div>
  )
}

export function NeedsYouPrimaryButton({
  children,
  confirming = false,
  disabled = false,
  onClick,
}: {
  children: ReactNode
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
      )}
    >
      {children}
    </button>
  )
}
