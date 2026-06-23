"use client"

import { useCallback, useMemo, useState, type Ref } from "react"
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react"
import { classifyHomePlan, planReplyText } from "@shopkeeper/agent/plan-preview"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import MerchantAnswerForm from "@/components/agent/MerchantAnswerForm"
import Composer from "./Composer"
import ActionPlanCard from "./ActionPlanCard"
import MobileFloatingReplyComposer from "./MobileFloatingReplyComposer"
import type { AgentPlan, RawToolCall, Ticket } from "@/types"

interface Props {
  agentName: string
  containerRef?: Ref<HTMLDivElement>
  planCardRef?: Ref<HTMLDivElement>
  agentInstruction: string
  isAgentMode: boolean
  isPlanExecuting: boolean
  isRegenerating: boolean
  noteCount: number
  onChange: (text: string) => void
  onClearAgentMode: () => void
  onPlanApprove: (approvedToolCalls: RawToolCall[]) => void
  onPlanEdit?: () => void
  onPlanDismiss?: () => void
  onFocusShopifyLink?: () => void
  onPlanRegenerate: () => void
  onSend: (isNote: boolean) => void
  onViewTabChange: (tab: "chat" | "notes") => void
  onAnswered: (result?: { saveToKb: boolean }) => void
  pendingPlan: AgentPlan | null
  threadId: string
  composer: {
    customerName: string
    channelType: Ticket["channelType"]
    customerPlatformId?: string
    isSending: boolean
    replyText: string
    sendError: string | null
    shopifyCustomerId?: string | null
    lastCustomerMessageAt: string | null
  }
  viewTab: "chat" | "notes"
}

interface MobileManualEditState {
  pendingPlan: AgentPlan | null
  viewTab: Props["viewTab"]
  enabled: boolean
}

