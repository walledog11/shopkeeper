"use client"

import { Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Building2, User, CreditCard, Bot, ChevronDown, ClipboardList } from "lucide-react"
import WorkspaceTab from "./workspace/WorkspaceTab"
import AgentTab from "./AgentTab"
import AccountTab from "./AccountTab"
import BillingTab from "./BillingTab"
import AuditLogTab from "./AuditLogTab"
import ConciergeSummary from "./ConciergeSummary"
import { cn } from "@/lib/ui/cn"
import type { OrgSettings } from "@/types"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface Props {
  orgName: string
  settings: OrgSettings
  rawSettings: Partial<OrgSettings>
  version: string
}

const NAV_ITEMS = [
  { id: 'agent',     label: 'Agent',     icon: Bot,           hint: 'what it can do without asking' },
  { id: 'workspace', label: 'Workspace', icon: Building2,     hint: 'workspace name and identity' },
  { id: 'billing',   label: 'Billing',   icon: CreditCard,    hint: 'plan and invoices' },
  { id: 'audit',     label: 'Audit Log', icon: ClipboardList, hint: 'who did what' },
  { id: 'account',   label: 'Account',   icon: User,          hint: 'your profile' },
] as const

export type SettingsTab = typeof NAV_ITEMS[number]['id']

export default function SettingsPageClient(props: Props) {
  return (
    <Suspense fallback={null}>
      <SettingsPageContent {...props} />
    </Suspense>
  )
}

function SettingsPageContent({ orgName, settings, rawSettings, version }: Props) {
  const searchParams = useSearchParams()
  const { replace } = useRouter()
  const currentParams = new URLSearchParams(searchParams.toString())
  const activeTab = (currentParams.get('tab') as SettingsTab) ?? 'agent'

  function setTab(tab: SettingsTab) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    params.delete('connected')
    params.delete('error')
    replace(`/dashboard/settings?${params.toString()}`)
  }

  const activeItem = NAV_ITEMS.find(item => item.id === activeTab) ?? NAV_ITEMS[0]

  return (
    <div className="flex flex-col sm:flex-row h-full overflow-hidden">

      {/* Mobile dropdown */}
      <div className="sm:hidden border-b border-white/[0.07] bg-background shrink-0 p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-2 text-sm font-medium text-white w-full outline-none">
              <activeItem.icon className="size-4 shrink-0" />
              {activeItem.label}
              <ChevronDown className="size-4 ml-auto text-white/40" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width]">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <DropdownMenuItem
                key={id}
                onClick={() => setTab(id)}
                className={activeTab === id ? 'text-white' : 'text-white/60'}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Desktop left rail */}
      <aside className="hidden sm:flex flex-col w-[220px] shrink-0 border-r border-white/[0.07] bg-background overflow-y-auto py-5 px-3">
        <div className="px-2.5 pb-2.5 text-xs font-semibold tracking-[0.06em] uppercase text-white/40">
          Settings
        </div>
        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ id, label, icon: Icon, hint }) => {
            const active = activeTab === id
            return (
              <button type="button"
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  "group flex items-start gap-2.5 w-full px-2.5 py-2 rounded-md text-left transition-colors",
                  active ? "bg-white/[0.08] text-white" : "text-white/55 hover:bg-white/[0.04] hover:text-white/80",
                )}
              >
                <Icon className={cn("size-4 shrink-0 mt-0.5", active ? "text-amber-400" : "text-white/40")} />
                <div className="flex-1 min-w-0">
                  <span className={cn("block text-[13px] truncate", active ? "font-semibold" : "font-medium")}>{label}</span>
                  {!active && (
                    <div className="text-[10.5px] text-white/30 mt-0.5 leading-tight truncate">{hint}</div>
                  )}
                </div>
              </button>
            )
          })}
        </nav>

        <div className="mx-1.5 mt-4 px-3 py-2.5 border border-dashed border-white/[0.1] rounded-md">
          <div className="text-[9.5px] font-bold tracking-[0.05em] text-amber-400 font-mono mb-1">TIP</div>
          <p className="text-xs text-white/45 leading-snug">
            Most operators only ever touch <span className="text-white/75 font-medium">Agent</span>. Everything else is set once.
          </p>
        </div>
      </aside>

      {/* Right content */}
      <div className="flex-1 overflow-y-auto min-w-0">
        <div className="px-4 sm:px-8 py-6 sm:py-8 pb-20 max-w-3xl mx-auto w-full">
          <ConciergeSummary orgName={orgName} settings={settings} onJump={setTab} />
          {activeTab === 'agent' && <AgentTab settings={settings} rawSettings={rawSettings} version={version} />}
          {activeTab === 'workspace' && <WorkspaceTab orgName={orgName} version={version} />}
          {activeTab === 'billing' && <BillingTab />}
          {activeTab === 'audit' && <AuditLogTab />}
          {activeTab === 'account' && <AccountTab />}
        </div>
      </div>

    </div>
  )
}
