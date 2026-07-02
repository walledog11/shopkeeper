"use client"

import { Suspense, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Building2, CreditCard } from "lucide-react"
import WorkspaceTab from "./workspace/WorkspaceTab"
import BillingTab from "./BillingTab"
import { AGENT_CONFIGURE_PATH } from "@/lib/agent/configure"

const GLASS_SHELL_CLASS =
  "rounded-[22px] border border-foreground/[0.08] bg-card/60 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_18px_50px_rgba(43,33,24,0.13)] backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-card/45"

const GLASS_CONTROL_CLASS =
  "border border-foreground/[0.08] bg-background/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.38)] backdrop-blur-md backdrop-saturate-150 supports-[backdrop-filter]:bg-background/28"

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
    <div className="flex size-full min-w-0 flex-col overflow-hidden bg-background">
      <div className="relative z-20 shrink-0 px-3 pb-3 pt-3">
        <div className={GLASS_SHELL_CLASS}>
          <div
            role="tablist"
            aria-label="Workspace settings sections"
            className={`flex h-9 w-full items-center gap-1 rounded-full px-1 ${GLASS_CONTROL_CLASS}`}
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
                  className={`inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-foreground/[0.12] text-white"
                      : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-strong"
                  }`}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="w-full px-4 py-6 pb-20 sm:px-6 lg:px-8">
          {activeTab === "workspace" && <WorkspaceTab orgName={orgName} version={version} />}
          {activeTab === "billing" && <BillingTab />}
        </div>
      </div>
    </div>
  )
}
