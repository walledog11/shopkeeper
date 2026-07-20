"use client"

import { AlertTriangle, Check, ChevronUp, CircleX, Loader2, RefreshCw } from "lucide-react"
import type { AgentPlan, PlanExecutionOutcome, RawToolCall } from "@/types"
import { ActionPlanBody } from "./ActionPlanBody"
import { useActionPlanReviewState } from "./useActionPlanReviewState"

const PLAN_CARD_CLASS =
  "w-full rounded-2xl bg-card border border-border shadow-sm overflow-hidden"

interface Props {
  plan: AgentPlan
  agentName?: string
  customerName?: string | null
  executionOutcome: PlanExecutionOutcome | null
  isExecuting: boolean
  isRegenerating?: boolean
  layout?: "default" | "mobile-sticky"
  onApprove: (approvedToolCalls: RawToolCall[]) => Promise<void>
  onDismiss?: () => void
  onEdit?: () => void
  onFocusShopifyLink?: () => void
  onRegenerate?: () => void
}

interface ActionPlanCardHeaderProps {
  agentName: string
  collapsedPreview: string | null
  headerLabel: string
  isMobileSticky: boolean
  onCollapse: () => void
  onExpand: () => void
  onRegenerate?: () => void
  status: {
    compactHeader: boolean
    isLocked: boolean
    isRegenerating: boolean
  }
}

function ActionPlanCardHeader({
  agentName,
  collapsedPreview,
  headerLabel,
  isMobileSticky,
  onCollapse,
  onExpand,
  onRegenerate,
  status,
}: ActionPlanCardHeaderProps) {
  return (
    <div className="flex h-11 items-center gap-2 px-3 sm:px-4 shrink-0">
      {status.compactHeader && !isMobileSticky ? (
        <button
          type="button"
          onClick={onExpand}
          className="flex min-w-0 flex-1 items-center gap-2 text-left hover:opacity-80 transition-opacity"
        >
          <span className="size-5 rounded-full bg-foreground/[0.06] flex items-center justify-center shrink-0">
            <ChevronUp className="size-3 text-muted-foreground" />
          </span>
          <span className="text-xs font-semibold text-muted-foreground shrink-0">{agentName}&apos;s draft</span>
          {collapsedPreview && (
            <span className="text-xs text-muted-foreground truncate ml-auto">
              {collapsedPreview}
            </span>
          )}
        </button>
      ) : (
        <>
          <p className="flex-1 min-w-0 text-sm font-medium text-strong truncate">{headerLabel}</p>
          {onRegenerate && (
            <button type="button"
              onClick={onRegenerate}
              disabled={status.isLocked || status.isRegenerating}
              title="Rewrite"
              className="shrink-0 p-1.5 rounded-lg text-faint hover:text-strong hover:bg-foreground/[0.05] transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`size-3.5 ${status.isRegenerating ? "animate-spin" : ""}`} />
            </button>
          )}
          {!isMobileSticky && (
            <button type="button"
              onClick={onCollapse}
              title="Collapse"
              className="shrink-0 p-1.5 rounded-lg text-faint hover:text-strong hover:bg-foreground/[0.05] transition-colors"
            >
              <ChevronUp className="size-4" />
            </button>
          )}
        </>
      )}
    </div>
  )
}

interface ActionPlanControlsProps {
  onApproveClick: () => void
  onCancelReview: () => void
  onDismiss?: () => void
  onEdit?: () => void
  primaryLabel: string | null
  successLabel: string
  status: {
    enabledCount: number
    hasBlockingWarnings: boolean
    inReviewFlow: boolean
    executionOutcome: PlanExecutionOutcome | null
    isRunning: boolean
    primaryNeedsCaution: boolean
    showEditTakeover: boolean
    warningsReviewed: boolean
  }
}

