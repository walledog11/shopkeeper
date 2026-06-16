"use client"

import Link from "next/link"
import useSWR from "swr"
import { CheckCircle2, Smartphone } from "lucide-react"
import { fetcher } from "@/lib/api/fetcher"

interface TelegramStatus {
  connected: boolean
  chats: { chatId: string; connectedAt: string }[]
}

export function TelegramApproveSection() {
  const { data: status } = useSWR<TelegramStatus>("/api/integrations/telegram", fetcher)
  const connected = (status?.chats?.length ?? 0) > 0
  const deviceCount = status?.chats?.length ?? 0

  return (
    <div
      className={`rounded-xl border px-5 py-4 ${
        connected
          ? "border-emerald-400/20 bg-emerald-400/[0.06]"
          : "border-amber-400/20 bg-amber-400/[0.06]"
      }`}
    >
      <div className="flex items-start gap-3">
        {connected ? (
          <CheckCircle2 className="size-5 shrink-0 text-emerald-400 mt-0.5" />
        ) : (
          <Smartphone className="size-5 shrink-0 text-amber-400 mt-0.5" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground/80">
            {connected ? "Approve from your phone" : "Link Telegram to approve from your phone"}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-foreground/45">
            {connected ? (
              <>
                Telegram is linked
                {deviceCount > 1 ? ` on ${deviceCount} devices` : ""}. I&apos;ll send you plans there so you can
                approve with a tap — no need to keep the dashboard open.
              </>
            ) : (
              <>
                Most store owners approve my replies from Telegram. Connect once and I&apos;ll ping you when something
                needs your OK.
              </>
            )}
          </p>
          {!connected && (
            <Link
              href="/dashboard/integrations#telegram"
              className="mt-2.5 inline-flex text-xs font-semibold text-amber-300 hover:text-amber-200 transition-colors"
            >
              Connect Telegram →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
