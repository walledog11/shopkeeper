"use client"

import { useEffect } from "react"
import { useClerk } from "@clerk/nextjs"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function AccountPageClient() {
  const { openUserProfile } = useClerk()

  useEffect(() => {
    openUserProfile()
  }, [openUserProfile])

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 text-center">
        <h1 className="text-sm font-semibold text-strong">Profile &amp; security</h1>
        <p className="mt-1 text-xs leading-relaxed text-faint">
          Manage your personal profile, sign-in methods, and account deletion in the account portal.
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button
            size="sm"
            onClick={() => openUserProfile()}
            className="h-8 bg-foreground/[0.12] px-3 text-xs font-semibold text-white hover:bg-foreground/[0.18]"
          >
            Open portal
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-8 border-foreground/[0.10] px-3 text-xs font-semibold text-muted-foreground hover:bg-foreground/[0.08]"
          >
            <Link href="/dashboard">Back</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
