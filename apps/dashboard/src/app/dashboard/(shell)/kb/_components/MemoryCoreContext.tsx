"use client"

import { Check, Loader2, MessageSquareText, Pencil, Sparkles, Store, X } from "lucide-react"
import type { SampleReply, VoiceProposal } from "@/types"

interface Props {
  storeName: string
  aiContext: string
  brandVoice: string
  sampleReplies: SampleReply[]
  proposal: VoiceProposal | null
  proposalBusy: null | "approve" | "dismiss"
  proposalError: string | null
  onEdit: () => void
  onResolveProposal: (action: "approve" | "dismiss") => void
}

function ContextCard({ icon, tone, title, preview, status, configured, onEdit }: {
  icon: React.ReactNode
  tone: string
  title: string
  preview: string
  status: string
  configured: boolean
  onEdit: () => void
}) {
  return (
    <button type="button" onClick={onEdit} className="group w-full rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-foreground/[0.16] hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30">
      <span className="flex items-start justify-between gap-3">
        <span className={`inline-flex size-9 items-center justify-center rounded-lg border ${tone}`}>{icon}</span>
        <Pencil className="mt-1 size-3.5 text-faint group-hover:text-muted-foreground" />
      </span>
      <span className="mt-4 block text-sm font-semibold text-strong">{title}</span>
      <span className="mt-1.5 block text-sm leading-relaxed text-muted-foreground line-clamp-3">{preview}</span>
      <span className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-xs text-faint">
        <span className={`size-1.5 rounded-full ${configured ? "bg-emerald-400" : "bg-amber-400"}`} />
        {status}
      </span>
    </button>
  )
}

export function MemoryCoreContext({ storeName, aiContext, brandVoice, sampleReplies, proposal, proposalBusy, proposalError, onEdit, onResolveProposal }: Props) {
  const hasFacts = Boolean(aiContext.trim())
  const hasStyle = Boolean(brandVoice.trim())
  return (
    <aside aria-labelledby="memory-heading" className="min-w-0 lg:sticky lg:top-0">
      <div className="mb-4">
        <h1 id="memory-heading" className="text-xl font-semibold text-foreground">Memory</h1>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">The context your agent uses when it writes customer replies.</p>
      </div>
      <div className="space-y-3">
        <ContextCard
          icon={<Store className="size-4" />}
          tone="border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300"
          title="Store facts"
          preview={aiContext.trim() || "Add what you sell, important policies, shipping expectations, and other store facts."}
          status={hasFacts ? storeName || "Configured" : "Needs context"}
          configured={hasFacts}
          onEdit={onEdit}
        />
        <ContextCard
          icon={<MessageSquareText className="size-4" />}
          tone="border-sky-500/20 bg-sky-500/[0.08] text-sky-700 dark:text-sky-300"
          title="Reply style"
          preview={brandVoice.trim() || "Add the tone, phrasing, and language the agent should use in customer replies."}
          status={hasStyle ? `${sampleReplies.length} sample ${sampleReplies.length === 1 ? "reply" : "replies"}` : "Needs context"}
          configured={hasStyle}
          onEdit={onEdit}
        />
        {proposal && (
          <section className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.055] p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/[0.08] text-amber-700 dark:text-amber-300"><Sparkles className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Suggested reply style</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{proposal.brief}</p>
                <p className="mt-2 text-xs text-faint">Based on {proposal.basedOnCount} edited {proposal.basedOnCount === 1 ? "reply" : "replies"}{proposal.rationale ? ` · ${proposal.rationale}` : ""}</p>
              </div>
            </div>
            {proposalError && <p className="mt-3 text-xs text-red-400">{proposalError}</p>}
            <div className="mt-4 flex gap-2 border-t border-amber-500/15 pt-3">
              <button type="button" onClick={() => onResolveProposal("approve")} disabled={proposalBusy !== null} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-semibold text-background disabled:opacity-40">
                {proposalBusy === "approve" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Use style
              </button>
              <button type="button" onClick={() => onResolveProposal("dismiss")} disabled={proposalBusy !== null} aria-label="Dismiss suggested reply style" className="inline-flex size-8 items-center justify-center rounded-md border border-amber-500/15 text-muted-foreground hover:bg-amber-500/[0.07] hover:text-foreground disabled:opacity-40">
                {proposalBusy === "dismiss" ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
              </button>
            </div>
          </section>
        )}
      </div>
    </aside>
  )
}
