import type { MerchantPreferenceCategory, MerchantPreferenceRecord } from "@shopkeeper/db/merchant-preferences"
import type { KbArticle } from "@/types"
import { requestJson } from "@/lib/api/fetcher"

type ArticleInput = {
  title: string
  body: string
  tags: string[]
}

export function createContext(content: string, category: string, correctionTargetId?: string) {
  return requestJson<{ article: KbArticle }>(
    "/api/kb/context",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, category, correctionTargetId }),
    },
    "Failed to add context.",
  )
}

export function updateArticle(id: string, input: ArticleInput) {
  return requestJson<{ article: KbArticle }>(
    `/api/kb/${id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    "Failed to update note.",
  )
}

export async function deleteArticle(id: string) {
  await requestJson<{ ok: boolean }>(
    `/api/kb/${id}`,
    { method: "DELETE" },
    "Failed to delete note.",
  )
}

export function saveStoreProfileField(field: "aiContext" | "brandVoice", value: string) {
  return requestJson<{ version: string }>(
    "/api/org",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { [field]: value } }),
    },
    "Failed to save.",
  )
}

export function resolveVoiceProposal(action: "approve" | "dismiss") {
  return requestJson<{ ok?: boolean }>(
    "/api/agent/voice",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    },
    "Could not update the voice suggestion.",
  )
}

export function createPreference(category: MerchantPreferenceCategory, guidance: string) {
  return requestJson<{ preference: MerchantPreferenceRecord }>(
    "/api/agent/preferences",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, guidance }),
    },
    "Failed to save preference.",
  )
}

export function updatePreference(id: string, action: "confirm" | "reject" | "archive") {
  return requestJson<{ preference: MerchantPreferenceRecord }>(
    `/api/agent/preferences/${id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    },
    "Failed to update preference.",
  )
}
