"use client"

import { useClerk, useUser } from "@clerk/nextjs"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function AccountPageClient() {
  const { openUserProfile } = useClerk()
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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 pb-20 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-lg font-bold text-foreground/80">Account</h1>
          <p className="mt-0.5 text-sm text-foreground/35">
            Your personal profile and sign-in. Workspace settings live separately.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-[180px_1fr] sm:gap-8 sm:p-6">
            <div>
              <h2 className="text-sm font-semibold text-foreground/75">Profile</h2>
              <p className="mt-1 text-xs leading-relaxed text-foreground/35">
                Name, email, and avatar for your Shopkeeper login.
              </p>
            </div>
            <div className="flex items-center gap-4 rounded-md border border-foreground/[0.07] bg-foreground/[0.04] p-4">
              <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-foreground/[0.10] text-sm font-bold text-white">
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
                <p className="truncate text-sm font-semibold text-foreground/80">{userName}</p>
                <p className="truncate text-xs text-foreground/40">{userEmail}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openUserProfile()}
                className="h-8 shrink-0 border-foreground/[0.10] text-xs font-semibold text-foreground/60 hover:bg-foreground/[0.08]"
              >
                Edit profile
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-[180px_1fr] sm:gap-8 sm:p-6">
            <div>
              <h2 className="text-sm font-semibold text-foreground/75">Security</h2>
              <p className="mt-1 text-xs leading-relaxed text-foreground/35">
                Password, connected accounts, and active sessions.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-relaxed text-foreground/40">
                Manage password and sign-in methods in your account portal.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openUserProfile()}
                className="h-8 shrink-0 border-foreground/[0.10] text-xs font-semibold text-foreground/60 hover:bg-foreground/[0.08]"
              >
                Manage security
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-red-500/20">
          <div className="border-b border-red-500/15 bg-red-500/[0.06] px-5 py-4 sm:px-6">
            <h2 className="text-sm font-semibold text-red-400">Delete account</h2>
            <p className="mt-0.5 text-xs text-foreground/35">
              Permanently remove your Shopkeeper login. This does not delete workspaces you belong to.
            </p>
          </div>
          <div className="space-y-3 p-5 sm:p-6">
            <p className="text-xs leading-relaxed text-foreground/40">
              If you own workspaces with active subscriptions or data, transfer or delete them first in{" "}
              <Link href="/dashboard/settings?tab=workspace" className="font-semibold text-foreground/60 hover:text-foreground/80">
                workspace settings
              </Link>
              . Account deletion is handled in the account portal.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openUserProfile()}
              className="h-8 border-red-500/30 bg-red-500/[0.06] text-xs font-semibold text-red-400 hover:bg-red-500/[0.12] hover:text-red-300"
            >
              Open account portal
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
