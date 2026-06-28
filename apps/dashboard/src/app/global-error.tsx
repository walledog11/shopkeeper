"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, Store } from "lucide-react"
import "./globals.css"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <div className="dashboard-shell m-grain relative flex min-h-dvh w-full flex-col items-center justify-center gap-3 bg-background p-8 text-center">
          <Link
            href="/dashboard"
            aria-label="Shopkeeper"
            className="absolute left-1/2 top-6 flex -translate-x-1/2 items-center gap-2 text-[#2b2118] transition-colors hover:text-[#2b2118]/75"
          >
            <Store className="size-6" strokeWidth={1.75} />
            <span className="text-2xl font-bold leading-none [font-family:Caveat,cursive]">shopkeeper</span>
          </Link>
          <span className="flex size-11 items-center justify-center rounded-full border border-border bg-foreground/[0.04]">
            <AlertTriangle className="size-5 text-foreground/50" />
          </span>
          <div className="max-w-sm">
            <p className="mb-2 font-sans text-3xl font-semibold leading-none tracking-tight text-foreground/80">
              Something went wrong
            </p>
            <p className="text-sm text-foreground/45">
              The app ran into an unexpected error. Try reloading — if it keeps happening, contact support.
            </p>
          </div>
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          {error.digest && (
            <p className="text-[11px] text-foreground/30">Error ID: {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  )
}
