"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertCircle, Loader2 } from "lucide-react"
import MerchantAnswerForm from "@/components/agent/MerchantAnswerForm"
import { cn } from "@/lib/ui/cn"
import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"
import {
  NeedsYouActionReceipt,
  NeedsYouBubble,
  NeedsYouCardBody,
  NeedsYouCardFooter,
  NeedsYouCardHeader,
  NeedsYouCardHeaderRow,
  NeedsYouCardShell,
  NeedsYouEscalationCallout,
  NeedsYouPrimaryButton,
} from "./needs-you-card-ui"
import { needsYouSecondaryButtonClassName } from "./needs-you-card-styles"
import { isSampleNeedsYouItem } from "./sample-needs-you-items"

export function NeedsYouCard({
  item,
  onSent,
  onAnswered,
}: {
  item: HomeNeedsAttentionItem
  onSent: () => void
  onAnswered: (result?: { saveToKb: boolean }) => void
}) {
  const [isApproving, setIsApproving] = useState(false)
  const [approvalError, setApprovalError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  if (item.kind === "needs_merchant_input") {
    return (
      <NeedsYouCardShell>
        <NeedsYouCardHeader>
          <NeedsYouCardHeaderRow item={item} />
        </NeedsYouCardHeader>

        <NeedsYouCardBody>
          {item.customerMessage && (
            <NeedsYouBubble tone="customer">
              {item.customerMessage}
            </NeedsYouBubble>
          )}

          <div className="mt-4">
            <MerchantAnswerForm
              threadId={item.threadId}
              question={item.question}
              onAnswered={onAnswered}
            />
          </div>
        </NeedsYouCardBody>

        <NeedsYouCardFooter>
          <Link
            href={`/dashboard/tickets?thread=${item.threadId}`}
            className={needsYouSecondaryButtonClassName}
          >
            View Ticket
          </Link>
        </NeedsYouCardFooter>
      </NeedsYouCardShell>
    )
  }

  const isConsequential = item.kind === "needs_review"
  const isEscalationOnly = item.isEscalationOnly ?? false
  const escalationReason = item.escalationReason ?? null

  const fallbackBubbleText = !isEscalationOnly && !item.actionDisplay && !item.actionText && !item.replyText
    ? (item.proposalSummary || item.contextLine || item.customerMessage)
    : null

  const showAction = !isEscalationOnly && item.actionDisplay
  const hideActionOrderRef = Boolean(
    showAction
    && item.actionDisplay?.orderRef
    && item.orderRef
    && item.actionDisplay.orderRef === item.orderRef,
  )

  const approve = async () => {
    if (isApproving) return
    setIsApproving(true)
    setApprovalError(null)

    if (isSampleNeedsYouItem(item.threadId)) {
      onSent()
      setIsApproving(false)
      setConfirming(false)
      return
    }

    try {
      const response = await fetch("/api/agent/quick-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: item.threadId }),
      })
      const data = await response.json().catch(() => null) as { error?: string } | null

      if (!response.ok) {
        setApprovalError(data?.error ?? "Could not complete this action.")
        return
      }

      onSent()
    } catch {
      setApprovalError("Network error. Try again.")
    } finally {
      setIsApproving(false)
      setConfirming(false)
    }
  }

  const onApproveClick = () => {
    if (isConsequential && !confirming) {
      setConfirming(true)
      return
    }
    approve()
  }

  return (
    <NeedsYouCardShell confirming={confirming}>
      <NeedsYouCardHeader>
        <NeedsYouCardHeaderRow item={item} />
      </NeedsYouCardHeader>

      <NeedsYouCardBody>
        {item.customerMessage && (
          <NeedsYouBubble tone="customer">
            {item.customerMessage}
          </NeedsYouBubble>
        )}

        <div className="flex flex-col gap-3">
          {isEscalationOnly ? (
            <NeedsYouEscalationCallout reason={escalationReason} />
          ) : (
            <>
              {item.replyText && (
                <NeedsYouBubble tone="reply" flush>
                  {item.replyText}
                </NeedsYouBubble>
              )}
              {fallbackBubbleText && (
                <NeedsYouBubble tone={isConsequential ? "flag" : "reply"} flush>
                  {fallbackBubbleText}
                </NeedsYouBubble>
              )}
            </>
          )}
        </div>
      </NeedsYouCardBody>

      <NeedsYouCardFooter>
        {showAction && (
          <NeedsYouActionReceipt
            display={item.actionDisplay!}
            hideOrderRef={hideActionOrderRef}
          />
        )}

        {approvalError && (
          <p className={cn(
            "flex items-center gap-1.5 text-xs text-red-600",
            showAction ? "mt-2.5" : "",
          )}
          >
            <AlertCircle aria-hidden className="size-3 shrink-0" />
            {approvalError}
          </p>
        )}

        <div className={cn("flex flex-col gap-2", (showAction || approvalError) && "mt-2.5")}>
          {isEscalationOnly ? (
            <Link
              href={isSampleNeedsYouItem(item.threadId) ? "/dashboard/tickets" : `/dashboard/tickets?thread=${item.threadId}`}
              className={cn(
                needsYouSecondaryButtonClassName,
                "border-foreground bg-gradient-to-b from-foreground to-foreground/90 text-background shadow-md shadow-foreground/10 hover:-translate-y-0.5 hover:bg-foreground hover:text-background",
              )}
            >
              Handle in ticket
            </Link>
          ) : (
            <>
              <NeedsYouPrimaryButton
                confirming={confirming}
                disabled={isApproving}
                onClick={onApproveClick}
              >
                {isApproving && <Loader2 aria-hidden className="size-4 animate-spin" />}
                {isApproving ? "Approving" : confirming ? "Confirm approve" : "Approve"}
              </NeedsYouPrimaryButton>

              {confirming ? (
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={isApproving}
                  className={needsYouSecondaryButtonClassName}
                >
                  Cancel
                </button>
              ) : (
                <Link
                  href={isSampleNeedsYouItem(item.threadId) ? "/dashboard/tickets" : `/dashboard/tickets?thread=${item.threadId}`}
                  className={needsYouSecondaryButtonClassName}
                >
                  View Ticket
                </Link>
              )}
            </>
          )}
        </div>
      </NeedsYouCardFooter>
    </NeedsYouCardShell>
  )
}
