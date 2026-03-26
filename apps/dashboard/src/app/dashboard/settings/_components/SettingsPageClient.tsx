"use client"

import { useState } from "react"
import { useClerk } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Check, Building2, Bot, User, AlertTriangle, Loader2 } from "lucide-react"
import type { OrgSettings } from "@/types"

interface Props {
  orgName: string
  settings: OrgSettings
  userName: string
  userEmail: string
  userImageUrl: string | null
}

function SectionHeader({ icon: Icon, title, description }: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-slate-600" />
      </div>
      <div>
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
    </div>
  )
}

function SaveButton({ saving, saved, onClick, disabled }: {
  saving: boolean
  saved: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <Button
      size="sm"
      onClick={onClick}
      disabled={disabled || saving}
      className="h-8 px-4 bg-slate-900 text-white hover:bg-slate-700 text-xs font-semibold disabled:opacity-40 min-w-[80px]"
    >
      {saving ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : saved ? (
        <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Saved</span>
      ) : (
        "Save changes"
      )}
    </Button>
  )
}

function Field({ label, hint, children }: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
      {children}
    </div>
  )
}

export default function SettingsPageClient({ orgName, settings, userName, userEmail, userImageUrl }: Props) {
  const { openUserProfile } = useClerk()

  // Workspace
  const [workspaceName, setWorkspaceName] = useState(orgName)
  const [savingWorkspace, setSavingWorkspace] = useState(false)
  const [savedWorkspace, setSavedWorkspace] = useState(false)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)

  // AI Behavior
  const [aiContext, setAiContext] = useState(settings.aiContext ?? "")
  const [brandVoice, setBrandVoice] = useState(settings.brandVoice ?? "")
  const [savingAi, setSavingAi] = useState(false)
  const [savedAi, setSavedAi] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  // Danger zone
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearError, setClearError] = useState<string | null>(null)
  const [clearSuccess, setClearSuccess] = useState(false)

  const initials = userName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)

  async function saveWorkspace() {
    setSavingWorkspace(true)
    setSavedWorkspace(false)
    setWorkspaceError(null)
    try {
      const res = await fetch('/api/org', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workspaceName }),
      })
      if (!res.ok) throw new Error('Failed')
      setSavedWorkspace(true)
      setTimeout(() => setSavedWorkspace(false), 2500)
    } catch {
      setWorkspaceError('Failed to save. Please try again.')
    } finally {
      setSavingWorkspace(false)
    }
  }

  async function saveAi() {
    setSavingAi(true)
    setSavedAi(false)
    setAiError(null)
    try {
      const res = await fetch('/api/org', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { aiContext, brandVoice } }),
      })
      if (!res.ok) throw new Error('Failed')
      setSavedAi(true)
      setTimeout(() => setSavedAi(false), 2500)
    } catch {
      setAiError('Failed to save. Please try again.')
    } finally {
      setSavingAi(false)
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
    <div className="h-full overflow-y-auto px-8 py-8">
    <div className="w-full max-w-2xl space-y-6 pb-12">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your workspace preferences and AI behavior.</p>
      </div>

      {/* ── Workspace ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <SectionHeader
          icon={Building2}
          title="Workspace"
          description="How your workspace is identified across the dashboard."
        />
        <div className="space-y-4">
          <Field label="Workspace name">
            <Input
              value={workspaceName}
              onChange={e => setWorkspaceName(e.target.value)}
              placeholder="My Store"
              className="h-9 text-sm bg-slate-50 focus:bg-white"
            />
          </Field>
          <div className="flex items-center justify-end gap-3 pt-1">
            {workspaceError && <p className="text-xs text-red-500">{workspaceError}</p>}
            <SaveButton
              saving={savingWorkspace}
              saved={savedWorkspace}
              onClick={saveWorkspace}
              disabled={!workspaceName.trim() || workspaceName === orgName}
            />
          </div>
        </div>
      </div>

      {/* ── AI Behavior ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <SectionHeader
          icon={Bot}
          title="AI Behavior"
          description="Control how Clerk drafts replies and summarizes conversations."
        />
        <div className="space-y-4">
          <Field
            label="Brand name"
            hint="Used in the AI draft prompt so replies reference your brand, not a generic business."
          >
            <Input
              value={aiContext}
              onChange={e => setAiContext(e.target.value)}
              placeholder="e.g. Acme Store"
              className="h-9 text-sm bg-slate-50 focus:bg-white"
            />
          </Field>
          <Field
            label="Brand voice"
            hint="A short brief the AI uses when drafting replies. Keep it under 200 characters."
          >
            <textarea
              value={brandVoice}
              onChange={e => setBrandVoice(e.target.value)}
              placeholder="e.g. Friendly and direct. Never over-apologise. Use plain language."
              maxLength={200}
              rows={3}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 focus:bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-400 resize-none transition-all"
            />
            <p className="text-[11px] text-slate-400 text-right">{brandVoice.length}/200</p>
          </Field>
          <div className="flex items-center justify-end gap-3 pt-1">
            {aiError && <p className="text-xs text-red-500">{aiError}</p>}
            <SaveButton
              saving={savingAi}
              saved={savedAi}
              onClick={saveAi}
            />
          </div>
        </div>
      </div>

      {/* ── Account ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <SectionHeader
          icon={User}
          title="Account"
          description="Your personal profile. Name, email, and password are managed by Clerk."
        />
        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
          <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-white font-bold text-sm overflow-hidden shrink-0">
            {userImageUrl ? (
              <img src={userImageUrl} alt={userName} className="w-full h-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{userName}</p>
            <p className="text-xs text-slate-500 truncate">{userEmail}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openUserProfile()}
            className="h-8 text-xs font-semibold border-slate-200 text-slate-700 hover:bg-slate-100 shrink-0"
          >
            Edit profile
          </Button>
        </div>
      </div>

      {/* ── Danger Zone ── */}
      <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-6">
        <SectionHeader
          icon={AlertTriangle}
          title="Danger Zone"
          description="These actions are permanent and cannot be undone."
        />
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-slate-100">
            <div>
              <p className="text-sm font-semibold text-slate-900">Clear all ticket history</p>
              <p className="text-xs text-slate-500 mt-0.5">Permanently deletes all threads and messages for this workspace.</p>
              {clearError && <p className="text-xs text-red-500 mt-1">{clearError}</p>}
              {clearSuccess && <p className="text-xs text-green-600 mt-1">All ticket history has been cleared.</p>}
            </div>
            {confirmClear ? (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-slate-500">Are you sure?</span>
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
                  className="text-xs text-slate-400 hover:text-slate-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmClear(true)}
                className="h-7 px-3 text-xs font-semibold text-red-600 border-red-200 hover:bg-red-50 shrink-0"
              >
                Clear history
              </Button>
            )}
          </div>
        </div>
      </div>

    </div>
    </div>
  )
}
