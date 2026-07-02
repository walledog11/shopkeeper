"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertCircle, Loader2 } from "lucide-react"
import MerchantAnswerForm from "@/components/agent/MerchantAnswerForm"
import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"
import {
  NeedsYouBubble,
  NeedsYouCardBody,
  NeedsYouCardFooter,
  NeedsYouCardHeader,
  NeedsYouCardHeaderRow,
  NeedsYouCardShell,
  NeedsYouCardTitle,
  NeedsYouCustomerName,
  NeedsYouPrimaryButton,
} from "./needs-you-card-ui"
import type { BubbleTone } from "./needs-you-card-styles"

export function NeedsYouCard({
  item,
  agentName,
  onSent,
  onAnswered,
}: {
  item: HomeNeedsAttentionItem
  agentName: string
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
          <NeedsYouCardHeaderRow item={item} tag={item.tag} />
          <NeedsYouCardTitle>{item.headline}</NeedsYouCardTitle>
          <NeedsYouCustomerName name={item.customerName} />
        </NeedsYouCardHeader>

        <NeedsYouCardBody>
          {item.customerMessage && (
            <NeedsYouBubble label="Customer" tone="customer">
              {item.customerMessage}
            </NeedsYouBubble>
          )}

          <div className="mt-4">
            <MerchantAnswerForm
              threadId={item.threadId}
              question={item.question}
              agentName={agentName}
              onAnswered={onAnswered}
            />
          </div>
        </NeedsYouCardBody>

        <NeedsYouCardFooter>
          <Link
            href={`/dashboard/tickets?thread=${item.threadId}`}
            className="inline-flex w-full items-center justify-center rounded-2xl border border-border bg-transparent py-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-foreground/[0.04]"
          >
            View Ticket
          </Link>
        </NeedsYouCardFooter>
      </NeedsYouCardShell>
    )
  }

  const isConsequential = item.kind === "needs_review"

  const bubbles: { key: string; label: string; text: string; tone: BubbleTone }[] = []
  if (item.actionText) {
    bubbles.push({
      key: "action",
      label: `${agentName} updates Shopify`,
      text: item.actionText,
      tone: "action",
    })
  }
  if (item.replyText) {
    bubbles.push({
      key: "reply",
      label: `${agentName} responds via ${item.channelName}`,
      text: item.replyText,
      tone: "reply",
    })
  }
  if (bubbles.length === 0) {
    bubbles.push({
      key: "flag",
      label: `${agentName} flagged this`,
      text: item.proposalSummary,
      tone: "flag",
    })
  }

  const approve = async () => {
    if (isApproving) return
    setIsApproving(true)
    setApprovalError(null)

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
        <NeedsYouCardHeaderRow item={item} tag={item.tag} />
        <NeedsYouCardTitle>{item.headline}</NeedsYouCardTitle>
        <NeedsYouCustomerName name={item.customerName} />
      </NeedsYouCardHeader>

      <NeedsYouCardBody>
        {item.customerMessage && (
          <NeedsYouBubble label="Customer" tone="customer">
            {item.customerMessage}
          </NeedsYouBubble>
        )}

        <div className="mt-4 flex flex-col gap-3">
          {bubbles.map(bubble => (
            <NeedsYouBubble
              key={bubble.key}
              label={bubble.label}
              tone={bubble.tone}
              agentName={agentName}
              flush
            >
              {bubble.text}
            </NeedsYouBubble>
          ))}
        </div>

        {approvalError && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle aria-hidden className="size-3 shrink-0" />
            {approvalError}
          </p>
        )}
      </NeedsYouCardBody>

      <NeedsYouCardFooter>
        <div className="flex flex-col gap-2">
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
              className="inline-flex w-full items-center justify-center rounded-2xl border border-border bg-transparent py-3.5 text-base font-semibold text-muted-foreground transition-colors hover:bg-foreground/[0.04] disabled:opacity-40"
            >
              Cancel
            </button>
          ) : (
            <Link
              href={`/dashboard/tickets?thread=${item.threadId}`}
              className="inline-flex w-full items-center justify-center rounded-2xl border border-border bg-transparent py-3.5 text-base font-semibold text-muted-foreground transition-colors hover:bg-foreground/[0.04]"
            >
              View Ticket
            </Link>
          )}
        </div>
      </NeedsYouCardFooter>
    </NeedsYouCardShell>
  )
}
