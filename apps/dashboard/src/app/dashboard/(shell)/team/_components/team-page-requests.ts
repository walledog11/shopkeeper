import { requestJson } from "@/lib/api/fetcher"

export interface TeamMember {
  id: string
  userId: string
  firstName: string | null
  lastName: string | null
  imageUrl: string | null
  identifier: string
  role: string
  createdAt: number
}

export interface TeamInvitation {
  id: string
  emailAddress: string
  role: string
  createdAt: number
}

export async function inviteTeamMember(emailAddress: string, role: string): Promise<TeamInvitation> {
  const fallback = "Failed to invite member."
  const invitation = await requestJson<TeamInvitation>(
    "/api/team",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailAddress, role }),
    },
    fallback,
  )
  if (typeof invitation.id !== "string" || typeof invitation.emailAddress !== "string") {
    throw new Error(fallback)
  }
  return invitation
}

async function deleteTeamEntity(params: URLSearchParams, fallback: string): Promise<void> {
  const payload = await requestJson<{ ok?: boolean }>(
    `/api/team?${params.toString()}`,
    { method: "DELETE" },
    fallback,
  )
  if (payload.ok !== true) throw new Error(fallback)
}

export function deleteTeamMember(userId: string): Promise<void> {
  return deleteTeamEntity(new URLSearchParams({ userId }), "Failed to remove member.")
}

export function revokeTeamInvitation(invitationId: string): Promise<void> {
  return deleteTeamEntity(
    new URLSearchParams({ invitationId }),
    "Failed to revoke invitation.",
  )
}
