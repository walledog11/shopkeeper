"use client"

import { useState } from "react"
import { Check, Loader2, Sparkles, Trash2, X } from "lucide-react"
import {
  MERCHANT_PREFERENCE_CATEGORIES,
  MERCHANT_PREFERENCE_CATEGORY_LABELS,
  MERCHANT_PREFERENCE_GUIDANCE_MAX_CHARS,
  type MerchantPreferenceCategory,
} from "@shopkeeper/db/merchant-preferences"
import { errorMessageFromUnknown } from "@/lib/api/fetcher"
import type { KbPageData } from "@/lib/server/kb-page-data"
import { cn } from "@/lib/ui/cn"
import { inputCls, MEMORY_CARD_SHELL } from "./kb-page-utils"
import { createPreference, resolveVoiceProposal, saveStoreProfileField, updatePreference } from "./kb-page-requests"
import type { MemoryBook } from "./memory-books"

export interface MemoryProfile {
  storeProfile: KbPageData["storeProfile"]
  preferences: KbPageData["preferences"]
  // Saving the profile is admin-only server-side; members read it.
  canEdit: boolean
  onChanged: () => Promise<void>
}

const primaryButtonCls = "flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-40"
const secondaryButtonCls = "flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40"
const adminOnlyNote = "Only workspace admins can edit this."

/** The store profile, brand voice and preferences, edited where the agent's memory is shown. */
export function ProfileBookPanel({ book, profile }: { book: MemoryBook; profile: MemoryProfile }) {
  const { storeProfile } = profile

  return (
    <div className="flex w-full flex-col gap-3 pb-2 pt-1 font-sans">
      {book.kind === "store" ? (
        <ProfileTextEditor
          key={storeProfile.aiContext}
          field="aiContext"
          label="About your store"
          value={storeProfile.aiContext}
          maxLength={2000}
          rows={8}
          placeholder="e.g. We sell phone cases. Ships in 2–3 business days. 30-day returns on unused items."
          profile={profile}
        />
      ) : book.kind === "tone" ? (
        <>
          {storeProfile.voiceProposal ? (
            <SuggestionCard
              title="Suggested brand voice"
              detail={`Learned from ${storeProfile.voiceProposal.basedOnCount} ${storeProfile.voiceProposal.basedOnCount === 1 ? "reply you edited" : "replies you edited"}`}
              body={storeProfile.voiceProposal.brief}
              rationale={storeProfile.voiceProposal.rationale}
              acceptLabel="Use this voice"
              profile={profile}
              onResolve={accept => resolveVoiceProposal(accept ? "approve" : "dismiss")}
            />
          ) : null}
          <ProfileTextEditor
            key={storeProfile.brandVoice}
            field="brandVoice"
            label="Brand voice"
            value={storeProfile.brandVoice}
            maxLength={200}
            rows={3}
            placeholder="e.g. Friendly and direct. Never over-apologise. Use plain language."
            profile={profile}
          />
        </>
      ) : (
        <PreferencesPanel profile={profile} />
      )}
    </div>
  )
}

