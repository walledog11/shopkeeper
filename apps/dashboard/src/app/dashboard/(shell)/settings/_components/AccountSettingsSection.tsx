"use client"

import { useClerk, useUser } from "@clerk/nextjs"
import Image from "next/image"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function AccountSettingsSection() {
  const { openUserProfile, signOut } = useClerk()
  const { user } = useUser()
  const userName = user?.fullName ?? user?.firstName ?? ""
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? ""
  const userImageUrl = user?.imageUrl ?? null
  const initials = userName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  return (
    <div id="account" className="scroll-mt-6 overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-[180px_1fr] sm:gap-8 sm:p-6">
        <div>
          <h2 className="text-sm font-semibold text-strong">Account settings</h2>
          <p className="mt-1 text-xs leading-relaxed text-faint">
            Profile, sign-in methods, active sessions, and account deletion.
          </p>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-md border border-foreground/[0.07] bg-foreground/[0.04] p-4">
            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-foreground/[0.10] text-sm font-bold text-strong">
              {userImageUrl ? (
                <Image
                  src={userImageUrl}
                  alt={userName}
                  width={40}
                  height={40}
                  unoptimized
                  className="size-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-strong">{userName}</p>
              <p className="truncate text-xs text-faint">{userEmail}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openUserProfile()}
              className="h-8 shrink-0 border-foreground/[0.10] text-xs font-semibold text-muted-foreground hover:bg-foreground/[0.08]"
            >
              Manage account
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-faint">
            Update your name, password, and connected accounts in the account portal.
            Deleting your Shopkeeper login does not remove workspaces you belong to.
          </p>
          <div className="flex flex-col gap-3 border-t border-foreground/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-relaxed text-faint">
              Sign out of Shopkeeper on this device.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void signOut({ redirectUrl: "/login" })}
              className="h-8 shrink-0 border-foreground/[0.10] text-xs font-semibold text-destructive hover:bg-red-500/[0.08] hover:text-destructive"
            >
              <LogOut className="size-3" />
              Log out
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
