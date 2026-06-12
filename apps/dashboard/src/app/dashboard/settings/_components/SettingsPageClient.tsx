"use client"

import { Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Building2, User, CreditCard, Bot, ClipboardList } from "lucide-react"
import WorkspaceTab from "./workspace/WorkspaceTab"
import AgentTab from "./AgentTab"
import AccountTab from "./AccountTab"
import BillingTab from "./BillingTab"
import AuditLogTab from "./AuditLogTab"
import ConciergeSummary from "./ConciergeSummary"
import { cn } from "@/lib/ui/cn"
import type { OrgSettings, OrgSettingsPatch, VoiceProposal } from "@/types"

interface Props {
  orgName: string
  settings: OrgSettings
  rawSettings: OrgSettingsPatch
  version: string
  voiceProposal: VoiceProposal | null
}

const NAV_ITEMS = [
  { id: "agent", label: "Agent", icon: Bot },
  { id: "workspace", label: "Workspace", icon: Building2 },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "audit", label: "Audit", icon: ClipboardList },
  { id: "account", label: "Account", icon: User },
] as const

export type SettingsTab = (typeof NAV_ITEMS)[number]["id"]

export default function SettingsPageClient(props: Props) {
  return (
    <Suspense fallback={null}>
      <SettingsPageContent {...props} />
    </Suspense>
  )
}

function SettingsPageContent({ orgName, settings, rawSettings, version, voiceProposal }: Props) {
  const searchParams = useSearchParams()
  const { replace } = useRouter()
  const currentParams = new URLSearchParams(searchParams.toString())
  const activeTab = (currentParams.get("tab") as SettingsTab) ?? "agent"

  function setTab(tab: SettingsTab) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    params.delete("connected")
    params.delete("error")
    replace(`/dashboard/settings?${params.toString()}`)
  }

  return (
    <div className="flex-1 overflow-y-auto min-w-0">
      <div className="sticky top-0 z-20 space-y-3 border-b border-white/[0.06] bg-neutral-950/95 px-4 py-4 backdrop-blur-md supports-[backdrop-filter]:bg-neutral-950/88 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-b from-amber-400/[0.08] via-white/[0.02] to-transparent px-5 py-4 sm:px-6">
          <ConciergeSummary orgName={orgName} settings={settings} onJump={setTab} />
        </section>

        <nav
          aria-label="Settings sections"
          className="overflow-hidden rounded-xl border border-white/[0.08] bg-card"
        >
          <div
            role="tablist"
            className="grid grid-cols-2 divide-x divide-y divide-white/[0.06] sm:flex sm:w-full sm:divide-x-0 sm:divide-y-0"
          >
            {NAV_ITEMS.map(({ id, label, icon: Icon }, index) => {
              const active = activeTab === id
              const isPrimary = id === "agent"
              const isLastOdd = index === NAV_ITEMS.length - 1 && NAV_ITEMS.length % 2 === 1
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(id)}
                  className={cn(
                    "relative inline-flex items-center justify-center gap-1.5 px-3 py-3.5 text-[13px] font-medium transition-colors",
                    isLastOdd && "col-span-2 sm:col-span-1",
                    "sm:min-w-0 sm:flex-1",
                    active
                      ? isPrimary
                        ? "text-amber-200"
                        : "text-white"
                      : "text-white/40 hover:bg-white/[0.03] hover:text-white/65",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-3.5 shrink-0",
                      active && isPrimary ? "text-amber-400" : active ? "text-white/70" : "text-white/35",
                    )}
                  />
                  <span>{label}</span>
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-3 bottom-0 h-0.5 rounded-full transition-colors",
                      active ? (isPrimary ? "bg-amber-400" : "bg-white/70") : "bg-transparent",
                    )}
                  />
                </button>
              )
            })}
          </div>
        </nav>
      </div>

      <div className="w-full px-4 py-6 pb-20 sm:px-6 lg:px-8">
        {activeTab === "agent" && (
          <AgentTab settings={settings} rawSettings={rawSettings} version={version} voiceProposal={voiceProposal} />
        )}
        {activeTab === "workspace" && <WorkspaceTab orgName={orgName} version={version} />}
        {activeTab === "billing" && <BillingTab />}
        {activeTab === "audit" && <AuditLogTab />}
        {activeTab === "account" && <AccountTab />}
      </div>
    </div>
  )
}
