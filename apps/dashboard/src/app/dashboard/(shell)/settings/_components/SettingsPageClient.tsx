"use client"

import { Suspense, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import WorkspaceTab from "./workspace/WorkspaceTab"
import BillingTab from "./BillingTab"
import { AGENT_CONFIGURE_PATH } from "@/lib/agent/configure"

interface Props {
  orgName: string
  version: string
}

const REVIEW_REDIRECT_TABS = new Set(["activity", "audit"])

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
      return
    }
    if (rawTab === "billing") {
      replace("/dashboard/settings#billing")
      return
    }
    if (rawTab === "workspace") {
      replace("/dashboard/settings")
    }
  }, [rawTab, replace])

  return (
    <div className="flex size-full min-w-0 flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 pb-20 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Billing</h1>
            <p className="mt-0.5 text-sm text-faint">
              Plan, payment method, and invoices for {orgName}.
            </p>
          </div>
          <BillingTab />
          <WorkspaceTab orgName={orgName} version={version} />
        </div>
      </div>
    </div>
  )
}
