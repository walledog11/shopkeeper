import { AlertTriangle, Check, Loader2 } from "lucide-react"
import { isShopifyCustomerWarning } from "@shopkeeper/agent/plan-preview"
import type { PlanStep } from "@/types"
import { formatPlanStepSentence } from "./plan-step-display"

type DisplayStep = PlanStep & { enabled: boolean }

function warningDisplayText(warning: string, blocking: boolean): string {
  if (isShopifyCustomerWarning(warning) && !blocking) {
    return "No Shopify customer linked — check the customer panel if this reply needs order context."
  }
  return warning
}

function stepChipLabel(step: PlanStep): string {
  const text = (step.description || step.label || "").replace(/^"|"$/g, "").trim()
  if (text.length <= 72) return text
  const clipped = text.slice(0, 71)
  const lastSpace = clipped.lastIndexOf(" ")
  return `${(lastSpace > 40 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`
}

export function ActionPlanBody({
  actionSteps,
  blockingWarnings,
  customerName,
  informationalWarnings,
  isExecuting,
  isMobileSticky,
  onFocusShopifyLink,
  replyText,
  shopifyActionSteps,
  showReplyHero,
  toggleStep,
}: {
  actionSteps: DisplayStep[]
  blockingWarnings: string[]
  customerName?: string | null
  informationalWarnings: string[]
  isExecuting: boolean
  isMobileSticky: boolean
  onFocusShopifyLink?: () => void
  replyText: string | null
  shopifyActionSteps: DisplayStep[]
  showReplyHero: boolean
  toggleStep: (id: string, tool: string) => void
}) {
  const draftTextClass = isMobileSticky
    ? "text-[15px] leading-relaxed text-strong whitespace-pre-wrap max-h-[32vh] overflow-y-auto custom-scrollbar"
    : "text-[15px] leading-relaxed text-strong whitespace-pre-wrap max-h-[34vh] overflow-y-auto custom-scrollbar"

  return (
    <>
      {(blockingWarnings.length > 0 || informationalWarnings.length > 0) && (
        <div className="mt-0.5 space-y-2">
          {blockingWarnings.map(warning => (
            <div key={warning} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug text-red-600">
                  {warningDisplayText(warning, true)}
                </p>
                {isShopifyCustomerWarning(warning) && onFocusShopifyLink && (
                  <button
                    type="button"
                    onClick={onFocusShopifyLink}
                    className="mt-1 text-xs font-semibold text-red-600 transition-colors hover:text-red-700"
                  >
                    Check customer panel →
                  </button>
                )}
              </div>
            </div>
          ))}
          {informationalWarnings.map(warning => (
            <div key={warning} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-600" />
              <p className="text-sm font-semibold leading-snug text-red-600">
                {warningDisplayText(warning, false)}
              </p>
            </div>
          ))}
        </div>
      )}

      {showReplyHero ? (
        <div className="mt-3 rounded-2xl border border-border bg-foreground/[0.04] px-4 py-3">
          <p className={draftTextClass}>{replyText}</p>
        </div>
      ) : (
        <ol className="mt-3 flex flex-col gap-1.5">
          {actionSteps.map(step => (
            <li key={step.id}>
              <button
                type="button"
                data-testid="action-plan-step-toggle"
                data-step-id={step.id}
                aria-pressed={step.enabled}
                onClick={() => toggleStep(step.id, step.tool)}
                disabled={isExecuting}
                className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.03] disabled:opacity-60"
              >
                <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-md border transition-colors ${
                  step.enabled
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-faint"
                }`}>
                  {isExecuting && step.enabled
                    ? <Loader2 className="size-2.5 animate-spin" />
                    : <Check className="size-3" />
                  }
                </span>
                <span className={`min-w-0 flex-1 text-sm leading-relaxed ${
                  step.enabled ? "text-strong" : "text-faint line-through"
                }`}>
                  {formatPlanStepSentence(step, customerName)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {showReplyHero && shopifyActionSteps.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-faint">Also in Shopify</span>
          <div className="flex flex-wrap gap-1.5">
            {shopifyActionSteps.map(step => (
              <button
                type="button"
                key={step.id}
                data-testid="action-plan-step-toggle"
                data-step-id={step.id}
                aria-pressed={step.enabled}
                onClick={() => toggleStep(step.id, step.tool)}
                disabled={isExecuting}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                  step.enabled
                    ? "border-amber-600/25 bg-amber-600/[0.08] text-amber-700/90"
                    : "border-border text-faint line-through"
                }`}
              >
                {isExecuting && step.enabled
                  ? <Loader2 className="size-3 animate-spin" />
                  : <span className={`size-1.5 rounded-full ${
                      step.enabled ? "bg-amber-600" : "bg-foreground/20"
                    }`} />
                }
                {stepChipLabel(step)}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
