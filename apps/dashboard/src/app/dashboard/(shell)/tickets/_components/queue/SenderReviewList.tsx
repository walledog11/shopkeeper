"use client"

import Image from "next/image"
import { Ban, Check } from "lucide-react"
import { cn } from "@/lib/ui/cn"
import {
  NeedsYouPrimaryButton,
} from "@/app/dashboard/_components/home/needs-you-card-ui"
import {
  needsYouCardShellClassName,
  needsYouMetaPillShellClassName,
  needsYouSecondaryButtonClassName,
} from "@/app/dashboard/_components/home/needs-you-card-styles"
import { getChannelInfo } from "@/lib/messaging/channels"
import { customerDisplayLabel, timeAgoCard } from "@/lib/messaging/customer-display"
import { SENDER_TYPE } from "@shopkeeper/agent/thread-constants"
import type { Ticket } from "@/types"

interface SenderReviewItemProps {
  ticket: Ticket
  isActive: boolean
  disabled?: boolean
  onTrust: () => void
  onSpam: () => void
  onOpen: () => void
}

function latestCustomerText(ticket: Ticket): string {
  const latest = [...ticket.messages]
    .reverse()
    .find(message => message.sender === SENDER_TYPE.CUSTOMER)
  return (latest?.text ?? ticket.preview ?? "").trim()
}

export function SenderReviewItem({
  ticket,
  isActive,
  disabled = false,
  onTrust,
  onSpam,
  onOpen,
}: SenderReviewItemProps) {
  const channel = getChannelInfo(ticket.channelType)
  const senderLabel = customerDisplayLabel(ticket.customerRecord)
  const message = latestCustomerText(ticket)
  const at = new Date(ticket.lastMessageAt)
  const timeLabel = timeAgoCard(at, new Date())
  const isRelative = timeLabel === "Just now" || timeLabel === "Yesterday" || timeLabel.includes("ago")
  const dateLabel = isRelative
    ? timeLabel
    : at.toLocaleDateString("en-US", { month: "short", day: "numeric" })

  return (
    <article
      data-testid="sender-review-item"
      data-ticket-id={ticket.id}
      className={cn(
        needsYouCardShellClassName("briefing"),
        "gap-4 p-4 sm:p-5",
        isActive && "border-foreground/30",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            needsYouMetaPillShellClassName,
            "size-10 w-10 shrink-0 border-0",
            channel.badgeClassName,
          )}
        >
          <Image
            src={channel.logo}
            alt=""
            width={16}
            height={16}
            className="size-4 object-contain"
            aria-hidden
          />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#1a1a1a]">{senderLabel}</p>
          {ticket.filterReason ? (
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-amber-900/80">
              {ticket.filterReason}
            </p>
          ) : null}
        </div>

        <span className={cn(needsYouMetaPillShellClassName, "h-10 shrink-0 border-0 bg-white px-3")}>
          <time
            dateTime={ticket.lastMessageAt}
            className="text-xs font-semibold tabular-nums tracking-tight text-[#1a1a1a]"
          >
            {dateLabel}
          </time>
        </span>
      </div>

      <button
        type="button"
        data-testid="sender-review-open"
        disabled={disabled}
        onClick={onOpen}
        className="w-full border-0 bg-transparent p-0 text-left [font-family:inherit] disabled:opacity-50"
      >
        <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground">
          {message || "No message preview"}
        </p>
      </button>

      <div className="flex gap-2">
        <NeedsYouPrimaryButton
          data-testid="sender-review-trust"
          disabled={disabled}
          onClick={onTrust}
          className="min-w-0 flex-1 py-3 text-sm sm:text-base"
        >
          <Check className="size-4 shrink-0" aria-hidden />
          Trust sender
        </NeedsYouPrimaryButton>
        <button
          type="button"
          data-testid="sender-review-spam"
          disabled={disabled}
          onClick={onSpam}
          className={cn(
            needsYouSecondaryButtonClassName,
            "min-w-0 flex-1 gap-2 py-3 text-sm sm:text-base",
            "hover:border-red-600/30 hover:bg-red-600/[0.06] hover:text-red-700",
          )}
        >
          <Ban className="size-4 shrink-0" aria-hidden />
          Mark as spam
        </button>
      </div>
    </article>
  )
}

interface SenderReviewListProps {
  tickets: Ticket[]
  activeTicketId: string | null
  actionsDisabled?: boolean
  onTrust: (id: string) => void
  onSpam: (id: string) => void
  onOpen: (id: string) => void
}

export function SenderReviewList({
  tickets,
  activeTicketId,
  actionsDisabled = false,
  onTrust,
  onSpam,
  onOpen,
}: SenderReviewListProps) {
  return (
    <div data-testid="sender-review-list" className="flex flex-col gap-3">
      {tickets.map(ticket => (
        <SenderReviewItem
          key={ticket.id}
          ticket={ticket}
          isActive={activeTicketId === ticket.id}
          disabled={actionsDisabled}
          onTrust={() => onTrust(ticket.id)}
          onSpam={() => onSpam(ticket.id)}
          onOpen={() => onOpen(ticket.id)}
        />
      ))}
    </div>
  )
}
