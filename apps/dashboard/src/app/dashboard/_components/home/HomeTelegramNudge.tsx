"use client"

import Link from "next/link"
import { MessageCircle } from "lucide-react"

export default function HomeTelegramNudge({ connected }: { connected: boolean }) {
  if (connected) return null

  return (
    <div className="rounded-md border border-blue-600/20 bg-blue-600/10 px-4 py-2.5 text-xs text-blue-100/90">
      <MessageCircle className="mr-1.5 inline size-3.5 -mt-px" aria-hidden />
      Get plan approvals on your phone —{" "}
      <Link
        href="/dashboard/integrations#telegram"
        className="font-semibold underline decoration-blue-200/30 underline-offset-2 hover:decoration-blue-200/60"
      >
        Connect Telegram
      </Link>
    </div>
  )
}
