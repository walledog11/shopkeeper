import type { KbArticle, KnowledgeBase } from "@/types"

type ApiErrorPayload = {
  error?: unknown
}

type ArticleInput = {
  title: string
  body: string
  tags: string[]
}

async function readJsonResponse<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T
  } catch {
    return null
  }
}

function formatErrorValue(value: unknown): string | null {
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    return value.map(formatErrorValue).filter(Boolean).join("; ") || null
  }
  if (value && typeof value === "object") {
    const messages = Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
      const text = formatErrorValue(nested)
      return text ? [`${key}: ${text}`] : []
    })
    return messages.join("; ") || null
  }
  return null
}

function errorMessageFromPayload(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const message = formatErrorValue((payload as ApiErrorPayload).error)
    if (message) return message
  }
  return fallback
}

async function requestJson<T>(url: string, init: RequestInit, fallbackError: string): Promise<T> {
  const response = await fetch(url, init)
  const payload = await readJsonResponse<T & ApiErrorPayload>(response)

  if (!response.ok) {
    throw new Error(errorMessageFromPayload(payload, fallbackError))
  }
  if (!payload) {
    throw new Error(fallbackError)
  }

  return payload
}

export function createKnowledgeBase(name: string) {
  return requestJson<{ knowledgeBase: KnowledgeBase }>(
    "/api/kb/bases",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
    "Failed to create collection.",
  )
}

export async function deleteKnowledgeBase(id: string) {
  await requestJson<{ ok: boolean }>(
    `/api/kb/bases/${id}`,
    { method: "DELETE" },
    "Failed to delete collection.",
  )
}

export function createArticle(knowledgeBaseId: string, input: ArticleInput) {
  return requestJson<{ article: KbArticle }>(
    `/api/kb/bases/${knowledgeBaseId}/articles`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    "Failed to create article.",
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
    "Failed to update article.",
  )
}

export async function deleteArticle(id: string) {
  await requestJson<{ ok: boolean }>(
    `/api/kb/${id}`,
    { method: "DELETE" },
    "Failed to delete article.",
  )
}

export function errorMessageFromUnknown(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
