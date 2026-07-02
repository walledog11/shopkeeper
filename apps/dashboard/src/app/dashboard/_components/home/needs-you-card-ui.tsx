"use client"

import Image from "next/image"
import type { ReactNode } from "react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/ui/cn"
import { getChannelInfoByName } from "@/lib/messaging/channels"
import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"
import {
  BUBBLE_TONE,
  needsYouCardShellClassName,
  type BubbleTone,
  type NeedsYouCardVariant,
} from "./needs-you-card-styles"

function tagPillClassName(tag: string): string {
  const normalized = tag.trim().toLowerCase()

  if (normalized.includes("return") || normalized.includes("refund")) {
    return "bg-amber-100 text-amber-800 border-amber-200/70"
  }
  if (normalized.includes("ship") || normalized.includes("order")) {
    return "bg-sky-100 text-sky-800 border-sky-200/70"
  }
  if (normalized.includes("vip")) {
    return "bg-violet-100 text-violet-800 border-violet-200/70"
  }
  if (normalized === "general" || normalized === "support") {
    return "bg-stone-200/90 text-stone-600 border-stone-300/60"
  }

  return "bg-orange-100/90 text-orange-800 border-orange-200/70"
}

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
    <div className="relative z-10 rounded-t-3xl border-b border-border/60 bg-card px-5 pb-4 pt-5 sm:px-6">
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

export function NeedsYouTagBadge({ tag }: { tag: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5",
        "text-[11px] font-semibold uppercase tracking-[0.08em]",
        tagPillClassName(tag),
      )}
    >
      {tag.trim()}
    </span>
  )
}

export function NeedsYouCardHeaderRow({
  item,
  tag,
}: {
  item: HomeNeedsAttentionItem
  tag?: string | null
}) {
  const channel = getChannelInfoByName(item.channelName)

  return (
    <div className="flex items-center justify-between gap-3">
      {tag?.trim() ? (
        <NeedsYouTagBadge tag={tag.trim()} />
      ) : (
        <span aria-hidden className="shrink-0" />
      )}

      <div className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Image
          src={channel.logo}
          alt=""
          width={14}
          height={14}
          className="size-3.5 shrink-0 object-contain opacity-55"
        />
        <span>{item.channelName}</span>
        <span className="text-faint">{"\u00b7"}</span>
        <span className="tabular-nums">{item.timeAgo}</span>
      </div>
    </div>
  )
}

export function NeedsYouCustomerName({ name }: { name: string | null }) {
  if (!name?.trim()) return null

  return (
    <p className="mt-1.5 text-sm font-medium text-muted-foreground">{name.trim()}</p>
  )
}

export function NeedsYouCardTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-2 text-balance font-sans text-xl font-semibold leading-tight tracking-tight text-foreground line-clamp-3 sm:text-2xl">
      {children}
    </h3>
  )
}

export function NeedsYouBubble({
  label,
  tone,
  agentName,
  children,
  flush = false,
}: {
  label: string
  tone: BubbleTone
  agentName?: string
  children: ReactNode
  flush?: boolean
}) {
  const styles = BUBBLE_TONE[tone]
  const agentInitial = agentName?.trim()?.[0]?.toUpperCase()

  return (
    <div className={cn(flush ? "" : "mt-4", "flex flex-col gap-1")}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 self-start text-[11px] font-semibold",
          styles.label,
        )}
      >
        {tone === "reply" && agentInitial && (
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-foreground/[0.08] text-[9px] font-bold text-muted-foreground">
            {agentInitial}
          </span>
        )}
        {label}
      </span>
      <div
        className={cn(
          "rounded-2xl border px-4 py-3",
          styles.bubble,
        )}
      >
        {tone === "customer" ? (
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
