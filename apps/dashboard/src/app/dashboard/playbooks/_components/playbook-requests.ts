import { requestJson } from "@/lib/api/fetcher"
import type { Playbook, PlaybookAction, PlaybookTrigger } from "@/types"

export interface PlaybookInput {
  name: string
  trigger: PlaybookTrigger
  actions: PlaybookAction[]
}

function requirePlaybook(payload: { playbook?: Playbook }, fallback: string): Playbook {
  if (!payload.playbook || typeof payload.playbook.id !== "string") {
    throw new Error(fallback)
  }
  return payload.playbook
}

export async function savePlaybook(id: string | null, input: PlaybookInput): Promise<Playbook> {
  const fallback = id ? "Failed to update playbook." : "Failed to create playbook."
  const payload = await requestJson<{ playbook?: Playbook }>(
    id ? `/api/playbooks/${id}` : "/api/playbooks",
    {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    fallback,
  )
  return requirePlaybook(payload, fallback)
}

export async function togglePlaybook(id: string, enabled: boolean): Promise<Playbook> {
  const fallback = "Failed to update playbook."
  const payload = await requestJson<{ playbook?: Playbook }>(
    `/api/playbooks/${id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    },
    fallback,
  )
  return requirePlaybook(payload, fallback)
}

export async function deletePlaybook(id: string): Promise<void> {
  const payload = await requestJson<{ ok?: boolean }>(
    `/api/playbooks/${id}`,
    { method: "DELETE" },
    "Failed to delete playbook.",
  )
  if (payload.ok !== true) throw new Error("Failed to delete playbook.")
}
