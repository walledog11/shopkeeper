"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { settingsSectionHref } from "@/app/dashboard/_components/nav-items"
import { SettingsContentSkeleton } from "@/app/dashboard/_components/skeletons"

const DATA_PAGE = "/dashboard/settings/data"
const LOGIN_PAGE = "/dashboard/account"

// Anchors and tabs from before Settings had one home: the old Workspace
// settings page and Agent → Configure. Billing returns and older links still
// carry them.
const LEGACY_HASH_HREFS: Record<string, string> = {
  autonomy: settingsSectionHref("approvals"),
  briefing: settingsSectionHref("briefing"),
  billing: settingsSectionHref("billing"),
  privacy: DATA_PAGE,
  danger: DATA_PAGE,
  account: LOGIN_PAGE,
}

const LEGACY_TAB_HREFS: Record<string, string> = {
  account: LOGIN_PAGE,
  billing: settingsSectionHref("billing"),
  workspace: DATA_PAGE,
}

function legacySettingsHref(tab: string | null, hash: string): string {
  if (tab === "activity" || tab === "audit") return "/dashboard/review"
  return LEGACY_HASH_HREFS[hash.replace(/^#/, "")]
    ?? (tab ? LEGACY_TAB_HREFS[tab] : undefined)
    ?? settingsSectionHref("voice")
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
