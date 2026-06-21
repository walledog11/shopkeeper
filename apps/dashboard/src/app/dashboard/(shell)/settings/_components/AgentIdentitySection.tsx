"use client"

import { Check, Loader2, Sparkles, X } from "lucide-react"
import { CharacterCountTextarea, LabeledTextInput } from "./settings-form-fields"
import { SectionCard } from "./shared"
import type { AgentTabController } from "./useAgentTabState"

export function AgentIdentitySection({ controller }: { controller: AgentTabController }) {
  const { settingsState, dispatch, proposal, resolveVoiceProposal, voiceBusy } = controller

  return (
    <SectionCard title="Identity" description="How the agent presents itself and writes replies." variant="board">
      <div className="space-y-5">
        <LabeledTextInput
          label="Agent name"
          hint="shown in the notes panel and used as the @mention trigger"
          aria-label="Agent name"
          value={settingsState.agentName}
          onChange={e => dispatch({ type: "set", patch: { agentName: e.target.value } })}
          placeholder="Shopkeeper"
        />
        <LabeledTextInput
          label="Brand name"
          hint="used in AI draft prompts"
          aria-label="Brand name"
          value={settingsState.aiContext}
          onChange={e => dispatch({ type: "set", patch: { aiContext: e.target.value } })}
          placeholder="e.g. Acme Store"
        />
        {proposal && (
          <VoiceProposalCard
            brief={proposal.brief}
            basedOnCount={proposal.basedOnCount}
            rationale={proposal.rationale}
            busy={voiceBusy}
            onResolve={resolveVoiceProposal}
          />
        )}
        <CharacterCountTextarea
          label="Brand voice"
          hint="max 200 characters"
          aria-label="Brand voice"
          value={settingsState.brandVoice}
          onValueChange={value => dispatch({ type: "set", patch: { brandVoice: value } })}
          placeholder="e.g. Friendly and direct. Never over-apologise. Use plain language."
          maxLength={200}
          rows={3}
        />
      </div>
    </SectionCard>
  )
}

function VoiceProposalCard({
  brief,
  basedOnCount,
  rationale,
  busy,
  onResolve,
}: {
  brief: string
  basedOnCount: number
  rationale?: string
  busy: null | "approve" | "dismiss"
  onResolve: (action: "approve" | "dismiss") => void
}) {
  return (
    <div className="rounded-md border border-violet-300/30 bg-violet-300/[0.06] p-3.5 space-y-3">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 size-6 shrink-0 rounded-md bg-violet-300/15 flex items-center justify-center">
          <Sparkles className="size-3.5 text-violet-300" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground/85">Suggested brand voice update</p>
          <p className="text-xs text-foreground/40 mt-0.5">
            Learned from {basedOnCount} {basedOnCount === 1 ? "reply you edited" : "replies you edited"}. Review before it takes effect.
          </p>
        </div>
      </div>
      <p className="text-sm text-foreground/80 leading-relaxed rounded border border-foreground/[0.08] bg-foreground/[0.03] px-3 py-2 whitespace-pre-wrap break-words">
        {brief}
      </p>
      {rationale && (
        <p className="text-xs text-foreground/45 leading-relaxed">
          <span className="font-semibold text-foreground/55">What changed: </span>{rationale}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onResolve("approve")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-violet-400 hover:bg-violet-300 disabled:opacity-50 text-black text-xs font-semibold transition-colors"
        >
          {busy === "approve" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Use this voice
        </button>
        <button
          type="button"
          onClick={() => onResolve("dismiss")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-foreground/[0.12] text-foreground/55 hover:text-foreground/80 hover:border-foreground/[0.22] disabled:opacity-50 text-xs font-semibold transition-colors"
        >
          {busy === "dismiss" ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
          Dismiss
        </button>
      </div>
    </div>
  )
}
