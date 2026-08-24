"use client"

import { Suspense, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { SettingsPageSkeleton } from "@/app/dashboard/_components/skeletons"
import WorkspaceTab from "./workspace/WorkspaceTab"
import BillingTab from "./BillingTab"
import { AGENT_CONFIGURE_PATH } from "@/lib/agent/configure"
import { accountSettingsNavItem } from "@/app/dashboard/_components/nav-items"
import { dashboardPageShellClassName } from "@/app/dashboard/_components/sidebar/sidebar-helpers"
import { cn } from "@/lib/ui/cn"

interface Props {
  orgName: string
  version: string
}

const REVIEW_REDIRECT_TABS = new Set(["activity", "audit"])

function scrollToHash(hash: string) {
  const id = hash.replace(/^#/, "")
  if (!id) return
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
}

export default function SettingsPageClient(props: Props) {
  return (
    <Suspense fallback={<SettingsPageSkeleton />}>
      <SettingsPageContent {...props} />
    </Suspense>
  )
}

function SettingsPageContent({ orgName, version }: Props) {
  const searchParams = useSearchParams()
  const { replace } = useRouter()
  const rawTab = searchParams.get("tab")

  useEffect(() => {
    if (rawTab === "account") {
      replace(accountSettingsNavItem.href)
      return
    }
    if (rawTab === "agent") {
      const hash = typeof window !== "undefined" ? window.location.hash : ""
      replace(`${AGENT_CONFIGURE_PATH}${hash}`)
      return
    }
    if (rawTab && REVIEW_REDIRECT_TABS.has(rawTab)) {
      replace("/dashboard/review")
      return
    }
    if (rawTab === "billing") {
      replace("/dashboard/settings#billing")
      return
    }
    if (rawTab === "workspace") {
      replace("/dashboard/settings#privacy")
    }
  }, [rawTab, replace])

  useEffect(() => {
    if (window.location.hash === "#account") {
      replace(accountSettingsNavItem.href)
      return
    }
    scrollToHash(window.location.hash)
    const onHashChange = () => {
      if (window.location.hash === "#account") {
        replace(accountSettingsNavItem.href)
        return
      }
      scrollToHash(window.location.hash)
    }
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [replace])

  return (
    <div className="flex size-full min-w-0 flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className={cn(dashboardPageShellClassName(), "gap-4 pb-20")}>
          <BillingTab />
          <WorkspaceTab orgName={orgName} version={version} />
        </div>
      </div>
    </div>
  )
}
