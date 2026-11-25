"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import MerchantAnswerForm from "@/components/agent/MerchantAnswerForm"
import { ChannelPill, CustomerIdentity } from "@/components/support-card/meta-pills"
import { RelativeTime } from "@/components/ui/relative-time"
import { cn } from "@/lib/ui/cn"
import {
  merchantInkClass,
  merchantMetaStatusPillClass,
  merchantMutedClass,
  type MerchantMetaStatusTone,
} from "@/lib/ui/merchant-palette"
import { buildTicketCardMeta } from "../../_lib/inbox-row"
import type { InboxRow as InboxRowModel } from "../../_lib/inbox-row"
import type { Ticket } from "@/types"

type InboxRowVariant = "default" | "trust" | "spam"

const actionClassName =
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 sm:text-sm"
const primaryActionClassName = cn(actionClassName, "bg-foreground text-background hover:bg-foreground/85")
const secondaryActionClassName = cn(actionClassName, "border border-border bg-white text-[#1a1a1a] hover:bg-foreground/[0.04]")

function actionButtonLabel(row: InboxRowModel, isSending: boolean): string {
  if (isSending) return "Sending"
  if (row.decision === "send") return "Send"
  return row.status.label
}

// A row's status when no action button already says it.
function rowStatus(
  row: InboxRowModel,
  variant: InboxRowVariant,
): { label: string; tone: MerchantMetaStatusTone } | null {
  if (variant === "spam") return { label: "Filed as spam", tone: "neutral" }
  if (variant === "trust") return { label: "Outside your store", tone: "caution" }
  return row.decision ? null : row.status
}

export interface InboxTicketRowActions {
  onOpen: () => void
  onSend: () => void
  onReview: () => void
  onTrust: () => void
  onNotReal: () => void
  onRecover?: () => void
  onAnswered?: () => void
}

export function InboxTicketRow({
  ticket,
  row,
  variant = "default",
  isSending,
  actionsDisabled,
  actions,
}: {
  ticket: Ticket
  row: InboxRowModel
  variant?: InboxRowVariant
  isSending: boolean
  actionsDisabled: boolean
  actions: InboxTicketRowActions
}) {
  const [answering, setAnswering] = useState(false)
  const meta = buildTicketCardMeta(ticket)
  const customerName = meta.customerName ?? row.customerLabel
  const status = rowStatus(row, variant)
  const dim = row.isClosed
  const canAnswer = variant === "default" && row.decision === "answer" && Boolean(row.merchantQuestion)
  const showDecision = variant === "default" && (row.decision === "send" || row.decision === "review")
  // An answer row leads with what the agent is asking the merchant.
  const detail = canAnswer ? row.merchantQuestion : row.preview
  const inkClass = dim ? merchantMutedClass : merchantInkClass

  return (
    <li
      data-testid="ticket-row"
      data-ticket-id={ticket.id}
      data-ticket-channel={ticket.channelType}
      data-decision={row.decision ?? "none"}
      className="list-none transition-colors hover:bg-foreground/[0.02]"
    >
      {/* The whole summary opens the ticket; the action buttons sit above it.
          On a phone the action shares the name line so the text below runs
          full width; from sm up it takes a fixed column so times align. */}
      <div className="relative">
        <button
          type="button"
          onClick={actions.onOpen}
          aria-label={`Open conversation with ${customerName}`}
          className="absolute inset-0 cursor-pointer border-0 bg-transparent p-0"
        />
        <div className="pointer-events-none relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_9.5rem] sm:px-5">
          {meta.channelName ? (
            <ChannelPill
              channelName={meta.channelName}
              className="col-start-1 row-start-1 row-end-3 mt-0.5 size-8 self-start rounded-xl shadow-none"
            />
          ) : null}

          <div className="col-start-2 row-start-1 flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <CustomerIdentity
                name={customerName}
                className={cn("truncate text-sm font-semibold", inkClass)}
                domainClassName={cn("font-medium", merchantMutedClass)}
              />
              {/* A phone's first line keeps its room for the name. */}
              {meta.orderRef ? (
                <span className={cn("hidden shrink-0 text-xs font-medium tabular-nums sm:inline", merchantMutedClass)}>{meta.orderRef}</span>
              ) : null}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {status ? (
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", merchantMetaStatusPillClass[status.tone])}>
                  {status.label}
                </span>
              ) : null}
              <RelativeTime at={meta.lastMessageAt} className={cn("text-xs tabular-nums", merchantMutedClass)} />
            </div>
          </div>

          <div className="col-start-2 col-end-4 row-start-2 min-w-0 sm:col-end-3">
            {variant !== "spam" ? (
              <p className={cn("truncate text-sm font-medium", inkClass)}>{row.headline}</p>
            ) : null}
            {/* Send delivers this reply in one click, so the row shows all of it. */}
            {row.draft ? (
              <p
                data-testid="ticket-row-draft"
                className={cn("mt-1 whitespace-pre-wrap break-words border-l-2 border-border pl-3 text-sm", inkClass)}
              >
                {row.draft}
              </p>
            ) : detail && !answering ? (
              <p className={cn("truncate text-sm", canAnswer ? "text-amber-800" : merchantMutedClass, dim && "opacity-70")}>
                {detail}
              </p>
            ) : null}
          </div>

          <div className="pointer-events-auto col-start-3 row-start-1 flex justify-end sm:row-end-3">
            {showDecision ? (
              <button
                type="button"
                data-testid={`ticket-row-${row.decision}`}
                disabled={actionsDisabled || isSending}
                onClick={row.decision === "send" ? actions.onSend : actions.onReview}
                className={row.decision === "send" ? primaryActionClassName : secondaryActionClassName}
              >
                {isSending && <Loader2 aria-hidden className="size-3.5 animate-spin" />}
                {actionButtonLabel(row, isSending)}
              </button>
            ) : null}

            {canAnswer ? (
              <button
                type="button"
                data-testid="ticket-row-answer"
                aria-expanded={answering}
                onClick={() => setAnswering(open => !open)}
                className={secondaryActionClassName}
              >
                {answering ? "Hide" : "Answer"}
              </button>
            ) : null}

            {variant === "spam" && actions.onRecover ? (
              <button
                type="button"
                data-testid="inbox-spam-recover"
                disabled={actionsDisabled}
                onClick={actions.onRecover}
                className={secondaryActionClassName}
              >
                Not spam
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {canAnswer && answering ? (
        <div className="px-4 pb-4 sm:pl-16 sm:pr-5">
          <MerchantAnswerForm
            threadId={ticket.id}
            question={row.merchantQuestion}
            onAnswered={() => actions.onAnswered?.()}
            autoFocus
          />
        </div>
      ) : null}

      {variant === "trust" ? (
        <div className="flex flex-wrap justify-end gap-2 px-4 pb-3 sm:px-5">
          <button type="button" onClick={actions.onNotReal} disabled={actionsDisabled} className={secondaryActionClassName}>
            Mark as spam
          </button>
          <button
            type="button"
            data-testid="ticket-row-trust"
            disabled={actionsDisabled}
            onClick={actions.onTrust}
            className={primaryActionClassName}
          >
            Mark as customer
          </button>
        </div>
      ) : null}
    </li>
  )
}
