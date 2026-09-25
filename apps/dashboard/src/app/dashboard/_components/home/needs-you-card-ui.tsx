"use client"

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/ui/cn"
import type { HomeActionDisplay } from "@shopkeeper/agent/plan-preview"
import {
  BUBBLE_TONE,
  isInboundTone,
  needsYouSoftShadowClassName,
  needsYouCardFooterClassName,
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

export function NeedsYouCardHeader({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative z-10 rounded-t-3xl border-b border-border/60 bg-white px-4 py-2.5 sm:px-5 sm:py-3.5 md:px-6",
        className,
      )}
    >
      {children}
    </div>
  )
}

export const NeedsYouCardBody = forwardRef<HTMLDivElement, {
  children: ReactNode
  className?: string
}>(function NeedsYouCardBody({ children, className }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "relative z-10 flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden px-4 py-3 sm:gap-3 sm:px-5 sm:py-4 md:px-6",
        needsYouConversationSurfaceClassName(),
        className,
      )}
    >
      {children}
    </div>
  )
})

export function NeedsYouCardFooter({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative z-10 mt-auto px-5 py-4 sm:px-6",
        needsYouCardFooterClassName,
        className,
      )}
    >
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

export function NeedsYouInfoCallout({
  children,
  actionLabel,
  onAction,
  title,
}: {
  children: ReactNode
  actionLabel?: string
  onAction?: () => void
  title?: string
}) {
  return (
    <div
      className={cn(
        needsYouSoftShadowClassName,
        "rounded-2xl border border-amber-600/20 bg-[#fff4e5] px-4 py-3",
      )}
    >
      {title ? (
        <p className="text-sm font-semibold text-[#1a1a1a]">{title}</p>
      ) : null}
      <p className={cn("text-sm leading-relaxed text-[#6b5d4f]", title && "mt-1")}>
        {children}
      </p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 text-xs font-semibold text-[#6b5d4f] transition-colors hover:text-[#1a1a1a]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

export function NeedsYouActionReceipt({
  display,
  hideOrderRef = false,
}: {
  display: HomeActionDisplay
  hideOrderRef?: boolean
}) {
  const showOrderRef = Boolean(display.orderRef) && !hideOrderRef
  const detailText = display.detailLines.join(", ")

  return (
    <div
      className={cn(
        needsYouSoftShadowClassName,
        "inline-flex max-w-full rounded-2xl bg-white px-3 py-2",
      )}
    >
      <p className="min-w-0 text-sm leading-snug">
        <span className="font-bold text-[#1a1a1a]">{display.chipLabel}</span>
        {showOrderRef ? (
          <>
            <span className="text-[#6b5d4f]/50"> · </span>
            <span className="font-bold tabular-nums text-[#1a1a1a]">{display.orderRef}</span>
          </>
        ) : null}
        {detailText ? (
          <>
            <span className="text-[#6b5d4f]/50"> · </span>
            <span className="text-[#6b5d4f]">{detailText}</span>
          </>
        ) : null}
      </p>
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
        flush ? "" : "mt-0.5 sm:mt-1",
        "max-w-[94%] sm:max-w-[88%]",
        inbound ? "self-start" : "self-end ml-auto",
      )}
    >
      <div className={cn("px-3 py-2 sm:px-3.5 sm:py-2.5", styles.bubble)}>
        <div className={cn(
          "whitespace-pre-wrap break-words text-[14px] leading-[1.45] sm:text-[15px] sm:leading-[1.4]",
          styles.text,
        )}>
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
  size = "default",
  onClick,
  ...props
}: {
  children: ReactNode
  className?: string
  confirming?: boolean
  disabled?: boolean
  size?: "default" | "compact"
  onClick?: () => void
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold transition-all",
        size === "compact"
          ? "w-auto shrink-0 whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm"
          : "w-full rounded-2xl py-3.5 text-base",
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
