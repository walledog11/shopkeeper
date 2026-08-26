"use client"

import { useState } from "react"
import type {
  MerchantPreferenceCategory,
  MerchantPreferenceRecord,
} from "@shopkeeper/db"
import {
  MERCHANT_PREFERENCE_CATEGORIES,
  MERCHANT_PREFERENCE_CATEGORY_LABELS,
  MERCHANT_PREFERENCE_GUIDANCE_MAX_CHARS,
} from "@shopkeeper/db"

interface MerchantPreferencesState {
  active: MerchantPreferenceRecord[]
  proposed: MerchantPreferenceRecord[]
}

export function useMerchantPreferencesState(initial: MerchantPreferencesState) {
  const [active, setActive] = useState(initial.active)
  const [proposed, setProposed] = useState(initial.proposed)
  const [category, setCategory] = useState<MerchantPreferenceCategory>("general")
  const [guidance, setGuidance] = useState("")
  const [busy, setBusy] = useState<null | "create" | string>(null)
  const [error, setError] = useState<string | null>(null)

  async function createPreference() {
    if (busy) return
    setBusy("create")
    setError(null)
    try {
      const res = await fetch("/api/agent/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, guidance }),
      })
      const body = await res.json().catch(() => ({})) as {
        error?: string
        preference?: MerchantPreferenceRecord
      }
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to save preference")
      }
      if (body.preference) {
        setActive((current) => [body.preference!, ...current])
      }
      setGuidance("")
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to save preference")
    } finally {
      setBusy(null)
    }
  }

  async function resolveProposed(id: string, action: "confirm" | "reject") {
    if (busy) return
    setBusy(id)
    setError(null)
    try {
      const res = await fetch(`/api/agent/preferences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const body = await res.json().catch(() => ({})) as {
        error?: string
        preference?: MerchantPreferenceRecord
      }
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to update preference")
      }
      setProposed((current) => current.filter((item) => item.id !== id))
      if (action === "confirm" && body.preference) {
        setActive((current) => [body.preference!, ...current])
      }
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : "Failed to update preference")
    } finally {
      setBusy(null)
    }
  }

  async function archivePreference(id: string) {
    if (busy) return
    setBusy(id)
    setError(null)
    try {
      const res = await fetch(`/api/agent/preferences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive" }),
      })
      const body = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to archive preference")
      }
      setActive((current) => current.filter((item) => item.id !== id))
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Failed to archive preference")
    } finally {
      setBusy(null)
    }
  }

  return {
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
    categories: MERCHANT_PREFERENCE_CATEGORIES,
    categoryLabels: MERCHANT_PREFERENCE_CATEGORY_LABELS,
    guidanceMaxChars: MERCHANT_PREFERENCE_GUIDANCE_MAX_CHARS,
  }
}

export type MerchantPreferencesController = ReturnType<typeof useMerchantPreferencesState>
