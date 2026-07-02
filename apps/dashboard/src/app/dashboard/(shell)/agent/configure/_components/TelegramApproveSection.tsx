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
      className="rounded-3xl border border-border bg-card px-5 py-5 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl border ${
            connected
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
              : "border-amber-500/20 bg-amber-500/10 text-amber-300"
          }`}
        >
          {connected ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <Smartphone className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-strong">
            {connected ? "Approve from your phone" : "Link Telegram to approve from your phone"}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-faint">
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
              className="mt-3 inline-flex text-xs font-semibold text-amber-300 transition-colors hover:text-amber-200"
            >
              Connect Telegram →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
