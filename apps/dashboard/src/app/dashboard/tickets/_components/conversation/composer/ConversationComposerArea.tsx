"use client"

import type { Ref } from "react"
import { AnimatePresence, motion } from "motion/react"
import Composer from "./Composer"
import ActionPlanCard from "./ActionPlanCard"
import type { AgentPlan, RawToolCall, Ticket } from "@/types"

interface Props {
  agentName: string
  containerRef?: Ref<HTMLDivElement>
  clerkInstruction: string
  isClerkMode: boolean
  isPlanExecuting: boolean
  isRegenerating: boolean
  noteCount: number
  onChange: (text: string) => void
  onClearClerk: () => void
  onPlanApprove: (approvedToolCalls: RawToolCall[]) => void
  onPlanDismiss: () => void
  onPlanRegenerate: () => void
  onSend: (isNote: boolean) => void
  onViewTabChange: (tab: "chat" | "notes") => void
  pendingPlan: AgentPlan | null
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

export default function ConversationComposerArea({
  agentName,
  containerRef,
  clerkInstruction,
  isClerkMode,
  isPlanExecuting,
  isRegenerating,
  noteCount,
  onChange,
  onClearClerk,
  onPlanApprove,
  onPlanDismiss,
  onPlanRegenerate,
  onSend,
  onViewTabChange,
  pendingPlan,
  composer,
  viewTab,
}: Props) {
  return (
    <div ref={containerRef} className="mobile-ticket-composer-row relative z-20 shrink-0 flex flex-col">
      <AnimatePresence initial={false}>
        {pendingPlan && viewTab === "chat" && (
          <motion.div
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0, transition: { duration: 0.2 } }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <div className="px-5 pb-2 pt-1 pointer-events-auto">
              <ActionPlanCard
                plan={pendingPlan}
                isExecuting={isPlanExecuting}
                isRegenerating={isRegenerating}
                onApprove={onPlanApprove}
                onDismiss={onPlanDismiss}
                onRegenerate={onPlanRegenerate}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Composer
        customerName={composer.customerName}
        agentName={agentName}
        channelType={composer.channelType}
        shopifyCustomerId={composer.shopifyCustomerId}
        customerPlatformId={composer.customerPlatformId}
        lastCustomerMessageAt={composer.lastCustomerMessageAt}
        value={isClerkMode ? clerkInstruction : composer.replyText}
        isClerkMode={isClerkMode}
        viewTab={viewTab}
        noteCount={noteCount}
        onViewTabChange={onViewTabChange}
        isSending={composer.isSending}
        error={composer.sendError}
        onChange={onChange}
        onClearClerk={onClearClerk}
        onSend={onSend}
      />
    </div>
  )
}
