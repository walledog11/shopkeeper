"use client"

import { Suspense, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import AccountSettingsSection from "./AccountSettingsSection"
import WorkspaceTab from "./workspace/WorkspaceTab"
import BillingTab from "./BillingTab"
import { AGENT_CONFIGURE_PATH } from "@/lib/agent/configure"

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
    <Suspense fallback={null}>
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
      replace("/dashboard/settings#account")
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
    scrollToHash(window.location.hash)
    const onHashChange = () => scrollToHash(window.location.hash)
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  return (
    <div className="flex size-full min-w-0 flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 pb-20 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Settings</h1>
            <p className="mt-0.5 text-sm text-faint">
              Your account, billing, and workspace for {orgName}.
            </p>
          </div>
          <AccountSettingsSection />
          <BillingTab />
          <WorkspaceTab orgName={orgName} version={version} />
        </div>
      </div>
    </div>
  )
}
