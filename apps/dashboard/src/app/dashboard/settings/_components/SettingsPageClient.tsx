"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useClerk, useUser } from "@clerk/nextjs"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Check, Building2, User, AlertTriangle, Loader2, Blocks, AlertCircle, CheckCircle2, CreditCard } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import type { OrgSettings, Integration } from "@/types"
import IntegrationCard, { type PlatformConfig } from "../../integrations/_components/IntegrationCard"
import SmsCard from "./SmsCard"
import BillingTab from "./BillingTab"

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  orgName: string
  settings: OrgSettings
}

type Tab = 'workspace' | 'integrations' | 'billing' | 'account'

// ── Integration configs ────────────────────────────────────────────────────────

const PLATFORM_CONFIG: PlatformConfig[] = [
  {
    id: "email",
    platform: "email",
    name: "Gmail / Email",
    logo: "/logos/gmail.png",
    description: "Route your support inbox directly into Clerk and reply from a verified sender address.",
    connectType: 'email',
  },
  {
    id: "instagram",
    platform: "ig_dm",
    name: "Instagram",
    logo: "/logos/instagram-logo.png",
    description: "Manage Direct Messages from your Instagram business account alongside every other channel.",
    connectType: 'ig',
  },
  {
    id: "tiktok",
    platform: "tiktok",
    name: "TikTok",
    logo: "/logos/tiktok-logo.png",
    description: "Manage TikTok Shop messages and video comments in one unified inbox.",
    connectType: 'coming-soon',
  },
  {
    id: "shopify",
    platform: "shopify",
    name: "Shopify",
    logo: "/logos/shopify.svg",
    description: "Sync customer orders, returns, and Shopify Inbox messages directly into Clerk.",
    connectType: 'shopify',
  },
]

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'You cancelled the Instagram connection.',
  no_ig_account: 'No Instagram Business account was found on your Facebook account.',
  token_exchange_failed: 'Authentication failed. Please try again.',
  state_mismatch: 'Security check failed. Please try again.',
  server_error: 'Something went wrong on our end. Please try again.',
  shopify_state_mismatch: 'Security check failed. Please try again.',
  shopify_hmac_invalid: 'Authentication failed — the response from Shopify could not be verified.',
  shopify_token_failed: 'Could not obtain a Shopify access token. Please try again.',
  shopify_server_error: 'Something went wrong connecting your Shopify store. Please try again.',
  shopify_invalid_callback: 'Invalid callback from Shopify. Please try again.',
}

// ── Shared sub-components ──────────────────────────────────────────────────────

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

// ── Main component ─────────────────────────────────────────────────────────────

