"use client"

import { cn } from "@/lib/ui/cn"
import {
  merchantInkClass,
  merchantMetaStatusPillClass,
  merchantMutedClass,
  merchantSandInkClass,
  type MerchantMetaStatusTone,
} from "@/lib/ui/merchant-palette"

import { CustomerIdentity, DatePill, MetaPill } from "./meta-pills"

export type TicketCardMetaStatusTone = MerchantMetaStatusTone

export interface TicketCardMeta {
  channelName?: string
  customerName: string | null
  lastMessageAt: string
  tag?: string | null
  orderRef?: string | null
  isVip?: boolean
  statusLabel?: string | null
  statusTone?: TicketCardMetaStatusTone
}

const META_PILL_HEIGHT_CLASS = "h-9 sm:h-10"

/** The pill header of an order card on the Shop page. */
export function TicketCardMetaRow({
  meta,
}: {
  meta: Pick<TicketCardMeta, "customerName" | "lastMessageAt" | "orderRef" | "statusLabel" | "statusTone">
}) {
  const orderRef = meta.orderRef?.trim() || null
  const customerLabel = meta.customerName?.trim() || null
  const statusLabel = meta.statusLabel?.trim() ?? ""
  const statusTone = meta.statusTone ?? "neutral"

  const customerPill = customerLabel ? (
    <MetaPill className={cn("min-w-0 flex-1 gap-1.5 px-2.5 sm:px-3", META_PILL_HEIGHT_CLASS)}>
      <CustomerIdentity
        name={customerLabel}
        className={cn("truncate text-xs font-semibold leading-tight sm:text-sm", merchantInkClass)}
        emailClassName={cn("min-w-0 truncate text-xs font-semibold leading-tight sm:text-sm", merchantInkClass)}
        domainClassName={cn("font-medium", merchantMutedClass)}
      />
    </MetaPill>
  ) : null

  const orderPill = orderRef ? (
    <MetaPill
      className={cn(
        "shrink-0 px-2.5 sm:px-3",
        META_PILL_HEIGHT_CLASS,
        merchantSandInkClass,
        !customerPill && "min-w-0 flex-1",
      )}
    >
      <span className="truncate text-[11px] font-bold leading-none tabular-nums sm:text-xs">{orderRef}</span>
    </MetaPill>
  ) : null

  const statusPill = statusLabel ? (
    <MetaPill
      className={cn(
        "shrink-0 px-2.5 sm:px-3",
        META_PILL_HEIGHT_CLASS,
        merchantMetaStatusPillClass[statusTone],
      )}
    >
      <span className="whitespace-nowrap text-[11px] font-bold leading-none sm:text-xs">{statusLabel}</span>
    </MetaPill>
  ) : null

  const datePill = (
    <DatePill
      at={meta.lastMessageAt}
      className={cn("shrink-0 px-2.5 sm:px-3", META_PILL_HEIGHT_CLASS)}
      textClassName={cn("text-[11px] font-semibold tabular-nums tracking-tight sm:text-xs", merchantInkClass)}
    />
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
