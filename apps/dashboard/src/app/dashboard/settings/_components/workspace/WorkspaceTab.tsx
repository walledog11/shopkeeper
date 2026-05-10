"use client"

import { useRef, useState } from "react"
import { Download, Loader2, Upload } from "lucide-react"
import { useOrganization } from "@clerk/nextjs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { OrgAvatar } from "@/components/OrgAvatar"
import { SaveButton, SectionCard } from "../shared"

interface Props {
  orgName: string
  version: string
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024

export default function WorkspaceTab({ orgName, version }: Props) {
  const { organization } = useOrganization()
  const [workspaceName, setWorkspaceName] = useState(orgName)
  const [currentVersion, setCurrentVersion] = useState(version)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearError, setClearError] = useState<string | null>(null)
  const [clearSuccess, setClearSuccess] = useState(false)

  async function save() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch('/api/org', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workspaceName, version: currentVersion }),
      })
      if (res.status === 409) {
        const body = await res.json().catch(() => ({})) as { current?: { name?: string; version?: string } }
        if (body.current?.name) setWorkspaceName(body.current.name)
        if (body.current?.version) setCurrentVersion(body.current.version)
        setError('Workspace was updated in another tab. The latest name has been loaded.')
        return
      }
      if (!res.ok) throw new Error('Failed')
      const body = await res.json().catch(() => ({})) as { version?: string }
      if (body.version) setCurrentVersion(body.version)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function uploadLogo(file: File) {
    if (!organization) return
    if (!file.type.startsWith("image/")) {
      setLogoError("Please choose an image file.")
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("Image must be under 2MB.")
      return
    }
    setLogoBusy(true)
    setLogoError(null)
    try {
      await organization.setLogo({ file })
    } catch {
      setLogoError("Failed to upload. Please try again.")
    } finally {
      setLogoBusy(false)
    }
  }

  async function removeLogo() {
    if (!organization) return
    setLogoBusy(true)
    setLogoError(null)
    try {
      await organization.setLogo({ file: null })
    } catch {
      setLogoError("Failed to remove. Please try again.")
    } finally {
      setLogoBusy(false)
    }
  }

  async function exportData() {
    setExporting(true)
    setExportError(null)
    try {
      const res = await fetch("/api/org/data?action=export")
      if (!res.ok) throw new Error("Failed")
      const blob = await res.blob()
      const disposition = res.headers.get("Content-Disposition") ?? ""
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename = match?.[1] ?? `clerk-export-${new Date().toISOString().slice(0, 10)}.json`
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setExportError("Failed to export. Please try again.")
    } finally {
      setExporting(false)
    }
  }

  async function clearTickets() {
    setClearing(true)
    setClearError(null)
    try {
      const res = await fetch('/api/org/data?action=clear_tickets', { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      setConfirmClear(false)
      setClearSuccess(true)
      setTimeout(() => setClearSuccess(false), 3000)
    } catch {
      setClearError('Failed to clear tickets. Please try again.')
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white/80">Workspace</h1>
        <p className="text-sm text-white/35 mt-0.5">Manage your workspace settings.</p>
      </div>

      <SectionCard title="General" description="How your workspace is identified across the dashboard.">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/60">Workspace name</label>
            <Input
              value={workspaceName}
              onChange={e => setWorkspaceName(e.target.value)}
              placeholder="My Store"
              className="h-9 text-sm bg-white/[0.06] border-white/[0.12] text-white/80 placeholder:text-white/25"
            />
          </div>
          <div className="flex items-center justify-end gap-3">
            {error && <p className="text-xs text-red-400">{error}</p>}
            <SaveButton
              saving={saving}
              saved={saved}
              onClick={save}
              disabled={!workspaceName.trim() || workspaceName === orgName}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Branding" description="Logo shown in the sidebar and the org switcher.">
        <div className="flex items-center gap-4">
          <OrgAvatar
            name={organization?.name ?? orgName}
            imageUrl={organization?.imageUrl}
            className="w-14 h-14 rounded-md bg-white/[0.06] border border-white/[0.10] text-white/60 font-semibold text-sm shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) void uploadLogo(file)
                  if (fileInputRef.current) fileInputRef.current.value = ""
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={logoBusy || !organization}
                className="h-8 text-xs font-semibold border-white/[0.10] text-white/60 hover:bg-white/[0.08]"
              >
                {logoBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                {organization?.imageUrl ? "Replace" : "Upload"}
              </Button>
              {organization?.imageUrl && (
                <button
                  onClick={removeLogo}
                  disabled={logoBusy}
                  className="text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-40"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="text-[11px] text-white/30 mt-1.5">PNG, JPG, or SVG. Up to 2MB.</p>
            {logoError && <p className="text-xs text-red-400 mt-1">{logoError}</p>}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Data export" description="Download a JSON snapshot of all customers, threads, messages, knowledge base, and canned responses.">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <p className="text-xs text-white/35 max-w-md">
            Useful for backups or migrating off Clerk. Doesn&apos;t include integration tokens, billing data, or audit logs.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {exportError && <p className="text-xs text-red-400">{exportError}</p>}
            <Button
              variant="outline"
              size="sm"
              onClick={exportData}
              disabled={exporting}
              className="h-8 text-xs font-semibold border-white/[0.10] text-white/60 hover:bg-white/[0.08]"
            >
              {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              Export JSON
            </Button>
          </div>
        </div>
      </SectionCard>

      <div className="rounded-md border border-red-500/20 overflow-hidden">
        <div className="px-6 py-4 bg-red-500/[0.06] border-b border-red-500/15">
          <h2 className="text-sm font-semibold text-red-400">Danger Zone</h2>
          <p className="text-xs text-white/35 mt-0.5">These actions are permanent and cannot be undone.</p>
        </div>
        <div className="p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
            <div>
              <p className="text-sm font-semibold text-white/70">Clear all ticket history</p>
              <p className="text-xs text-white/35 mt-0.5">Permanently deletes all threads and messages for this workspace. This affects every member of the workspace.</p>
              {clearError && <p className="text-xs text-red-400 mt-1">{clearError}</p>}
              {clearSuccess && <p className="text-xs text-green-400 mt-1">All ticket history has been cleared.</p>}
            </div>
            {confirmClear ? (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-white/35">Are you sure?</span>
                <Button
                  size="sm"
                  onClick={clearTickets}
                  disabled={clearing}
                  className="h-7 px-3 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                >
                  {clearing ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes, clear"}
                </Button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="text-xs text-white/30 hover:text-white/70 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmClear(true)}
                className="h-7 px-3 text-xs font-semibold text-red-400 border-red-500/30 bg-red-500/[0.06] hover:bg-red-500/[0.12] hover:text-red-300 self-start shrink-0"
              >
                Clear history
              </Button>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