export default function SettingsPageClient({ orgName, settings }: Props) {
  const { openUserProfile } = useClerk()
  const { user } = useUser()
  const userName = user?.fullName ?? user?.firstName ?? ""
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? ""
  const userImageUrl = user?.imageUrl ?? null
  const searchParams = useSearchParams()
  const router = useRouter()

  const activeTab = (searchParams.get('tab') as Tab) ?? 'workspace'

  function setTab(tab: Tab) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    // Remove OAuth callback params when switching tabs manually
    params.delete('connected')
    params.delete('error')
    router.replace(`/dashboard/settings?${params.toString()}`)
  }

  // ── Workspace state ──────────────────────────────────────────────────────────
  const [workspaceName, setWorkspaceName] = useState(orgName)
  const [savingWorkspace, setSavingWorkspace] = useState(false)
  const [savedWorkspace, setSavedWorkspace] = useState(false)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)

  // ── AI Behavior state ────────────────────────────────────────────────────────
  const [aiContext, setAiContext] = useState(settings.aiContext ?? "")
  const [brandVoice, setBrandVoice] = useState(settings.brandVoice ?? "")
  const [savingAi, setSavingAi] = useState(false)
  const [savedAi, setSavedAi] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  // ── Danger zone state ────────────────────────────────────────────────────────
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearError, setClearError] = useState<string | null>(null)
  const [clearSuccess, setClearSuccess] = useState(false)

  // ── Integrations state ───────────────────────────────────────────────────────
  const { data: integrations = [], mutate: mutateIntegrations } = useSWR<Integration[]>('/api/integrations', fetcher)
  const [intBanner, setIntBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    if (activeTab !== 'integrations') return
    const connected = searchParams.get('connected')
    const error = searchParams.get('error')
    if (connected === 'instagram') setIntBanner({ type: 'success', message: 'Instagram connected successfully.' })
    else if (connected === 'shopify') setIntBanner({ type: 'success', message: 'Shopify store connected successfully.' })
    else if (error) setIntBanner({ type: 'error', message: OAUTH_ERROR_MESSAGES[error] ?? 'An unexpected error occurred.' })
  }, [activeTab, searchParams])

  const initials = userName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)

  // ── Shared save helper ───────────────────────────────────────────────────────
  async function patchOrg(
    body: object,
    setSaving: (v: boolean) => void,
    setSaved: (v: boolean) => void,
    setError: (v: string | null) => void,
  ) {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch('/api/org', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  // ── Workspace actions ────────────────────────────────────────────────────────
  function saveWorkspace() {
    return patchOrg({ name: workspaceName }, setSavingWorkspace, setSavedWorkspace, setWorkspaceError)
  }

  function saveAi() {
    return patchOrg({ settings: { aiContext, brandVoice } }, setSavingAi, setSavedAi, setAiError)
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

  // ── Integration actions ──────────────────────────────────────────────────────
  async function handleConnect(platform: string, emailAddress: string): Promise<boolean> {
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, externalAccountId: emailAddress }),
      })
      if (!res.ok) throw new Error()
      await mutateIntegrations()
      return true
    } catch {
      setIntBanner({ type: 'error', message: 'Failed to connect. Please try again.' })
      return false
    }
  }

  async function handleDisconnect(integrationId: string) {
    try {
      const res = await fetch(`/api/integrations/${integrationId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      await mutateIntegrations()
    } catch {
      setIntBanner({ type: 'error', message: 'Failed to disconnect. Please try again.' })
    }
  }

  const getConnected = (platform: string) => integrations.filter(i => i.platform === platform)

  // ── Render ───────────────────────────────────────────────────────────────────

  const NAV_ITEMS = [
    { id: 'workspace' as Tab, label: 'Workspace', icon: Building2 },
    { id: 'integrations' as Tab, label: 'Integrations', icon: Blocks },
    { id: 'billing' as Tab, label: 'Billing', icon: CreditCard },
    { id: 'account' as Tab, label: 'Account', icon: User },
  ]

  return (
    <div className="flex flex-col sm:flex-row h-full overflow-hidden">

      {/* ── Mobile top tab bar ── */}
      <div className="sm:hidden flex border-b border-slate-100 bg-white shrink-0 mt-3">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-[11px] font-semibold transition-colors ${
              activeTab === item.id
                ? 'text-slate-900 border-b-2 border-slate-900'
                : 'text-slate-400'
            }`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </button>
        ))}
      </div>

      {/* ── Left sidebar nav (desktop only) ── */}
      <aside className="hidden sm:flex w-52 shrink-0 border-r border-slate-100 flex-col pt-8 pb-6 px-3 overflow-y-auto">
        <div className="px-3 mb-4">
          <h1 className="text-base font-bold tracking-tight text-slate-900">Settings</h1>
        </div>
        <nav className="space-y-0.5">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors text-left ${
                activeTab === item.id
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Right content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-8 py-6 sm:py-8 pb-20">

          {/* ── WORKSPACE TAB ── */}
          {activeTab === 'workspace' && (
            <div className="space-y-6 max-w-3xl">

              <div>
                <h1 className="text-lg font-bold text-slate-900">Workspace</h1>
                <p className="text-sm text-slate-500 mt-0.5">Manage your workspace name and AI behavior.</p>
              </div>

              {/* Section: General */}
              <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4 sm:gap-8 p-5 sm:p-6">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">General</h2>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">How your workspace is identified across the dashboard.</p>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-700">Workspace name</label>
                      <Input
                        value={workspaceName}
                        onChange={e => setWorkspaceName(e.target.value)}
                        placeholder="My Store"
                        className="h-9 text-sm bg-white"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-3">
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
              </div>

              {/* Section: AI Behavior */}
              <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4 sm:gap-8 p-5 sm:p-6">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">AI Behavior</h2>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">Control how Clerk drafts replies and summarizes conversations.</p>
                  </div>
                  <div className="space-y-5">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-700">
                        Brand name
                        <span className="ml-1.5 font-normal text-slate-400">· used in AI draft prompts</span>
                      </label>
                      <Input
                        value={aiContext}
                        onChange={e => setAiContext(e.target.value)}
                        placeholder="e.g. Acme Store"
                        className="h-9 text-sm bg-white"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-700">
                        Brand voice
                        <span className="ml-1.5 font-normal text-slate-400">· max 200 characters</span>
                      </label>
                      <textarea
                        value={brandVoice}
                        onChange={e => setBrandVoice(e.target.value)}
                        placeholder="e.g. Friendly and direct. Never over-apologise. Use plain language."
                        maxLength={200}
                        rows={3}
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-400 resize-none transition-all"
                      />
                      <p className="text-[11px] text-slate-400 text-right">{brandVoice.length}/200</p>
                    </div>
                    <div className="flex items-center justify-end gap-3">
                      {aiError && <p className="text-xs text-red-500">{aiError}</p>}
                      <SaveButton saving={savingAi} saved={savedAi} onClick={saveAi} />
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ── INTEGRATIONS TAB ── */}
          {activeTab === 'integrations' && (
            <div className="space-y-7">

              <div>
                <h1 className="text-lg font-bold text-slate-900">Integrations</h1>
                <p className="text-sm text-slate-500 mt-0.5">Connect your channels and tools to Clerk.</p>
              </div>

              {/* OAuth callback banner */}
              {intBanner && (
                <div className={`flex items-start gap-3 rounded-md px-4 py-3 text-sm border ${
                  intBanner.type === 'success'
                    ? 'bg-green-50 border-green-200 text-green-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  {intBanner.type === 'success'
                    ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-green-600" />
                    : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
                  }
                  <span>{intBanner.message}</span>
                  <button
                    onClick={() => setIntBanner(null)}
                    className="ml-auto text-current opacity-50 hover:opacity-100 shrink-0"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Messaging channels */}
              <div className="space-y-3">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Messaging</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {PLATFORM_CONFIG.filter(c => ['email', 'instagram', 'tiktok'].includes(c.id)).map(config => (
                    <IntegrationCard
                      key={config.id}
                      config={config}
                      connected={config.platform ? getConnected(config.platform) : []}
                      onConnect={handleConnect}
                      onDisconnect={handleDisconnect}
                    />
                  ))}
                </div>
              </div>

              {/* Commerce */}
              <div className="space-y-3">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Commerce</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {PLATFORM_CONFIG.filter(c => c.id === 'shopify').map(config => (
                    <IntegrationCard
                      key={config.id}
                      config={config}
                      connected={config.platform ? getConnected(config.platform) : []}
                      onConnect={handleConnect}
                      onDisconnect={handleDisconnect}
                    />
                  ))}
                </div>
              </div>

              {/* Team */}
              <div className="space-y-3">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Team</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  <SmsCard />
                </div>
              </div>

            </div>
          )}

          {/* ── BILLING TAB ── */}
          {activeTab === 'billing' && <BillingTab />}

          {/* ── ACCOUNT TAB ── */}
          {activeTab === 'account' && (
            <div className="space-y-6 max-w-3xl">

              <div>
                <h1 className="text-lg font-bold text-slate-900">Account</h1>
                <p className="text-sm text-slate-500 mt-0.5">Manage your personal account settings.</p>
              </div>

              {/* Section: Profile */}
              <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4 sm:gap-8 p-5 sm:p-6">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Profile</h2>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">Your personal account. Name, email, and password are managed by Clerk.</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-md border border-slate-100">
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
                </div>
              </div>

              {/* Section: Danger Zone */}
              <div className="rounded-md border border-red-200 overflow-hidden">
                <div className="px-6 py-4 bg-red-50/60 border-b border-red-100">
                  <h2 className="text-sm font-semibold text-red-600">Danger Zone</h2>
                  <p className="text-xs text-slate-500 mt-0.5">These actions are permanent and cannot be undone.</p>
                </div>
                <div className="p-5 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
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
                        className="h-7 px-3 text-xs font-semibold text-red-600 border-red-200 hover:bg-red-50 self-start shrink-0"
                      >
                        Clear history
                      </Button>
                    )}
                  </div>
                </div>
              </div>

            </div>
          )}

        </div>
      </div>

    </div>
  )
}
