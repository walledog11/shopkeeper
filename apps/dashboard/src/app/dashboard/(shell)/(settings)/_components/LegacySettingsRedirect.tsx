"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { settingsSectionHref } from "@/app/dashboard/_components/nav-items"
import { SettingsContentSkeleton } from "@/app/dashboard/_components/skeletons"

// Anchors and tabs from before Settings had one home: the old Workspace
// settings page and Agent → Configure. Billing returns and older links still
// carry them.
const LEGACY_HASH_SECTIONS: Record<string, string> = {
  autonomy: "approvals",
  briefing: "briefing",
  billing: "billing",
  privacy: "data",
  danger: "data",
  account: "account",
}

const LEGACY_TAB_SECTIONS: Record<string, string> = {
  account: "account",
  billing: "billing",
  workspace: "data",
}

function legacySettingsHref(tab: string | null, hash: string): string {
  if (tab === "activity" || tab === "audit") return "/dashboard/review"
  const section = LEGACY_HASH_SECTIONS[hash.replace(/^#/, "")] ?? (tab ? LEGACY_TAB_SECTIONS[tab] : undefined)
  return settingsSectionHref(section ?? "general")
}

function Redirect() {
  const { replace } = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    replace(legacySettingsHref(searchParams.get("tab"), window.location.hash))
  }, [replace, searchParams])

  return <SettingsContentSkeleton />
}

export function LegacySettingsRedirect() {
  return (
    <Suspense fallback={<SettingsContentSkeleton />}>
      <Redirect />
    </Suspense>
  )
}