function ActionPlanControls({
  onApproveClick,
  onCancelReview,
  onDismiss,
  onEdit,
  primaryLabel,
  successLabel,
  status,
}: ActionPlanControlsProps) {
  const recovery = status.executionOutcome && status.executionOutcome !== "committed"
    ? {
        failed: {
          label: "Plan failed",
          detail: "Nothing was confirmed complete. Review the activity before creating another plan.",
        },
        partial: {
          label: "Plan partially completed",
          detail: "Some steps completed and others failed. Review the activity before taking another action.",
        },
        unknown: {
          label: "Outcome unconfirmed",
          detail: "The provider may have accepted an action. Check provider activity before trying again.",
        },
      }[status.executionOutcome]
    : null

  if (recovery) {
    return (
      <div
        className="mt-4 rounded-2xl border border-amber-600/30 bg-amber-600/[0.07] px-4 py-3"
        data-testid="action-plan-outcome"
        role={status.executionOutcome === "unknown" ? "alert" : "status"}
        aria-live={status.executionOutcome === "unknown" ? "assertive" : "polite"}
      >
        <div className="flex items-start gap-2.5">
          {status.executionOutcome === "failed"
            ? <CircleX className="mt-0.5 size-4 shrink-0 text-red-600" />
            : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
          }
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-strong">{recovery.label}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{recovery.detail}</p>
          </div>
        </div>
        {onDismiss && (
          <button
            type="button"
            data-testid="action-plan-dismiss-outcome"
            onClick={onDismiss}
            className="mt-3 w-full rounded-xl bg-foreground/[0.06] px-3 py-2 text-sm font-semibold text-strong transition-colors hover:bg-foreground/[0.1]"
          >
            Dismiss
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="mt-4 flex flex-col gap-2">
      <p className="sr-only" role="status" aria-live="polite">
        {status.isRunning
          ? "Plan execution in progress."
          : status.executionOutcome === "committed"
            ? "Plan execution completed successfully."
            : ""
        }
      </p>
      <div className={`flex ${status.showEditTakeover ? "gap-2" : ""}`}>
        <button type="button"
          data-testid="action-plan-run"
          onClick={onApproveClick}
          disabled={status.isRunning || status.enabledCount === 0 || Boolean(status.executionOutcome)}
          className={`${status.showEditTakeover ? "flex-1" : "w-full"} inline-flex items-center justify-center gap-2 py-3 rounded-2xl text-[15px] font-semibold transition active:scale-[0.98] disabled:opacity-40 ${
            status.executionOutcome === "committed"
              ? "bg-green-600 text-[#ffffff] disabled:opacity-100"
              : status.inReviewFlow || (status.hasBlockingWarnings && status.warningsReviewed)
                ? "bg-amber-600 hover:bg-amber-700 text-[#ffffff]"
                : status.primaryNeedsCaution
                  ? "bg-foreground text-background hover:bg-foreground/90 ring-2 ring-amber-500/70 ring-offset-2 ring-offset-card"
                  : "bg-foreground text-background hover:bg-foreground/90"
          }`}
        >
          {status.executionOutcome === "committed"
            ? <><Check className="size-4 animate-in zoom-in-75 fade-in duration-200" /> {successLabel}</>
            : status.isRunning
              ? <><Loader2 className="size-4 animate-spin" /> Sending…</>
              : primaryLabel
          }
        </button>
        {status.showEditTakeover && (
          <button
            type="button"
            data-testid="action-plan-edit"
            onClick={onEdit}
            disabled={status.isRunning || Boolean(status.executionOutcome)}
            className="flex-1 inline-flex items-center justify-center py-3 rounded-2xl text-[15px] font-semibold bg-foreground/[0.05] hover:bg-foreground/[0.08] text-strong transition-colors disabled:opacity-40"
          >
            Edit & send myself
          </button>
        )}
      </div>
      {status.inReviewFlow && (
        <div className="flex justify-center">
          <button
            type="button"
            data-testid="action-plan-cancel"
            onClick={onCancelReview}
            disabled={status.isRunning || Boolean(status.executionOutcome)}
            className="text-xs font-medium text-faint hover:text-muted-foreground transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

export default function ActionPlanCard({
  plan,
  agentName = "Shopkeeper",
  customerName,
  executionOutcome,
  isExecuting,
  isRegenerating,
  layout = "default",
  onApprove,
  onDismiss,
  onEdit,
  onFocusShopifyLink,
  onRegenerate,
}: Props) {
  const isMobileSticky = layout === "mobile-sticky"
  const review = useActionPlanReviewState({
    agentName,
    customerName,
    executionOutcome,
    isExecuting,
    onApprove,
    plan,
  })
  const {
    actionSteps,
    blockingWarnings,
    collapsedPreview,
    enabledCount,
    hasBlockingWarnings,
    headerLabel,
    informationalWarnings,
    inReviewFlow,
    isRunning,
    onApproveClick,
    onCancelReview,
    primaryLabel,
    primaryNeedsCaution,
    replyText,
    shopifyActionSteps,
    showReplyHero,
    state,
    toggleStep,
  } = review
  const showEditTakeover = Boolean(onEdit && showReplyHero)

  const handleBodyTransitionEnd = (event: React.TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.propertyName !== "grid-template-rows") return
    review.bodyExpanded()
  }

  return (
    <div
      data-testid="action-plan-card"
      data-layout={isMobileSticky ? "mobile-floating" : "default"}
      className={PLAN_CARD_CLASS}
    >
      <ActionPlanCardHeader
        agentName={agentName}
        collapsedPreview={collapsedPreview}
        headerLabel={headerLabel}
        isMobileSticky={isMobileSticky}
        onCollapse={review.collapse}
        onExpand={review.expand}
        onRegenerate={onRegenerate}
        status={{
          compactHeader: state.compactHeader,
          isLocked: isRunning || Boolean(executionOutcome),
          isRegenerating: Boolean(isRegenerating),
        }}
      />

      <div
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: state.collapsed && !isMobileSticky ? "0fr" : "1fr" }}
        onTransitionEnd={handleBodyTransitionEnd}
      >
        <div className="overflow-hidden min-h-0">
          <div
            className={`px-4 sm:px-5 pb-4 transition-opacity duration-200 ease-out ${
              (state.collapsed && !isMobileSticky) || (state.compactHeader && !isMobileSticky) ? "opacity-0" : "opacity-100"
            }`}
          >
            <ActionPlanBody
              actionSteps={actionSteps}
              blockingWarnings={blockingWarnings}
              customerName={customerName}
              informationalWarnings={informationalWarnings}
              isExecuting={isRunning || Boolean(executionOutcome)}
              isMobileSticky={isMobileSticky}
              onFocusShopifyLink={onFocusShopifyLink}
              replyText={replyText}
              shopifyActionSteps={shopifyActionSteps}
              showReplyHero={showReplyHero}
              toggleStep={toggleStep}
            />

            <ActionPlanControls
              onApproveClick={onApproveClick}
              onCancelReview={onCancelReview}
              onDismiss={onDismiss}
              onEdit={onEdit}
              primaryLabel={primaryLabel}
              successLabel={showReplyHero ? "Sent" : "Done"}
              status={{
                enabledCount,
                executionOutcome,
                hasBlockingWarnings,
                inReviewFlow,
                isRunning,
                primaryNeedsCaution,
                showEditTakeover,
                warningsReviewed: state.warningsReviewed,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
