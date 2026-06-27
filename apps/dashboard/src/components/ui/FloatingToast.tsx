"use client"

import { useEffect } from "react"
import { AlertCircle, CheckCircle2 } from "lucide-react"

export interface FloatingToastProps {
  message: string
  tone?: "success" | "error"
  onDismiss?: () => void
  durationMs?: number
}

export default function FloatingToast({
  message,
  tone = "success",
  onDismiss,
  durationMs = 3500,
}: FloatingToastProps) {
  useEffect(() => {
    if (!onDismiss) return
    const timer = window.setTimeout(onDismiss, durationMs)
    return () => window.clearTimeout(timer)
  }, [durationMs, message, onDismiss])

  return (
    <output
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-lg pointer-events-none"
    >
      {tone === "error"
        ? <AlertCircle aria-hidden className="size-4 shrink-0 text-red-400" />
        : <CheckCircle2 aria-hidden className="size-4 shrink-0 text-emerald-400" />
      }
      {message}
    </output>
  )
}
