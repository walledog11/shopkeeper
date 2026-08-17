"use client"

import MerchantAnswerForm from "@/components/agent/MerchantAnswerForm"
import { NeedsYouCardFooter } from "@/app/dashboard/_components/home/needs-you-card-ui"
import type { AgentPlan, PlanExecutionOutcome, RawToolCall } from "@/types"
import ActionPlanCard from "./ActionPlanCard"

export function PlanReviewSurface({
  customerName,
  isExecuting,
  isRegenerating,
  layout,
  executionOutcome,
  onAnswered,
  onApprove,
  onDismiss,
  onEdit,
  onFocusShopifyLink,
  onRegenerate,
  pendingPlan,
  question,
  threadId,
}: {
  customerName: string
  isExecuting: boolean
  isRegenerating: boolean
  layout?: "default" | "mobile-sticky"
  executionOutcome: PlanExecutionOutcome | null
  onAnswered: (result?: { saveToKb: boolean }) => void
  onApprove: (approvedToolCalls: RawToolCall[]) => Promise<void>
  onDismiss?: () => void
  onEdit?: () => void
  onFocusShopifyLink?: () => void
  onRegenerate: () => void
  pendingPlan: AgentPlan
  question: string | null
  threadId: string
}) {
  if (question) {
    return (
      <NeedsYouCardFooter className="pointer-events-auto p-0">
        <div className="px-5 py-4 sm:px-6">
          <MerchantAnswerForm
            threadId={threadId}
            question={question}
            onAnswered={onAnswered}
          />
        </div>
      </NeedsYouCardFooter>
    )
  }

  return (
    <ActionPlanCard
      key={pendingPlan.planId ?? `${pendingPlan.instruction}:${pendingPlan.rawToolCalls.map(toolCall => toolCall.id).join(",")}`}
      plan={pendingPlan}
      customerName={customerName}
      isExecuting={isExecuting}
      executionOutcome={executionOutcome}
      isRegenerating={isRegenerating}
      layout={layout}
      onApprove={onApprove}
      onDismiss={onDismiss}
      onEdit={onEdit}
      onFocusShopifyLink={onFocusShopifyLink}
      onRegenerate={onRegenerate}
    />
  )
}
