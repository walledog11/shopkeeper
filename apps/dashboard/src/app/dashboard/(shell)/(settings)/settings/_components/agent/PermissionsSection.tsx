"use client"

import { ROUTINE_REPLY_CHOICES, routineReplyChoice } from "@/lib/agent/autonomy-tiers"
import { MoneyInput } from "@/components/settings-form/fields"
import { Switch } from "@/components/ui/switch"
import { SettingsTile } from "@/app/dashboard/(shell)/(settings)/settings/_components/SettingsTile"
import { cn } from "@/lib/ui/cn"
import type { AgentTabController } from "./useAgentTabState"

const ROUTINE_QUESTION = "Answer routine questions on its own?"

export function PermissionsSection({ controller }: { controller: AgentTabController }) {
  const { settingsState, selectTier, rawInputs, setRawInput, markExplicit, setAutonomyOverride, dispatch } = controller
  const current = routineReplyChoice(settingsState.autonomyTier)

  return (
    <>
      <SettingsTile
        id="autonomy"
        label={ROUTINE_QUESTION}
        description="Like “where’s my order?” or “do you ship to Canada?” Refunds, cancellations and order changes always wait for your OK."
      >
        <div role="radiogroup" aria-label={ROUTINE_QUESTION} className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {ROUTINE_REPLY_CHOICES.map((choice) => {
            const selected = choice === current
            return (
              <button
                key={choice.tier}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => selectTier(choice.tier)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-all",
                  selected
                    ? "border-foreground/[0.40] bg-foreground/[0.07]"
                    : "border-foreground/[0.10] bg-foreground/[0.025] hover:border-foreground/[0.22] hover:bg-foreground/[0.05]",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("size-2.5 rounded-full border", selected ? "border-foreground bg-foreground" : "border-foreground/25")} />
                  <span className="text-sm font-semibold text-strong">{choice.label}</span>
                  {choice.recommended ? (
                    <span className="rounded-sm border border-emerald-700/25 bg-emerald-700/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-emerald-700">
                      Recommended
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-faint">{choice.detail}</p>
              </button>
            )
          })}
        </div>
      </SettingsTile>

      <SettingsTile
        label="Never refund more than"
        description="Refunds and gift cards, even when you say yes. Leave it empty for no limit."
      >
        <MoneyInput
          label="Largest refund"
          aria-label="Largest refund"
          value={rawInputs.maxRefund}
          onValueChange={(value) => {
            markExplicit("maxRefundAmount")
            setRawInput("maxRefund", value)
          }}
          placeholder="No limit"
        />
      </SettingsTile>

      <SettingsTile
        label="Ask for a photo before any damage refund"
        action={
          <Switch
            checked={settingsState.damageEvidence === "photo_required"}
            onChange={(value) => dispatch({ type: "set", patch: { damageEvidence: value ? "photo_required" : "off" } })}
            ariaLabel="Ask for a photo before any damage refund"
          />
        }
      />

      <SettingsTile
        label="Never cancel orders"
        description="Cancellation requests come to you instead."
        action={
          <Switch
            checked={settingsState.blockCancellations}
            onChange={(value) => setAutonomyOverride("blockCancellations", value)}
            ariaLabel="Never cancel orders"
          />
        }
      />
    </>
  )
}
