"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { Building2, User, Blocks, CreditCard, Bot, ChevronDown } from "lucide-react"
import WorkspaceTab from "./WorkspaceTab"
import AgentTab from "./AgentTab"
import IntegrationsTab from "./IntegrationsTab"
import AccountTab from "./AccountTab"
import BillingTab from "./BillingTab"
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
}

type Tab = 'workspace' | 'agent' | 'integrations' | 'billing' | 'account'

const NAV_ITEMS = [
  { id: 'workspace' as Tab, label: 'Workspace', icon: Building2 },
  { id: 'agent' as Tab, label: 'Agent', icon: Bot },
  { id: 'integrations' as Tab, label: 'Integrations', icon: Blocks },
  { id: 'billing' as Tab, label: 'Billing', icon: CreditCard },
  { id: 'account' as Tab, label: 'Account', icon: User },
]

export default function SettingsPageClient({ orgName, settings }: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeTab = (searchParams.get('tab') as Tab) ?? 'workspace'

  function setTab(tab: Tab) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    params.delete('connected')
    params.delete('error')
    router.replace(`/dashboard/settings?${params.toString()}`)
  }

  const activeItem = NAV_ITEMS.find(item => item.id === activeTab)!

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Mobile dropdown */}
      <div className="sm:hidden border-b border-white/[0.07] bg-background shrink-0 px-4 py-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 text-sm font-medium text-white w-full outline-none">
              <activeItem.icon className="w-4 h-4 shrink-0" />
              {activeItem.label}
              <ChevronDown className="w-4 h-4 ml-auto text-white/40" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width]">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <DropdownMenuItem
                key={id}
                onClick={() => setTab(id)}
                className={activeTab === id ? 'text-white' : 'text-white/60'}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Desktop tab bar */}
      <div className="hidden sm:flex border-b border-white/[0.07] bg-background shrink-0 pt-2">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === id
                ? 'text-white border-white'
                : 'text-white/40 border-transparent hover:text-white/70'
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-8 py-6 sm:py-8 pb-20 max-w-3xl mx-auto w-full">
          {activeTab === 'workspace' && <WorkspaceTab orgName={orgName} />}
          {activeTab === 'agent' && <AgentTab settings={settings} />}
          {activeTab === 'integrations' && <IntegrationsTab />}
          {activeTab === 'billing' && <BillingTab />}
          {activeTab === 'account' && <AccountTab />}
        </div>
      </div>

    </div>
  )
}
