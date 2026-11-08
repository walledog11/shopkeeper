"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/ui/cn"
import { getTagStyle } from "@/lib/ui/ticket-tags"
import {
  merchantInkClass,
  merchantMetaStatusPillClass,
  merchantMutedClass,
  merchantSandInkClass,
  type MerchantMetaStatusTone,
} from "@/lib/ui/merchant-palette"
import { supportCardMetaPillShellClassName } from "@/components/support-card/styles"

import { ChannelPill, CustomerIdentity, DatePill, MetaPill, ticketTopicLabel } from "./meta-pills"

export type TicketCardMetaStatusTone = MerchantMetaStatusTone

export interface TicketCardMeta {
  /** Omit for order-only cards (shop page). */
  channelName?: string
  customerName: string | null
  lastMessageAt: string
  tag?: string | null
  orderRef?: string | null
  isVip?: boolean
  topicLabel?: string | null
  /** When set, renders instead of the tag topic pill (inbox status, etc.). */
  statusLabel?: string | null
  statusTone?: TicketCardMetaStatusTone
}

const META_STATUS_PILL_CLASS = merchantMetaStatusPillClass

function categoryLabelFromMeta(meta: TicketCardMeta): string | null {
  if (meta.topicLabel?.trim()) return meta.topicLabel.trim()
  return ticketTopicLabel(meta.tag === "General" ? null : meta.tag ?? null)
}

const ORDER_PILL_CLASS_NAME = merchantSandInkClass

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
  const showChannel = Boolean(meta.channelName?.trim())
  const orderRef = meta.orderRef?.trim() || null
  const categoryLabel = categoryLabelFromMeta(meta)
  const customerLabel = meta.customerName?.trim() || null
  if (!showChannel) {
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
          ORDER_PILL_CLASS_NAME,
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
          META_STATUS_PILL_CLASS[statusTone],
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
          {leading}
          {customerPill}
          {orderPill}
          {statusPill}
          {datePill}
          {trailing}
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:hidden">
          <div className="flex min-w-0 items-center gap-2">
            {leading}
            {customerPill ?? orderPill}
            {datePill}
            {trailing}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            {customerPill ? orderPill : null}
            {statusPill}
          </div>
        </div>
      </>
    )
  }

  const channelPill = (
    <ChannelPill channelName={meta.channelName!} className={cn(META_PILL_HEIGHT_CLASS, META_CHANNEL_PILL_CLASS)} />
  )
  const customerInner = (
    <CustomerIdentity
      name={customerLabel}
      isVip={meta.isVip}
      className="truncate text-center text-xs font-semibold leading-tight text-[#1a1a1a] sm:text-left sm:text-sm"
      emailClassName="min-w-0 truncate text-center text-xs font-semibold leading-tight text-[#1a1a1a] sm:text-left sm:text-sm"
      domainClassName="font-medium text-[#6b5d4f]"
    />
  )

  const customerPill = onCustomerClick ? (
    <button
      type="button"
      onClick={onCustomerClick}
      className={cn(
        supportCardMetaPillShellClassName,
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
    <MetaPill className={cn(fill ? META_FILL_PILL_CLASS : META_HUG_PILL_CLASS, META_PILL_HEIGHT_CLASS, getTagStyle(meta.tag ?? null).className)}>
      <span className={tailLabelClass(fill)}>
        {categoryLabel}
      </span>
    </MetaPill>
  ) : null

  const renderDatePill = (fill = false) => (
    <DatePill
      at={meta.lastMessageAt}
      className={cn(fill ? META_FILL_PILL_CLASS : META_HUG_PILL_CLASS, META_PILL_HEIGHT_CLASS)}
      textClassName={cn(tailLabelClass(fill, true), "font-semibold tracking-tight text-[#1a1a1a]")}
    />
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
