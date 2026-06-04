import { requestJson } from "@/lib/api/fetcher"
import type { CannedResponse } from "@/types"

export interface CannedResponseInput {
  title: string
  body: string
  tags: string[]
}

function requireCannedResponse(
  payload: { response?: CannedResponse },
  fallback: string,
): CannedResponse {
  if (!payload.response || typeof payload.response.id !== "string") {
    throw new Error(fallback)
  }
  return payload.response
}

export async function createCannedResponse(input: CannedResponseInput): Promise<CannedResponse> {
  const fallback = "Failed to create saved reply."
  const payload = await requestJson<{ response?: CannedResponse }>(
    "/api/canned-responses",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    fallback,
  )
  return requireCannedResponse(payload, fallback)
}

export async function updateCannedResponse(
  id: string,
  input: CannedResponseInput,
): Promise<CannedResponse> {
  const fallback = "Failed to update saved reply."
  const payload = await requestJson<{ response?: CannedResponse }>(
    `/api/canned-responses/${id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    fallback,
  )
  return requireCannedResponse(payload, fallback)
}

export async function deleteCannedResponse(id: string): Promise<void> {
  const payload = await requestJson<{ ok?: boolean }>(
    `/api/canned-responses/${id}`,
    { method: "DELETE" },
    "Failed to delete saved reply.",
  )
  if (payload.ok !== true) throw new Error("Failed to delete saved reply.")
}

export async function duplicateCannedResponse(id: string): Promise<CannedResponse> {
  const fallback = "Failed to duplicate saved reply."
  const payload = await requestJson<{ response?: CannedResponse }>(
    `/api/canned-responses/${id}/duplicate`,
    { method: "POST" },
    fallback,
  )
  return requireCannedResponse(payload, fallback)
}
