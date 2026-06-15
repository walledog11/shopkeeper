"use client"

import { Suspense, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Building2, CreditCard } from "lucide-react"
import WorkspaceTab from "./workspace/WorkspaceTab"
import BillingTab from "./BillingTab"
import { cn } from "@/lib/ui/cn"
import { AGENT_CONFIGURE_PATH } from "@/lib/agent/configure"

interface Props {
  orgName: string
  version: string
}

const NAV_ITEMS = [
  { id: "workspace", label: "Workspace", icon: Building2 },
  { id: "billing", label: "Billing", icon: CreditCard },
] as const

export type SettingsTab = (typeof NAV_ITEMS)[number]["id"]

const REVIEW_REDIRECT_TABS = new Set(["activity", "audit"])

function resolveTab(raw: string | null): SettingsTab {
  if (raw && NAV_ITEMS.some(item => item.id === raw)) return raw as SettingsTab
  return "workspace"
}

export default function SettingsPageClient(props: Props) {
  return (
    <Suspense fallback={null}>
      <SettingsPageContent {...props} />
    </Suspense>
  )
}

function SettingsPageContent({ orgName, version }: Props) {
  const searchParams = useSearchParams()
  const { replace } = useRouter()
  const rawTab = searchParams.get("tab")
  const activeTab = resolveTab(rawTab)

  useEffect(() => {
    if (rawTab === "account") {
      replace("/dashboard/account")
      return
    }
    if (rawTab === "agent") {
      const hash = typeof window !== "undefined" ? window.location.hash : ""
      replace(`${AGENT_CONFIGURE_PATH}${hash}`)
      return
    }
    if (rawTab && REVIEW_REDIRECT_TABS.has(rawTab)) {
      replace("/dashboard/review")
    }
  }, [rawTab, replace])

  function setTab(tab: SettingsTab) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    params.delete("connected")
    params.delete("error")
    replace(`/dashboard/settings?${params.toString()}`)
  }

  return (
    <div className="flex-1 overflow-y-auto min-w-0">
      <div className="sticky top-0 z-20 border-b border-white/[0.06] bg-neutral-950/95 px-4 py-4 backdrop-blur-md supports-[backdrop-filter]:bg-neutral-950/88 sm:px-6 lg:px-8">
        <nav
          aria-label="Workspace settings sections"
          className="overflow-hidden rounded-xl border border-white/[0.08] bg-card"
        >
          <div
            role="tablist"
            className="grid grid-cols-2 divide-x divide-white/[0.06] sm:flex sm:w-full"
          >
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
              const active = activeTab === id
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(id)}
                  className={cn(
                    "relative inline-flex items-center justify-center gap-1.5 px-3 py-3.5 text-[13px] font-medium transition-colors",
                    "sm:min-w-0 sm:flex-1",
                    active
                      ? "text-white"
                      : "text-white/40 hover:bg-white/[0.03] hover:text-white/65",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-3.5 shrink-0",
                      active ? "text-white/70" : "text-white/35",
                    )}
                  />
                  <span>{label}</span>
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-3 bottom-0 h-0.5 rounded-full transition-colors",
                      active ? "bg-white/70" : "bg-transparent",
                    )}
                  />
                </button>
              )
            })}
          </div>
        </nav>
      </div>

      <div className="w-full px-4 py-6 pb-20 sm:px-6 lg:px-8">
        {activeTab === "workspace" && <WorkspaceTab orgName={orgName} version={version} />}
        {activeTab === "billing" && <BillingTab />}
      </div>
    </div>
  )
}
