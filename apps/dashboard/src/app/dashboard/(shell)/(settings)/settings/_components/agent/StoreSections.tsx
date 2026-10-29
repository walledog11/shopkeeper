"use client"

import { Check, Loader2, Sparkles, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { CharacterCountTextarea } from "@/components/settings-form/fields"
import {
  SolidSettingsTile as SettingsTile,
  settingsFieldClassName,
  settingsTextareaClassName,
} from "@/app/dashboard/(shell)/(settings)/settings/_components/SettingsTile"
import { settingsSelectClassName } from "@/components/settings-form/class-names"
import { GLASS_SETTINGS_ACTION } from "@/lib/ui/glass-card-styles"
import { appPrimaryButtonClassName } from "@/lib/ui/app-button-styles"
import { storeTimezonePatch } from "./agent-tab-helpers"
import { TimezoneSelect } from "./TimezoneSelect"
import type { AgentTabController } from "./useAgentTabState"

export function StoreGeneralSection({ controller }: { controller: AgentTabController }) {
  const { settingsState, dispatch, businessName, setBusinessName } = controller

  return (
    <>
      <SettingsTile label="Business name">
        <div>
          <Input
            aria-label="Business name"
            value={businessName}
            onChange={(event) => setBusinessName(event.target.value)}
            placeholder="My Store"
            className={settingsFieldClassName}
          />
        </div>
      </SettingsTile>

      <SettingsTile
        label="Store timezone"
        description="Used for business hours and briefings."
      >
        <TimezoneSelect
          aria-label="Store timezone"
          value={settingsState.businessHoursTimezone ?? ""}
          onChange={(value) => dispatch({ type: "set", patch: storeTimezonePatch(value) })}
          className={settingsSelectClassName("w-full sm:w-80")}
        />
      </SettingsTile>
    </>
  )
}

export function StoreProfileSection({ controller }: { controller: AgentTabController }) {
  const { settingsState, dispatch, proposal, resolveVoiceProposal, voiceBusy } = controller

  return (
    <>
      <SettingsTile label="About your store">
        <div>
          <CharacterCountTextarea
            aria-label="About your store"
            value={settingsState.aiContext}
            onValueChange={(value) => dispatch({ type: "set", patch: { aiContext: value } })}
            placeholder="e.g. We sell phone cases. Ships in 2–3 business days. 30-day returns on unused items."
            maxLength={2000}
            rows={4}
            textareaClassName={settingsTextareaClassName}
          />
        </div>
      </SettingsTile>

      <SettingsTile label="Brand voice">
        <div className="space-y-3">
          {proposal ? (
            <VoiceProposalCard
              brief={proposal.brief}
              basedOnCount={proposal.basedOnCount}
              rationale={proposal.rationale}
              busy={voiceBusy}
              onResolve={resolveVoiceProposal}
            />
          ) : null}
          <CharacterCountTextarea
            aria-label="Brand voice"
            value={settingsState.brandVoice}
            onValueChange={(value) => dispatch({ type: "set", patch: { brandVoice: value } })}
            placeholder="e.g. Friendly and direct. Never over-apologise. Use plain language."
            maxLength={200}
            rows={3}
            textareaClassName={settingsTextareaClassName}
          />
        </div>
      </SettingsTile>
    </>
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
    <div className="space-y-3 rounded-xl border border-violet-700/30 bg-violet-700/[0.06] p-4">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-xl bg-violet-700/15">
          <Sparkles className="size-3.5 text-violet-700" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-strong">Suggested brand voice update</p>
          <p className="mt-0.5 text-xs text-faint">
            Learned from {basedOnCount} {basedOnCount === 1 ? "reply you edited" : "replies you edited"}.
          </p>
        </div>
      </div>
      <p className="whitespace-pre-wrap break-words rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] px-3 py-2 text-sm leading-relaxed text-strong">
        {brief}
      </p>
      {rationale ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-muted-foreground">What changed: </span>{rationale}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          onClick={() => onResolve("approve")}
          disabled={busy !== null}
          className={appPrimaryButtonClassName}
        >
          {busy === "approve" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Use this voice
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onResolve("dismiss")}
          disabled={busy !== null}
          className={GLASS_SETTINGS_ACTION}
        >
          {busy === "dismiss" ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
          Dismiss
        </Button>
      </div>
    </div>
  )
}
