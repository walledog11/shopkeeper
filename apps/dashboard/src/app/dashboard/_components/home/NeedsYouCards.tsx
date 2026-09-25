"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { AlertCircle, Loader2 } from "lucide-react"
import MerchantAnswerForm from "@/components/agent/MerchantAnswerForm"
import { cn } from "@/lib/ui/cn"
import { canQuickApprove } from "@/lib/home/walkthrough"
import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"
import {
  NeedsYouActionReceipt,
  NeedsYouBubble,
  NeedsYouCardBody,
  NeedsYouCardFooter,
  NeedsYouCardHeader,
  NeedsYouCardShell,
  NeedsYouEscalationCallout,
  NeedsYouPrimaryButton,
} from "./needs-you-card-ui"
import { NeedsYouCardHeaderRow } from "./needs-you-card-meta"
import { needsYouSecondaryButtonClassName } from "./needs-you-card-styles"
import { isSampleNeedsYouItem } from "./sample-needs-you-items"
import { useNeedsYouActions } from "./useNeedsYouActions"

function ticketHref(threadId: string): string {
  return isSampleNeedsYouItem(threadId) ? "/dashboard/tickets" : `/dashboard/tickets?thread=${threadId}`
}

const HANDLE_IN_TICKET_CLASS = cn(
  needsYouSecondaryButtonClassName,
  "border-foreground bg-gradient-to-b from-foreground to-foreground/90 text-background shadow-md shadow-foreground/10 hover:-translate-y-0.5 hover:bg-foreground hover:text-background",
)

export function NeedsYouCard({
  item,
  onResolved,
  onAnswered,
}: {
  item: HomeNeedsAttentionItem
  /** The ticket left the queue — approved and sent, or closed without a reply. */
  onResolved: () => void
  onAnswered: (result?: { saveToKb: boolean }) => void
}) {
  const actions = useNeedsYouActions(item, { onApproved: onResolved, onClosed: onResolved })
  const busy = actions.pending !== null
  const approvable = canQuickApprove(item)
  const showAction = approvable && item.actionDisplay
  const fallbackBubbleText = approvable && !item.actionDisplay && !item.actionText && !item.replyText
    ? (item.proposalSummary || item.contextLine || item.customerMessage)
    : null

  const viewTicket = (label: string, className = needsYouSecondaryButtonClassName) => (
    <Link href={ticketHref(item.threadId)} className={className}>{label}</Link>
  )

  const closeTicket = (
    <button type="button" onClick={actions.close} disabled={busy} className={needsYouSecondaryButtonClassName}>
      {actions.pending === "close" && <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />}
      Close ticket
    </button>
  )

  let content: ReactNode
  let primary: ReactNode = null
  let secondary: ReactNode = <SideBySide>{viewTicket("View Ticket")}{closeTicket}</SideBySide>

  if (item.kind === "invalid") {
    content = (
      <div className="rounded-2xl border border-red-600/30 bg-red-600/[0.06] px-4 py-3" role="alert">
        <p className="text-sm font-semibold text-strong">This draft cannot be approved</p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground">
          {(item.validationIssues?.length ? item.validationIssues : ["The draft failed validation."])
            .map((issue, index) => <li key={`${index}:${issue}`}>{issue}</li>)}
        </ul>
      </div>
    )
    secondary = <SideBySide>{viewTicket("Fix in ticket")}{closeTicket}</SideBySide>
  } else if (item.kind === "needs_merchant_input") {
    content = (
      <div className="mt-1">
        <MerchantAnswerForm threadId={item.threadId} question={item.question} onAnswered={onAnswered} />
      </div>
    )
  } else if (item.isEscalationOnly) {
    content = <NeedsYouEscalationCallout reason={item.escalationReason} />
    primary = viewTicket("Handle in ticket", HANDLE_IN_TICKET_CLASS)
    secondary = closeTicket
  } else {
    content = (
      <>
        {item.replyText && <NeedsYouBubble tone="reply" flush>{item.replyText}</NeedsYouBubble>}
        {fallbackBubbleText && (
          <NeedsYouBubble tone={item.kind === "needs_review" ? "flag" : "reply"} flush>
            {fallbackBubbleText}
          </NeedsYouBubble>
        )}
      </>
    )
    primary = (
      <NeedsYouPrimaryButton confirming={actions.confirming} disabled={busy} onClick={actions.approve}>
        {actions.pending === "approve" && <Loader2 aria-hidden className="size-4 animate-spin" />}
        {actions.pending === "approve" ? "Approving" : actions.confirming ? "Confirm approve" : "Approve"}
      </NeedsYouPrimaryButton>
    )
    if (actions.confirming) {
      secondary = (
        <button type="button" onClick={actions.cancelConfirm} disabled={busy} className={needsYouSecondaryButtonClassName}>
          Cancel
        </button>
      )
    }
  }

  return (
    <NeedsYouCardShell confirming={actions.confirming}>
      <NeedsYouCardHeader>
        <NeedsYouCardHeaderRow item={item} />
      </NeedsYouCardHeader>

      <NeedsYouCardBody>
        {item.headline && <p className="truncate text-sm font-semibold text-[#1a1a1a]">{item.headline}</p>}
        {item.customerMessage && <NeedsYouBubble tone="customer">{item.customerMessage}</NeedsYouBubble>}
        <div className="flex flex-col gap-3">{content}</div>
      </NeedsYouCardBody>

      <NeedsYouCardFooter>
        {showAction && (
          <NeedsYouActionReceipt
            display={item.actionDisplay!}
            hideOrderRef={Boolean(item.orderRef && item.actionDisplay?.orderRef === item.orderRef)}
          />
        )}

        {actions.error && (
          <p className={cn("flex items-center gap-1.5 text-xs text-red-600", showAction && "mt-2.5")}>
            <AlertCircle aria-hidden className="size-3 shrink-0" />
            {actions.error}
          </p>
        )}

        <div className={cn("flex flex-col gap-2", (showAction || actions.error) && "mt-2.5")}>
          {primary}
          {secondary}
        </div>
      </NeedsYouCardFooter>
    </NeedsYouCardShell>
  )
}

function SideBySide({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>
}
