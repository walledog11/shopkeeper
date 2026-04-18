"use client"

import { AnimatePresence, motion } from "motion/react"
import { Bot } from "lucide-react"
import Composer from "./Composer"
import ActionPlanCard from "./ActionPlanCard"
import type { AgentPlan, RawToolCall, Ticket } from "@/types"

interface Props {
  agentName: string
  clerkInstruction: string
  isAutoPlanLoading: boolean
  isClerkMode: boolean
  isNoteMode: boolean
  isPlanExecuting: boolean
  isRegenerating: boolean
  onAddNote: () => void
  onCancelNote: () => void
  onChange: (text: string) => void
  onClearClerk: () => void
  onPlanApprove: (approvedToolCalls: RawToolCall[]) => void
  onPlanDismiss: () => void
  onPlanRegenerate: () => void
  onSend: (isNote: boolean) => void
  pendingPlan: AgentPlan | null
  composer: {
    customerName: string
    channelType: Ticket["channelType"]
    customerPlatformId?: string
    isDrafting: boolean
    isSending: boolean
    onDraft: () => void
    replyText: string
    sendError: string | null
    shopifyCustomerId?: string | null
  }
  viewTab: "chat" | "notes"
}

export default function ConversationComposerArea({
  agentName,
  clerkInstruction,
  isAutoPlanLoading,
  isClerkMode,
  isNoteMode,
  isPlanExecuting,
  isRegenerating,
  onAddNote,
  onCancelNote,
  onChange,
  onClearClerk,
  onPlanApprove,
  onPlanDismiss,
  onPlanRegenerate,
  onSend,
  pendingPlan,
  composer,
  viewTab,
}: Props) {
  return (
    <>
      {isAutoPlanLoading && (
        <div className="px-5 py-3 border-t border-violet-500/15 bg-violet-500/[0.04] flex items-center gap-2 shrink-0">
          <Bot className="w-3.5 h-3.5 text-violet-400 animate-pulse shrink-0" />
          <span className="text-xs text-violet-400 font-medium">{agentName} is analyzing this ticket…</span>
        </div>
      )}

      <div className="relative shrink-0">
        <AnimatePresence>
          {pendingPlan && !isAutoPlanLoading && viewTab === "chat" && (
            <motion.div
              className="absolute bottom-full left-0 right-0 px-5 pb-2 pointer-events-none"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6, transition: { duration: 0.18 } }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <div className="pointer-events-auto">
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
          value={isClerkMode ? clerkInstruction : composer.replyText}
          isNote={false}
          isClerkMode={isClerkMode}
          isNoteMode={viewTab === "notes" && isNoteMode}
          hideToggle={true}
          placeholder={viewTab === "notes" && !isClerkMode ? `Message team… or @${agentName.toLowerCase()} for AI` : undefined}
          isDrafting={composer.isDrafting}
          isSending={composer.isSending || isAutoPlanLoading}
          error={composer.sendError}
          onChange={onChange}
          onClearClerk={onClearClerk}
          onSend={onSend}
          onDraft={composer.onDraft}
          onAddNote={viewTab === "notes" ? onAddNote : undefined}
          onCancelNote={viewTab === "notes" ? onCancelNote : undefined}
        />
      </div>
    </>
  )
}
