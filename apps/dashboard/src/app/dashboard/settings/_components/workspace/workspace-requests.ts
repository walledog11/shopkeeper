export const MAX_LOGO_BYTES = 2 * 1024 * 1024

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface SaveWorkspaceInput {
  name: string
  version: string
}

export type SaveWorkspaceResult =
  | { status: "saved"; version?: string }
  | { status: "conflict"; current?: { name?: string; version?: string } }

export async function saveWorkspaceName(
  { name, version }: SaveWorkspaceInput,
  fetchImpl: FetchLike = fetch,
): Promise<SaveWorkspaceResult> {
  const res = await fetchImpl("/api/org", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, version }),
  })

  if (res.status === 409) {
    const body = await res.json().catch(() => ({})) as { current?: { name?: string; version?: string } }
    return { status: "conflict", current: body.current }
  }

  if (!res.ok) throw new Error("Failed")

  const body = await res.json().catch(() => ({})) as { version?: string }
  return { status: "saved", version: body.version }
}

export function logoValidationError(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Please choose an image file."
  if (file.size > MAX_LOGO_BYTES) return "Image must be under 2MB."
  return null
}

export function exportFilenameFromDisposition(disposition: string, now = new Date()): string {
  const match = disposition.match(/filename="?([^"]+)"?/)
  return match?.[1] ?? `shopkeeper-export-${now.toISOString().slice(0, 10)}.json`
}

export async function fetchWorkspaceExport(fetchImpl: FetchLike = fetch, now = new Date()) {
  const res = await fetchImpl("/api/org/data?action=export")
  if (!res.ok) throw new Error("Failed")
  const blob = await res.blob()
  const disposition = res.headers.get("Content-Disposition") ?? ""
  return {
    blob,
    filename: exportFilenameFromDisposition(disposition, now),
  }
}

export function downloadBlob(blob: Blob, filename: string, doc: Document = document, urlApi: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> = URL) {
  const url = urlApi.createObjectURL(blob)
  const a = doc.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  urlApi.revokeObjectURL(url)
}

export async function clearWorkspaceTicketsRequest(fetchImpl: FetchLike = fetch) {
  const res = await fetchImpl("/api/org/data?action=clear_tickets", { method: "DELETE" })
  if (!res.ok) throw new Error("Failed")
}

export async function deleteWorkspaceRequest(confirmName: string, fetchImpl: FetchLike = fetch) {
  const res = await fetchImpl("/api/org", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmName }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; message?: string }
    throw new Error(body.message ?? body.error ?? "Failed")
  }
}
