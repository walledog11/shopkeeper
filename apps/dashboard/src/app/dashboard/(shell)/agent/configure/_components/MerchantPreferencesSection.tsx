"use client"

import { Check, Loader2, Sparkles, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  SolidSettingsTile as SettingsTile,
  settingsFieldClassName,
  settingsTextareaClassName,
} from "@/app/dashboard/(shell)/settings/_components/SettingsTile"
import { CharacterCountTextarea } from "./settings-form-fields"
import { GLASS_SETTINGS_ACTION } from "@/lib/ui/glass-card-styles"
import type { MerchantPreferencesController } from "./useMerchantPreferencesState"

export function MerchantPreferencesSection({
  controller,
  canEdit,
}: {
  controller: MerchantPreferencesController
  canEdit: boolean
}) {
  const {
    active,
    proposed,
    category,
    setCategory,
    guidance,
    setGuidance,
    busy,
    error,
    createPreference,
    resolveProposed,
    archivePreference,
    categories,
    categoryLabels,
    guidanceMaxChars,
  } = controller

  return (
    <SettingsTile label="Merchant preferences">
      <div className="space-y-4">
        <p>
          Saved judgment the agent can follow when drafting plans. Preferences are guidance only —
          they never override compensation caps, workspace policy, or approval rules.
        </p>

        {proposed.map((preference) => (
          <ProposedPreferenceCard
            key={preference.id}
            preference={preference}
            busy={busy === preference.id}
            canEdit={canEdit}
            onResolve={resolveProposed}
          />
        ))}

        {active.length > 0 ? (
          <div className="space-y-2">
            {active.map((preference) => (
              <div
                key={preference.id}
                className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-faint">
                      {categoryLabels[preference.category]}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-strong">
                      {preference.guidance}
                    </p>
                    {preference.lastUsedAt ? (
                      <p className="mt-2 text-xs text-faint">
                        Last used in planning {new Date(preference.lastUsedAt).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Archive preference"
                      disabled={busy !== null}
                      onClick={() => void archivePreference(preference.id)}
                      className={GLASS_SETTINGS_ACTION}
                    >
                      {busy === preference.id
                        ? <Loader2 className="size-4 animate-spin" />
                        : <Trash2 className="size-4" />}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No active preferences yet.</p>
        )}

        {canEdit ? (
          <div className="space-y-3 rounded-xl border border-foreground/[0.08] p-4">
            <p className="text-sm font-semibold text-strong">Add a preference</p>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-faint">Category</span>
              <select
                aria-label="Preference category"
                value={category}
                onChange={(event) => setCategory(event.target.value as typeof category)}
                className={settingsFieldClassName}
              >
                {categories.map((option) => (
                  <option key={option} value={option}>
                    {categoryLabels[option]}
                  </option>
                ))}
              </select>
            </label>
            <CharacterCountTextarea
              aria-label="Preference guidance"
              value={guidance}
              onValueChange={setGuidance}
              placeholder='e.g. "Offer store credit instead of refunds for minor defects under $20."'
              maxLength={guidanceMaxChars}
              rows={3}
              textareaClassName={settingsTextareaClassName}
            />
            <Button
              type="button"
              onClick={() => void createPreference()}
              disabled={busy !== null || !guidance.trim()}
              className="w-full bg-[#2b2118] text-[#f6f2eb] hover:bg-[#1a120c] sm:w-auto"
            >
              {busy === "create" ? <Loader2 className="size-4 animate-spin" /> : null}
              Save preference
            </Button>
          </div>
        ) : null}

        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    </SettingsTile>
  )
}

function ProposedPreferenceCard({
  preference,
  busy,
  canEdit,
  onResolve,
}: {
  preference: MerchantPreferencesController["proposed"][number]
  busy: boolean
  canEdit: boolean
  onResolve: (id: string, action: "confirm" | "reject") => void
}) {
  return (
    <div className="space-y-3 rounded-xl border border-violet-700/30 bg-violet-700/[0.06] p-4">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-violet-700/15">
          <Sparkles className="size-3.5 text-violet-700" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-strong">Suggested preference</p>
          <p className="mt-0.5 text-xs text-faint">
            Review before it can guide planning.
          </p>
        </div>
      </div>
      <p className="whitespace-pre-wrap break-words rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] px-3 py-2 text-sm leading-relaxed text-strong">
        {preference.guidance}
      </p>
      {preference.proposedRationale ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-muted-foreground">Why: </span>
          {preference.proposedRationale}
        </p>
      ) : null}
      {canEdit ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            onClick={() => onResolve(preference.id, "confirm")}
            disabled={busy}
            className="w-full bg-[#2b2118] text-[#f6f2eb] hover:bg-[#1a120c] sm:w-auto"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Use this preference
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onResolve(preference.id, "reject")}
            disabled={busy}
            className={GLASS_SETTINGS_ACTION}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
            Dismiss
          </Button>
        </div>
      ) : null}
    </div>
  )
}
