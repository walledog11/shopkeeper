"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex size-11 items-center justify-center rounded-full border border-border bg-foreground/[0.04]">
        <AlertTriangle className="size-5 text-foreground/50" />
      </span>
      <div className="max-w-sm">
        <p className="mb-1 text-sm font-semibold text-foreground/70">Something went wrong</p>
        <p className="text-xs text-foreground/45">
          This page hit an unexpected error. You can try again, or head back to your inbox.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => reset()}>
          Try again
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <Link href="/dashboard">Back to inbox</Link>
        </Button>
      </div>
      {error.digest && (
        <p className="text-[11px] text-foreground/30">Error ID: {error.digest}</p>
      )}
    </div>
  )
}
