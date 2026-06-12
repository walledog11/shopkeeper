import type { KbArticle, KnowledgeBase } from "@/types"
import { requestJson } from "@/lib/api/fetcher"

type ArticleInput = {
  title: string
  body: string
  tags: string[]
}

export function createKnowledgeBase(name: string) {
  return requestJson<{ knowledgeBase: KnowledgeBase }>(
    "/api/kb/bases",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
    "Failed to create folder.",
  )
}

export async function deleteKnowledgeBase(id: string) {
  await requestJson<{ ok: boolean }>(
    `/api/kb/bases/${id}`,
    { method: "DELETE" },
    "Failed to delete folder.",
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
    "Failed to create note.",
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
