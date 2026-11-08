"use client"

import MerchantAnswerForm from "@/components/agent/MerchantAnswerForm"
import { SupportCardFooter } from "@/components/support-card/card"
import type { MerchantAnswers } from "@shopkeeper/agent/types"
import type { AgentPlan, PlanCardOutcome, RawToolCall } from "@/types"
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
  executionOutcome: PlanCardOutcome | null
  onAnswered: (result?: { saveToKb: boolean }) => void
  onApprove: (approvedToolCalls: RawToolCall[], merchantAnswers?: MerchantAnswers) => Promise<void>
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
      <SupportCardFooter className="pointer-events-auto p-0">
        <div className="px-5 py-4 sm:px-6">
          <MerchantAnswerForm
            threadId={threadId}
            question={question}
            onAnswered={onAnswered}
          />
        </div>
      </SupportCardFooter>
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
