"use client"

import { UserProfile, useClerk, useUser } from "@clerk/nextjs"
import { LogOut } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { getUserProfileClerkAppearance } from "@/app/(auth)/_components/clerk-appearance"
import { AccountSettingsSkeleton } from "@/app/dashboard/_components/skeletons/AccountSettingsSkeleton"
import { isClerkAccountOverviewHash } from "./account-settings-helpers"
import { AccountSecuritySection } from "./AccountSecuritySection"

export default function AccountSettingsSection() {
  const { signOut } = useClerk()
  const { isLoaded } = useUser()
  const appearance = useMemo(() => getUserProfileClerkAppearance(), [])
  const [editingPassword, setEditingPassword] = useState(false)
  const isOverview = useClerkAccountOverview()

  if (!isLoaded) {
    return <AccountSettingsSkeleton />
  }

  return (
    <div className="flex flex-col gap-4">
      {editingPassword ? (
        <AccountSecuritySection
          editorOpen
          onEditorOpenChange={setEditingPassword}
        />
      ) : (
        <>
          <div id="account" className="account-clerk-root min-w-0 scroll-mt-6">
            <UserProfile routing="hash" appearance={appearance} />
          </div>
          {isOverview ? (
            <AccountSecuritySection
              editorOpen={false}
              onEditorOpenChange={setEditingPassword}
            />
          ) : null}
        </>
      )}
      <button
        type="button"
        onClick={() => void signOut({ redirectUrl: "/login" })}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-semibold text-white transition-all bg-gradient-to-b from-red-600 to-red-700 shadow-md shadow-red-600/20 hover:-translate-y-0.5 hover:from-red-600 hover:to-red-700/95 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-red-600/40"
      >
        <LogOut className="size-4" />
        Log out
      </button>
    </div>
  )
}

function useClerkAccountOverview() {
  const [isOverview, setIsOverview] = useState(true)

  useEffect(() => {
    const sync = () => {
      setIsOverview(isClerkAccountOverviewHash(window.location.hash))
    }
    sync()
    window.addEventListener("hashchange", sync)
    return () => window.removeEventListener("hashchange", sync)
  }, [])

  return isOverview
}