function ProfileTextEditor({
  field,
  label,
  value,
  maxLength,
  rows,
  placeholder,
  profile,
}: {
  field: "aiContext" | "brandVoice"
  label: string
  value: string
  maxLength: number
  rows: number
  placeholder: string
  profile: MemoryProfile
}) {
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = draft !== value

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveStoreProfileField(field, draft)
      await profile.onChanged()
    } catch (saveError) {
      setError(errorMessageFromUnknown(saveError, "Failed to save."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={MEMORY_CARD_SHELL}>
      <textarea
        aria-label={label}
        value={draft}
        onChange={event => setDraft(event.target.value)}
        readOnly={!profile.canEdit}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        className={cn(inputCls, "resize-none")}
      />
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-faint">
        <span>{profile.canEdit ? `${draft.length.toLocaleString()} / ${maxLength.toLocaleString()}` : adminOnlyNote}</span>
        {profile.canEdit ? (
          <div className="flex items-center gap-2">
            {dirty && <button type="button" onClick={() => setDraft(value)} disabled={saving} className="px-2 py-1.5 text-faint hover:text-strong">Cancel</button>}
            <button type="button" onClick={save} disabled={saving || !dirty} className={primaryButtonCls}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Save
            </button>
          </div>
        ) : null}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}

/** Something the agent inferred; it guides nothing until the merchant accepts it. */
function SuggestionCard({
  title,
  detail,
  body,
  rationale,
  acceptLabel,
  profile,
  onResolve,
}: {
  title: string
  detail: string
  body: string
  rationale?: string | null
  acceptLabel: string
  profile: MemoryProfile
  onResolve: (accept: boolean) => Promise<unknown>
}) {
  const [busy, setBusy] = useState<null | "accept" | "dismiss">(null)
  const [error, setError] = useState<string | null>(null)

  const resolve = async (accept: boolean) => {
    setBusy(accept ? "accept" : "dismiss")
    setError(null)
    try {
      await onResolve(accept)
      await profile.onChanged()
    } catch (resolveError) {
      setError(errorMessageFromUnknown(resolveError, "Could not update the suggestion."))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-3xl border border-violet-700/30 bg-violet-700/[0.06] px-5 py-5">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-xl bg-violet-700/15">
          <Sparkles className="size-3.5 text-violet-700" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-strong">{title}</p>
          <p className="mt-0.5 text-xs text-faint">{detail}</p>
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-strong">{body}</p>
      {rationale ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{rationale}</p> : null}
      {profile.canEdit ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => void resolve(true)} disabled={busy !== null} className={primaryButtonCls}>
            {busy === "accept" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            {acceptLabel}
          </button>
          <button type="button" onClick={() => void resolve(false)} disabled={busy !== null} className={secondaryButtonCls}>
            {busy === "dismiss" ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
            Dismiss
          </button>
        </div>
      ) : null}
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
    </div>
  )
}

function PreferencesPanel({ profile }: { profile: MemoryProfile }) {
  const { active, proposed } = profile.preferences
  const [category, setCategory] = useState<MerchantPreferenceCategory>("general")
  const [guidance, setGuidance] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (id: string, request: () => Promise<unknown>) => {
    setBusyId(id)
    setError(null)
    try {
      await request()
      if (id === "create") setGuidance("")
      await profile.onChanged()
    } catch (requestError) {
      setError(errorMessageFromUnknown(requestError, "Failed to update preference."))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      {proposed.map(preference => (
        <SuggestionCard
          key={preference.id}
          title="Suggested preference"
          detail={MERCHANT_PREFERENCE_CATEGORY_LABELS[preference.category]}
          body={preference.guidance}
          rationale={preference.proposedRationale}
          acceptLabel="Use this preference"
          profile={profile}
          onResolve={accept => updatePreference(preference.id, accept ? "confirm" : "reject")}
        />
      ))}

      {active.map(preference => (
        <article key={preference.id} className={MEMORY_CARD_SHELL}>
          <div className="flex items-center justify-between gap-3 text-xs text-faint">
            <span>{MERCHANT_PREFERENCE_CATEGORY_LABELS[preference.category]}</span>
            {profile.canEdit ? (
              <button
                type="button"
                aria-label="Archive preference"
                onClick={() => void run(preference.id, () => updatePreference(preference.id, "archive"))}
                disabled={busyId !== null}
                className="inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-red-500/[0.07] hover:text-red-600 disabled:opacity-40"
              >
                {busyId === preference.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              </button>
            ) : null}
          </div>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{preference.guidance}</p>
        </article>
      ))}

      {profile.canEdit ? (
        <div className={MEMORY_CARD_SHELL}>
          <textarea
            aria-label="New preference"
            value={guidance}
            onChange={event => setGuidance(event.target.value)}
            rows={3}
            maxLength={MERCHANT_PREFERENCE_GUIDANCE_MAX_CHARS}
            placeholder="e.g. Offer store credit instead of refunds for minor defects under $20."
            className={cn(inputCls, "resize-none")}
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {MERCHANT_PREFERENCE_CATEGORIES.map(option => (
              <button
                key={option}
                type="button"
                onClick={() => setCategory(option)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs",
                  category === option ? "border-foreground/20 bg-foreground/[0.09] text-foreground" : "border-border text-muted-foreground",
                )}
              >
                {MERCHANT_PREFERENCE_CATEGORY_LABELS[option]}
              </button>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => void run("create", () => createPreference(category, guidance))}
              disabled={busyId !== null || !guidance.trim()}
              className={primaryButtonCls}
            >
              {busyId === "create" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Add preference
            </button>
          </div>
        </div>
      ) : (
        <p className="px-1 text-xs text-faint">{adminOnlyNote}</p>
      )}

      {error && <p className="px-1 text-xs text-red-600">{error}</p>}
    </>
  )
}