export default function ConversationComposerArea({
  agentName,
  containerRef,
  planCardRef,
  agentInstruction,
  isAgentMode,
  isPlanExecuting,
  isRegenerating,
  noteCount,
  onChange,
  onClearAgentMode,
  onPlanApprove,
  onPlanEdit,
  onPlanDismiss,
  onFocusShopifyLink,
  onPlanRegenerate,
  onSend,
  onViewTabChange,
  onAnswered,
  pendingPlan,
  threadId,
  composer,
  viewTab,
}: Props) {
  const isMobile = useMediaQuery("(max-width: 767px)") === true
  const merchantQuestion = useMemo(() => {
    if (!pendingPlan) return null
    const classification = classifyHomePlan(pendingPlan, null)
    return classification.kind === "needs_merchant_input" ? classification.question : null
  }, [pendingPlan])
  const showMerchantAnswer = merchantQuestion !== null
  const [mobileManualEditState, setMobileManualEditState] = useState<MobileManualEditState>(() => ({
    pendingPlan,
    viewTab,
    enabled: false,
  }))
  let mobileManualEdit = mobileManualEditState.enabled
  if (mobileManualEditState.pendingPlan !== pendingPlan || mobileManualEditState.viewTab !== viewTab) {
    mobileManualEdit = false
    setMobileManualEditState({ pendingPlan, viewTab, enabled: false })
  }
  const showMobileFloatingSurface =
    isMobile && viewTab === "chat" && (Boolean(pendingPlan) || mobileManualEdit)
  const showDesktopPlan = !isMobile && Boolean(pendingPlan) && viewTab === "chat"
  const showFullComposer = !showMobileFloatingSurface && !showDesktopPlan

  const setMobileManualEdit = useCallback((enabled: boolean) => {
    setMobileManualEditState({ pendingPlan, viewTab, enabled })
  }, [pendingPlan, viewTab])

  const handleMobilePlanEdit = useCallback(() => {
    if (!pendingPlan) return
    const text = planReplyText(pendingPlan)
    if (text) onChange(text)
    setMobileManualEdit(true)
  }, [pendingPlan, onChange, setMobileManualEdit])

  const handleMobileSend = useCallback((isNote: boolean) => {
    onPlanDismiss?.()
    setMobileManualEdit(false)
    onSend(isNote)
  }, [onPlanDismiss, onSend, setMobileManualEdit])

  const sharedComposerProps = {
    customerName: composer.customerName,
    agentName,
    channelType: composer.channelType,
    shopifyCustomerId: composer.shopifyCustomerId,
    customerPlatformId: composer.customerPlatformId,
    lastCustomerMessageAt: composer.lastCustomerMessageAt,
    viewTab,
    noteCount,
    onViewTabChange,
    isSending: composer.isSending,
    onSend,
  }

  return (
    <LazyMotion features={domAnimation}>
    <div ref={containerRef} className="mobile-ticket-composer-row relative z-20 shrink-0 flex flex-col">
      <AnimatePresence initial={false} mode="wait">
        {showMobileFloatingSurface && (
          <m.div
            key={mobileManualEdit ? "mobile-manual-edit" : "mobile-draft-review"}
            ref={planCardRef}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="pointer-events-auto w-full shrink-0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 sm:px-5"
          >
            {mobileManualEdit ? (
              <MobileFloatingReplyComposer
                customerName={composer.customerName}
                channelType={composer.channelType}
                shopifyCustomerId={composer.shopifyCustomerId}
                customerPlatformId={composer.customerPlatformId}
                lastCustomerMessageAt={composer.lastCustomerMessageAt}
                value={composer.replyText}
                isSending={composer.isSending}
                error={composer.sendError}
                onChange={onChange}
                onSend={handleMobileSend}
                onBackToPlan={() => setMobileManualEdit(false)}
              />
            ) : showMerchantAnswer ? (
              <MerchantAnswerCard
                threadId={threadId}
                question={merchantQuestion}
                agentName={agentName}
                onAnswered={onAnswered}
              />
            ) : pendingPlan ? (
              <ActionPlanCard
                plan={pendingPlan}
                agentName={agentName}
                customerName={composer.customerName}
                isExecuting={isPlanExecuting}
                isRegenerating={isRegenerating}
                layout="mobile-sticky"
                onApprove={onPlanApprove}
                onEdit={handleMobilePlanEdit}
                onFocusShopifyLink={onFocusShopifyLink}
                onRegenerate={onPlanRegenerate}
              />
            ) : null}
          </m.div>
        )}

        {showDesktopPlan && pendingPlan && (
          <m.div
            ref={planCardRef}
            key="desktop-plan"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="pointer-events-auto px-5 pb-2 pt-1"
          >
            {showMerchantAnswer ? (
              <MerchantAnswerCard
                threadId={threadId}
                question={merchantQuestion}
                agentName={agentName}
                onAnswered={onAnswered}
              />
            ) : (
              <ActionPlanCard
                plan={pendingPlan}
                agentName={agentName}
                customerName={composer.customerName}
                isExecuting={isPlanExecuting}
                isRegenerating={isRegenerating}
                onApprove={onPlanApprove}
                onEdit={onPlanEdit}
                onFocusShopifyLink={onFocusShopifyLink}
                onRegenerate={onPlanRegenerate}
              />
            )}
          </m.div>
        )}
      </AnimatePresence>

      {showFullComposer && (
        <Composer
          {...sharedComposerProps}
          value={isAgentMode ? agentInstruction : composer.replyText}
          isAgentMode={isAgentMode}
          error={composer.sendError}
          onChange={onChange}
          onClearAgentMode={onClearAgentMode}
        />
      )}
    </div>
    </LazyMotion>
  )
}

function MerchantAnswerCard({
  threadId,
  question,
  agentName,
  onAnswered,
}: {
  threadId: string
  question: string | null
  agentName: string
  onAnswered: (result?: { saveToKb: boolean }) => void
}) {
  return (
    <div className="w-full rounded-2xl bg-card border border-border shadow-sm px-4 sm:px-5 py-4">
      <MerchantAnswerForm
        threadId={threadId}
        question={question}
        agentName={agentName}
        onAnswered={onAnswered}
      />
    </div>
  )
}
