"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { SaveButton, SectionCard } from "../shared"
import CannedResponses from "./CannedResponses"

interface Props {
  orgName: string
}

export default function WorkspaceTab({ orgName }: Props) {
  const [workspaceName, setWorkspaceName] = useState(orgName)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch('/api/org', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workspaceName }),
      })
      if (!res.ok) throw new Error('Failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white/80">Workspace</h1>
        <p className="text-sm text-white/35 mt-0.5">Manage your workspace settings and reply templates.</p>
      </div>

      <SectionCard title="General" description="How your workspace is identified across the dashboard.">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/60">Workspace name</label>
            <Input
              value={workspaceName}
              onChange={e => setWorkspaceName(e.target.value)}
              placeholder="My Store"
              className="h-9 text-sm bg-white"
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

      <CannedResponses />
    </div>
  )
}
