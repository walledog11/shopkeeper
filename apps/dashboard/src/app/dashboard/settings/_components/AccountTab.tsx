"use client"

import { useClerk, useUser } from "@clerk/nextjs"
import Image from "next/image"
import { Button } from "@/components/ui/button"

export default function AccountTab() {
  const { openUserProfile } = useClerk()
  const { user } = useUser()
  const userName = user?.fullName ?? user?.firstName ?? ""
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? ""
  const userImageUrl = user?.imageUrl ?? null
  const initials = userName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white/80">Account</h1>
        <p className="text-sm text-white/35 mt-0.5">Manage your personal account settings.</p>
      </div>

      <div className="bg-card rounded-md border border-border overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4 sm:gap-8 p-5 sm:p-6">
          <div>
            <h2 className="text-sm font-semibold text-white/75">Profile</h2>
            <p className="text-xs text-white/35 mt-1 leading-relaxed">Your personal account. Name, email, and password are managed by Clerk.</p>
          </div>
          <div className="flex items-center gap-4 p-4 bg-white/[0.04] rounded-md border border-white/[0.07]">
            <div className="size-10 rounded-full bg-white/[0.10] flex items-center justify-center text-white font-bold text-sm overflow-hidden shrink-0">
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
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white/80 truncate">{userName}</p>
              <p className="text-xs text-white/40 truncate">{userEmail}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openUserProfile()}
              className="h-8 text-xs font-semibold border-white/[0.10] text-white/60 hover:bg-white/[0.08] shrink-0"
            >
              Edit profile
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
