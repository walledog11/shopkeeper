"use client"

import {
  UserProfileAccountPanel,
  UserProfileProvider,
  UserProfileSecurityPanel,
} from "@clerk/ui/experimental"
import { useClerk, useUser } from "@clerk/nextjs"
import { LogOut } from "lucide-react"
import { getUserProfileClerkAppearance } from "@/app/(auth)/_components/clerk-appearance"
import { AccountSettingsSkeleton } from "@/app/dashboard/_components/skeletons/AccountSettingsSkeleton"

export default function AccountSettingsSection() {
  const { signOut } = useClerk()
  const { isLoaded } = useUser()
  const appearance = getUserProfileClerkAppearance()

  if (!isLoaded) {
    return <AccountSettingsSkeleton />
  }

  return (
    <div className="space-y-6">
      <div id="account" className="account-clerk-root min-w-0 space-y-6 scroll-mt-6">
        <UserProfileProvider appearance={appearance}>
          <div className="overflow-hidden rounded-xl border border-border bg-card p-5 sm:p-6">
            <UserProfileAccountPanel />
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card p-5 sm:p-6">
            <UserProfileSecurityPanel />
          </div>
        </UserProfileProvider>
      </div>
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
