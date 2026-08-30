import type { ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowUpRight, Clock3 } from "lucide-react"
import {
  actionLogEntryHref,
  formatActionLogHeadline,
  formatPlanVerdictLabel,
  formatRequestOutcomeDisplay,
} from "@/lib/agent/action-log-display"
import { getActionLogChannelInfo } from "@/lib/messaging/channels"
import type { ActionLogEntry } from "@/types"
import {
  TONE_STYLES,
  isErrorStatus,
  outcomeActions,
  outcomeTone,
  reviewItemChrome,
  reviewModeNote,
  toOutputBlock,
  toolLabel,
  type OutputBlock,
} from "./quality-panel-model"
import {
  REVIEW_ICONS,
  REVIEW_TONE_CLASS,
  ReviewCorrectionLink,
  sourceLinkLabel,
} from "./ReviewItemShared"

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">{title}</h3>
      {children}
    </section>
  )
}

function OutputBlockView({ block }: { block: OutputBlock }) {
  const tone = TONE_STYLES[block.tone]
  return (
    <div className={`rounded-lg border p-3 ${tone.container}`}>
      <p className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${tone.label}`}>{block.label}</p>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-strong">{block.text}</p>
    </div>
  )
}

function statusClassName(status: ActionLogEntry["actions"][number]["status"]): string {
  if (status === "success") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-800"
  if (status === "escalated") return "border-amber-500/20 bg-amber-500/10 text-amber-800"
  if (status === "error" || status === "policy_block" || status === "unknown") return "border-red-500/20 bg-red-500/10 text-red-800"
  return "border-foreground/[0.08] bg-foreground/[0.04] text-muted-foreground"
}

export function ReviewDetail({
  entry,
  onClose,
}: {
  entry: ActionLogEntry
  onClose: () => void
}) {
  const channel = getActionLogChannelInfo(entry)
  const headline = formatActionLogHeadline(entry)
  const href = actionLogEntryHref(entry)
  const sourceLabel = sourceLinkLabel(href)
  const outputs = entry.actions.map(toOutputBlock).filter(
    (block): block is OutputBlock => block !== null,
  )
  const outcomes = outcomeActions(entry)
  const chrome = reviewItemChrome(entry)
  const Icon = REVIEW_ICONS[chrome.icon]
  const tone = REVIEW_TONE_CLASS[chrome.tone]
  const modeNote = reviewModeNote(entry)
  const requestOutcome = entry.requestOutcome
    ? formatRequestOutcomeDisplay(entry.requestOutcome)
    : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-5 py-5">
        <div className="flex items-start gap-3">
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${tone.icon}`}>
            <Icon className="size-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold leading-tight text-foreground">{headline}</h2>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${tone.badge}`}>
                {chrome.label}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
              <span className="inline-flex items-center gap-1.5">
                <Image src={channel.logo} alt={channel.name} width={12} height={12} className="size-3 object-contain" />
                {channel.name}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="size-3" />
                {new Date(entry.sentAt).toLocaleString()}
              </span>
              {modeNote && <span>{modeNote}</span>}
              {entry.approver && <span>Approved by {entry.approver.displayName ?? entry.approver.id}</span>}
              {entry.threadTag && <span>{entry.threadTag}</span>}
              {requestOutcome && <span>{requestOutcome.label}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {entry.summary.trim() && (
          <DetailSection title="Summary">
            <p className="rounded-lg border border-border bg-foreground/[0.03] p-3 text-sm leading-relaxed text-strong">
              {entry.summary}
            </p>
          </DetailSection>
        )}
        {requestOutcome && entry.requestOutcome && (
          <DetailSection title="Request outcome">
            <dl className="grid gap-3 rounded-lg border border-border bg-foreground/[0.03] p-3 text-sm">
              <div className="grid gap-1">
                <dt className="text-xs font-semibold uppercase tracking-wide text-faint">Request type</dt>
                <dd className="text-strong">{entry.requestOutcome.requestTag?.trim() || "Untagged request"}</dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-xs font-semibold uppercase tracking-wide text-faint">Plan verdict</dt>
                <dd className="text-strong">{formatPlanVerdictLabel(entry.requestOutcome.planVerdict)}</dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-xs font-semibold uppercase tracking-wide text-faint">Resolution</dt>
                <dd className="text-strong">{requestOutcome.label}</dd>
              </div>
              {entry.requestOutcome.replyProvenance && (
                <div className="grid gap-1">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-faint">Reply</dt>
                  <dd className="text-strong">
                    {entry.requestOutcome.replyProvenance === "agent_automatic"
                      ? "Agent sent automatically"
                      : entry.requestOutcome.replyProvenance === "agent_approved"
                        ? "You approved the send"
                        : "You replied manually"}
                  </dd>
                </div>
              )}
              {entry.requestOutcome.merchantInputAnsweredAt && (
                <div className="grid gap-1">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-faint">Your answer</dt>
                  <dd className="text-strong">
                    {new Date(entry.requestOutcome.merchantInputAnsweredAt).toLocaleString()}
                  </dd>
                </div>
              )}
              {entry.requestOutcome.sourceMessageId && (
                <div className="grid gap-1">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-faint">Episode</dt>
                  <dd className="break-all font-mono text-xs text-muted-foreground">
                    {entry.requestOutcome.sourceMessageId}
                  </dd>
                </div>
              )}
            </dl>
          </DetailSection>
        )}
        <DetailSection title="Output">
          {outputs.length > 0 ? (
            <div className="space-y-2">
              {outputs.map(block => <OutputBlockView key={block.key} block={block} />)}
            </div>
          ) : (
            <p className="rounded-lg border border-border bg-foreground/[0.03] p-3 text-sm text-faint">
              No customer-facing output recorded for this turn.
            </p>
          )}
        </DetailSection>
        <DetailSection title="Tool outcomes">
          <div className="space-y-2">
            {outcomes.map((action, index) => {
              const outcomeStyle = TONE_STYLES[outcomeTone(action)]
              return (
                <div
                  key={`${action.tool}-${index}`}
                  className={`rounded-lg border p-3 ${
                    isErrorStatus(action.status)
                      ? outcomeStyle.container
                      : "border-border bg-foreground/[0.02]"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-strong">{toolLabel(action.tool)}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${statusClassName(action.status)}`}>
                      {action.status ?? "recorded"}
                    </span>
                    {typeof action.durationMs === "number" && (
                      <span className="text-xs text-faint">{action.durationMs} ms</span>
                    )}
                  </div>
                  <p className={`mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed ${
                    action.result ? "text-muted-foreground" : "text-faint"
                  }`}>
                    {action.result || "No result text recorded."}
                  </p>
                </div>
              )
            })}
            {outcomes.length === 0 && (
              <p className="rounded-lg border border-border bg-foreground/[0.03] p-3 text-sm text-faint">
                No tool outcomes recorded.
              </p>
            )}
          </div>
        </DetailSection>
      </div>

      <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {href && sourceLabel && (
            <Link
              href={href}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowUpRight className="size-3.5" />
              {sourceLabel}
            </Link>
          )}
          <ReviewCorrectionLink entry={entry} />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-8 rounded-md border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
        >
          Done
        </button>
      </div>
    </div>
  )
}
