"use client"

import { Loader2 } from "lucide-react"
import MerchantAnswerForm from "@/components/agent/MerchantAnswerForm"
import { cn } from "@/lib/ui/cn"
import {
  NeedsYouCardBody,
  NeedsYouCardFooter,
  NeedsYouCardHeader,
  NeedsYouCardShell,
  NeedsYouPrimaryButton,
} from "@/app/dashboard/_components/home/needs-you-card-ui"
import {
  TicketCardMetaRow,
  type TicketCardMeta,
  type TicketCardMetaStatusTone,
} from "@/app/dashboard/_components/home/needs-you-card-meta"
import { needsYouSecondaryButtonClassName } from "@/app/dashboard/_components/home/needs-you-card-styles"
import { buildTicketCardMeta } from "../../_lib/inbox-row"
import type { InboxRow as InboxRowModel, InboxRowDecision } from "../../_lib/inbox-row"
import type { Ticket } from "@/types"

const DECISION_LABEL: Record<Exclude<InboxRowDecision, "trust">, string> = {
  send: "Send",
  review: "Review",
  answer: "Answer",
}

function actionButtonLabel(row: InboxRowModel, isSending: boolean): string {
  if (isSending) return "Sending"
  if (row.decision === "send") return DECISION_LABEL.send
  if (row.decision === "answer") return DECISION_LABEL.answer
  return row.status.label
}

const compactSecondaryClassName = cn(
  needsYouSecondaryButtonClassName,
  "shrink-0 whitespace-nowrap px-4 py-2.5 text-sm",
)

function inboxHeaderMeta(
  ticket: Ticket,
  row: InboxRowModel,
  variant: "default" | "trust" | "spam",
): TicketCardMeta {
  const base = buildTicketCardMeta(ticket)
  let statusLabel: string | null = null
  let statusTone: TicketCardMetaStatusTone | undefined

  if (variant === "spam") {
    statusLabel = "Filed as spam"
    statusTone = "neutral"
  } else if (variant === "trust") {
    statusLabel = "Outside your store"
    statusTone = "caution"
  } else if (!row.decision) {
    statusLabel = row.status.label
    statusTone = row.status.tone
  }

  return {
    ...base,
    statusLabel,
    statusTone,
  }
}

export interface InboxTicketCardActions {
  onOpen: () => void
  onSend: () => void
  onReview: () => void
  onTrust: () => void
  onNotReal: () => void
  onRecover?: () => void
  onAnswered?: () => void
}

export function InboxTicketCard({
  ticket,
  row,
  variant = "default",
  isSending,
  actionsDisabled,
  actions,
}: {
  ticket: Ticket
  row: InboxRowModel
  variant?: "default" | "trust" | "spam"
  isSending: boolean
  actionsDisabled: boolean
  actions: InboxTicketCardActions
}) {
  const dim = row.isClosed
  const headerMeta = inboxHeaderMeta(ticket, row, variant)
  const showMerchantAnswer = variant === "default" && row.decision === "answer" && row.merchantQuestion
  const showDraftFooter = variant === "default" && row.decision && row.decision !== "trust" && row.decision !== "answer"
  const showTrustFooter = variant === "trust"
  const showSpamFooter = variant === "spam"
  const showHeadline = variant === "default" || variant === "trust"

  return (
    <li
      data-testid="ticket-row"
      data-ticket-id={ticket.id}
      data-ticket-channel={ticket.channelType}
      data-decision={row.decision ?? "none"}
      className={cn("list-none", dim && "brightness-[0.98] saturate-[0.92]")}
    >
      <NeedsYouCardShell className={cn(dim && "opacity-90")}>
        <NeedsYouCardHeader>
          <button
            type="button"
            onClick={actions.onOpen}
            className="flex w-full min-w-0 cursor-pointer border-0 bg-transparent p-0 text-left [font-family:inherit]"
          >
            <TicketCardMetaRow meta={headerMeta} />
          </button>
        </NeedsYouCardHeader>

        <NeedsYouCardBody className="gap-2 py-2.5 sm:py-3">
          <button
            type="button"
            onClick={actions.onOpen}
            className="w-full border-0 bg-transparent p-0 text-left [font-family:inherit]"
          >
            {showHeadline && (
              <h3 className={cn(
                "mb-1.5 line-clamp-2 text-sm font-semibold leading-snug sm:text-[15px]",
                dim ? "text-muted-foreground" : "text-[#1a1a1a]",
              )}
              >
                {row.headline}
              </h3>
            )}
            <p className={cn(
              "line-clamp-2 text-sm leading-relaxed",
              dim ? "text-[#6b5d4f]/70" : "text-[#6b5d4f]",
            )}
            >
              {row.preview}
            </p>
          </button>

          {showMerchantAnswer && (
            <div className="mt-2" onClick={event => event.stopPropagation()}>
              <MerchantAnswerForm
                threadId={ticket.id}
                question={row.merchantQuestion}
                onAnswered={() => actions.onAnswered?.()}
              />
            </div>
          )}
        </NeedsYouCardBody>

        {showDraftFooter && (
          <NeedsYouCardFooter className="px-4 py-3 sm:px-5">
            <NeedsYouPrimaryButton
              data-testid={`ticket-row-${row.decision}`}
              disabled={actionsDisabled || isSending}
              onClick={row.decision === "send" ? actions.onSend : actions.onReview}
            >
              {isSending && <Loader2 aria-hidden className="size-3.5 animate-spin" />}
              {actionButtonLabel(row, isSending)}
            </NeedsYouPrimaryButton>
          </NeedsYouCardFooter>
        )}

        {showTrustFooter && (
          <NeedsYouCardFooter className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 sm:px-5">
            <button type="button" onClick={actions.onNotReal} disabled={actionsDisabled} className={compactSecondaryClassName}>
              Mark as spam
            </button>
            <NeedsYouPrimaryButton
              size="compact"
              data-testid="ticket-row-trust"
              disabled={actionsDisabled}
              onClick={actions.onTrust}
            >
              Mark as customer
            </NeedsYouPrimaryButton>
          </NeedsYouCardFooter>
        )}

        {showSpamFooter && actions.onRecover && (
          <NeedsYouCardFooter className="flex items-center justify-end gap-2 px-4 py-3 sm:px-5">
            <button
              type="button"
              data-testid="inbox-spam-recover"
              disabled={actionsDisabled}
              onClick={actions.onRecover}
              className={compactSecondaryClassName}
            >
              Not spam
            </button>
          </NeedsYouCardFooter>
        )}
      </NeedsYouCardShell>
    </li>
  )
}
