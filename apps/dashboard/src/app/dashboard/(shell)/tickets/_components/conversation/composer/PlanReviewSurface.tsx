"use client"

import MerchantAnswerForm from "@/components/agent/MerchantAnswerForm"
import type { AgentPlan, RawToolCall } from "@/types"
import ActionPlanCard from "./ActionPlanCard"

export function PlanReviewSurface({
  agentName,
  customerName,
  isExecuting,
  isRegenerating,
  layout,
  onAnswered,
  onApprove,
  onEdit,
  onFocusShopifyLink,
  onRegenerate,
  pendingPlan,
  question,
  threadId,
}: {
  agentName: string
  customerName: string
  isExecuting: boolean
  isRegenerating: boolean
  layout?: "default" | "mobile-sticky"
  onAnswered: (result?: { saveToKb: boolean }) => void
  onApprove: (approvedToolCalls: RawToolCall[]) => void
  onEdit?: () => void
  onFocusShopifyLink?: () => void
  onRegenerate: () => void
  pendingPlan: AgentPlan
  question: string | null
  threadId: string
}) {
  if (question) {
    return (
      <div className="w-full rounded-2xl border border-border bg-card px-4 py-4 shadow-sm sm:px-5">
        <MerchantAnswerForm
          threadId={threadId}
          question={question}
          agentName={agentName}
          onAnswered={onAnswered}
        />
      </div>
    )
  }

  return (
    <ActionPlanCard
      key={`${pendingPlan.instruction}:${pendingPlan.rawToolCalls.map(toolCall => toolCall.id).join(",")}`}
      plan={pendingPlan}
      agentName={agentName}
      customerName={customerName}
      isExecuting={isExecuting}
      isRegenerating={isRegenerating}
      layout={layout}
      onApprove={onApprove}
      onEdit={onEdit}
      onFocusShopifyLink={onFocusShopifyLink}
      onRegenerate={onRegenerate}
    />
  )
}
