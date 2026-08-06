"use client"

import Image from "next/image"
import type { ReactNode } from "react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/ui/cn"
import { getChannelInfoByName } from "@/lib/messaging/channels"
import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"
import {
  BUBBLE_TONE,
  isInboundTone,
  needsYouCardShellClassName,
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
    <div className="relative z-10 rounded-t-3xl border-b border-border/60 bg-card px-5 py-4 sm:px-6">
      {children}
    </div>
  )
}

export function NeedsYouCardBody({ children }: { children: ReactNode }) {
  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden bg-card px-5 py-4 sm:px-6">
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

export function NeedsYouCardHeaderRow({ item }: { item: HomeNeedsAttentionItem }) {
  const channel = getChannelInfoByName(item.channelName)
  const orderRef = item.orderRef?.trim()
  // The headline is usually thread.aiTitle, which tends to name the order itself.
  const showOrderRef = orderRef && !item.headline.includes(orderRef.replace(/^#/, ""))

  return (
    <div className="flex items-baseline justify-between gap-4">
      <h3 className="min-w-0 flex-1 text-balance font-sans text-xl font-semibold leading-tight tracking-tight text-foreground line-clamp-2 sm:text-2xl">
        {item.headline}
      </h3>

      <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        {item.isVip && (
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-700">
            VIP
          </span>
        )}
        {showOrderRef && (
          <>
            <span className="font-medium tabular-nums text-strong">{orderRef}</span>
            <span className="text-faint">{"\u00b7"}</span>
          </>
        )}
        <Image
          src={channel.logo}
          alt={item.channelName}
          width={14}
          height={14}
          className="size-3.5 shrink-0 object-contain opacity-55"
        />
        <span className="tabular-nums">{item.timeAgo}</span>
      </div>
    </div>
  )
}

export function NeedsYouBubble({
  label,
  tone,
  initial,
  children,
  flush = false,
}: {
  label: string
  tone: BubbleTone
  initial?: string
  children: ReactNode
  flush?: boolean
}) {
  const styles = BUBBLE_TONE[tone]
  const inbound = isInboundTone(tone)
  const chip = initial ? (
    <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-foreground/[0.08] text-[9px] font-bold text-muted-foreground">
      {initial}
    </span>
  ) : null

  return (
    <div
      className={cn(
        flush ? "" : "mt-4",
        "flex flex-col gap-1.5",
        inbound ? "items-start" : "items-end",
      )}
    >
      <span
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 text-[11px] font-semibold",
          styles.label,
        )}
      >
        {inbound && chip}
        <span className="truncate">{label}</span>
        {!inbound && chip}
      </span>
      <div className={cn("max-w-[85%] px-4 py-3 shadow-sm", styles.bubble)}>
        {inbound ? (
          <p className="text-sm leading-relaxed text-strong line-clamp-3">
            {children}
          </p>
        ) : (
          <div className="text-sm font-medium leading-relaxed text-strong line-clamp-4">
            {children}
          </div>
        )}
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
