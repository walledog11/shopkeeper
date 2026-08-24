"use client"

import { cn } from "@/lib/ui/cn"
import { timeAgoCard } from "@/lib/messaging/customer-display"
import { needsYouMetaPillShellClassName } from "@/app/dashboard/_components/home/needs-you-card-styles"
import type { TicketCardMetaStatusTone } from "@/app/dashboard/_components/home/needs-you-card-ui"

const META_PILL_HEIGHT_CLASS = "h-9 sm:h-10"
const ORDER_PILL_CLASS_NAME = "bg-[#f5ebe0] text-[#1a1a1a]"
const META_STATUS_PILL_CLASS: Record<TicketCardMetaStatusTone, string> = {
  send: "bg-[#f5ebe0] text-[#1a1a1a]",
  caution: "bg-[#fff4e5] text-[#1a1a1a]",
  neutral: "bg-white text-[#6b5d4f]",
  danger: "bg-[#fff4e5] text-red-800",
}

function MetaPill({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn(needsYouMetaPillShellClassName, "justify-start bg-white", className)}>
      {children}
    </div>
  )
}

interface ShopCardMeta {
  customerName: string | null
  orderRef: string | null
  lastMessageAt: string
  statusLabel: string
  statusTone: TicketCardMetaStatusTone
}

export function ShopCardMetaRow({ meta }: { meta: ShopCardMeta }) {
  const at = new Date(meta.lastMessageAt)
  const timeLabel = timeAgoCard(at, new Date())
  const isRelative = timeLabel === "Just now" || timeLabel === "Yesterday" || timeLabel.includes("ago")
  const dateLabel = isRelative
    ? timeLabel
    : at.toLocaleDateString("en-US", { month: "short", day: "numeric" })

  const customerLabel = meta.customerName?.trim() || null
  const emailAt = customerLabel?.indexOf("@") ?? -1
  const isEmail = emailAt > 0
  const localPart = customerLabel && isEmail ? customerLabel.slice(0, emailAt) : customerLabel
  const emailDomain = customerLabel && isEmail ? customerLabel.slice(emailAt + 1) : null

  const customerPill = customerLabel ? (
    <MetaPill className={cn("min-w-0 flex-1 gap-1.5 px-2.5 sm:px-3", META_PILL_HEIGHT_CLASS)}>
      {isEmail ? (
        <span className="min-w-0 truncate text-xs font-semibold leading-tight text-[#1a1a1a] sm:text-sm">
          <span>{localPart}</span>
          <span className="font-medium text-[#6b5d4f]">@{emailDomain}</span>
        </span>
      ) : (
        <span className="truncate text-xs font-semibold leading-tight text-[#1a1a1a] sm:text-sm">
          {customerLabel}
        </span>
      )}
    </MetaPill>
  ) : null

  const orderPill = meta.orderRef ? (
    <MetaPill className={cn(
      "shrink-0 px-2.5 sm:px-3",
      META_PILL_HEIGHT_CLASS,
      ORDER_PILL_CLASS_NAME,
      !customerPill && "min-w-0 flex-1",
    )}
    >
      <span className="truncate text-[11px] font-bold leading-none tabular-nums sm:text-xs">
        {meta.orderRef}
      </span>
    </MetaPill>
  ) : null

  const statusPill = (
    <MetaPill className={cn(
      "shrink-0 px-2.5 sm:px-3",
      META_PILL_HEIGHT_CLASS,
      META_STATUS_PILL_CLASS[meta.statusTone],
    )}
    >
      <span className="whitespace-nowrap text-[11px] font-bold leading-none sm:text-xs">
        {meta.statusLabel}
      </span>
    </MetaPill>
  )

  const datePill = (
    <MetaPill className={cn("shrink-0 px-2.5 sm:px-3", META_PILL_HEIGHT_CLASS)}>
      <time
        dateTime={meta.lastMessageAt}
        className="text-[11px] font-semibold tabular-nums tracking-tight text-[#1a1a1a] sm:text-xs"
      >
        {dateLabel}
      </time>
    </MetaPill>
  )

  return (
    <>
      <div className="hidden w-full min-w-0 items-center gap-2 sm:flex">
        {customerPill}
        {orderPill}
        {statusPill}
        {datePill}
      </div>
      <div className="flex w-full min-w-0 flex-col gap-2 sm:hidden">
        <div className="flex min-w-0 items-center gap-2">
          {customerPill ?? orderPill}
          {datePill}
        </div>
        <div className="flex min-w-0 items-center gap-2">
          {customerPill ? orderPill : null}
          {statusPill}
        </div>
      </div>
    </>
  )
}
