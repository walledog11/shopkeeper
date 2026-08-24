export interface OrgSettingsPatchResult {
  version: string
  settings?: Record<string, unknown>
  name?: string
}

export async function patchSpamFilterEnabled(
  enabled: boolean,
  version: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OrgSettingsPatchResult> {
  const res = await fetchImpl("/api/org", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings: { spamFilterEnabled: enabled }, version }),
  })
  if (res.status === 409) throw new Error("conflict")
  if (!res.ok) throw new Error("failed")
  return res.json() as Promise<OrgSettingsPatchResult>
}
