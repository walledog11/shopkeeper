"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertCircle, Bot, Camera, Loader2, Mail, MessageSquare, ShoppingBag, Smartphone, Sparkles } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Card } from "@/components/ui/card"
import { getTagStyle } from "@/app/dashboard/_lib/ticket-tags"

interface NeedsYouItem {
  threadId: string
  kind: "quick_reply" | "needs_review"
  customerName: string
  channelName: string
  timeAgo: string
  headline: string
  contextLine: string
  proposalSummary: string
  replyText: string | null
  orderRef: string | null
  tag: string | null
}

interface Props {
  items: NeedsYouItem[]
  agentName: string
  onApproved: () => void
}

const CHANNEL_META: Record<string, { Icon: LucideIcon; className: string }> = {
  Email: { Icon: Mail, className: "text-blue-400" },
  Instagram: { Icon: Camera, className: "text-pink-400" },
  TikTok: { Icon: MessageSquare, className: "text-cyan-300" },
  Shopify: { Icon: ShoppingBag, className: "text-green-400" },
  SMS: { Icon: Smartphone, className: "text-emerald-400" },
  "Agent Action": { Icon: Bot, className: "text-amber-400" },
  "Dashboard Agent": { Icon: Bot, className: "text-amber-400" },
}

export default function NeedsYou({ items, agentName, onApproved }: Props) {
  if (items.length === 0) return null

  return (
    <section id="needs-you" className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-3">
        <h2 className="text-sm font-bold text-white/85">Needs you</h2>
      </div>

      <div className="space-y-2">
        {items.map(item => (
          <NeedsYouRow key={item.threadId} item={item} agentName={agentName} onApproved={onApproved} />
        ))}
      </div>
    </section>
  )
}

function NeedsYouRow({ item, agentName, onApproved }: { item: NeedsYouItem; agentName: string; onApproved: () => void }) {
  const channelMeta = CHANNEL_META[item.channelName] ?? { Icon: MessageSquare, className: "text-white/40" }
  const ChannelIcon = channelMeta.Icon
  const tagStyle = getTagStyle(item.tag)
  const [isApproving, setIsApproving] = useState(false)
  const [approvalError, setApprovalError] = useState<string | null>(null)

  const approveQuickReply = async () => {
    if (item.kind !== "quick_reply" || isApproving) return

    setIsApproving(true)
    setApprovalError(null)

    try {
      const response = await fetch("/api/agent/quick-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: item.threadId }),
      })
      const data = await response.json().catch(() => null) as { error?: string } | null

      if (!response.ok) {
        setApprovalError(data?.error ?? "Could not send reply.")
        return
      }

      onApproved()
    } catch {
      setApprovalError("Network error. Try again.")
    } finally {
      setIsApproving(false)
    }
  }

  return (
    <Card className="bg-card border-border rounded-md overflow-hidden">
      <div className="flex items-stretch">
        <div className="flex-1 min-w-0 px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${tagStyle.className}`}>
              {tagStyle.label}
            </span>
            <Link
              href={`/dashboard/tickets?thread=${item.threadId}`}
              className="text-sm font-semibold text-white/95 truncate hover:text-white transition-colors"
            >
              {item.headline}
            </Link>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-white/40 mb-1.5">
            <ChannelIcon aria-hidden className={`h-[11px] w-[11px] shrink-0 ${channelMeta.className}`} />
            <span className={`${channelMeta.className} uppercase tracking-wide`}>{item.channelName}</span>
            <span className="text-white/15">·</span>
            <span className="truncate text-white/55">{item.customerName}</span>
            {item.orderRef && (
              <>
                <span className="text-white/15">·</span>
                <span className="tabular-nums text-white/55">{item.orderRef}</span>
              </>
            )}
            <span className="text-white/15">·</span>
            <span>{item.timeAgo}</span>
          </div>

          {item.contextLine && (
            <p className="text-xs text-white/55 leading-snug mb-1.5">{item.contextLine}</p>
          )}

          {item.kind === "quick_reply" && item.replyText ? (
            <div className="px-2.5 py-2 rounded-md bg-gradient-to-r from-sky-600/[0.1] to-sky-400/[0.1] border border-blue-400/[0.12]">
              <p className="text-xs text-white/70 leading-snug flex items-start gap-1.5">
                <Sparkles aria-hidden className="h-3 w-3 mt-[2px] shrink-0 text-sky-400/80" />
                <span>
                  <span className="font-semibold text-white/85">{agentName} drafted: </span>
                  <span className="text-white/80">{item.replyText}</span>
                </span>
              </p>
            </div>
          ) : (
            <div className="px-2.5 py-2 rounded-md bg-black/30 border border-white/[0.04]">
              <p className="text-xs text-white/70 leading-snug flex items-start gap-1.5">
                <Sparkles aria-hidden className="h-3 w-3 mt-[2px] shrink-0 text-green-400/80 " />
                <span>
                  <span className="font-semibold text-white/85">{agentName} proposes: </span>
                  <span className="text-white/80">{item.proposalSummary}</span>
                </span>
              </p>
            </div>
          )}

          {approvalError && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-red-300">
              <AlertCircle aria-hidden className="h-3 w-3 shrink-0" />
              {approvalError}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5 justify-center px-3 py-3 border-l border-border bg-white/[0.01]">
          {item.kind === "quick_reply" ? (
            <>
              <button
                type="button"
                onClick={approveQuickReply}
                disabled={isApproving}
                className="inline-flex items-center justify-center gap-1.5 text-center text-[11px] font-semibold px-3 md:py-3 py-6 rounded-md bg-gradient-to-r from-sky-600 to-sky-400 hover:bg-sky-300 disabled:bg-white/[0.07] disabled:text-white/25 text-black transition-colors"
              >
                {isApproving && <Loader2 aria-hidden className="h-3 w-3 animate-spin" />}
                {isApproving ? "Sending" : "Approve & send"}
              </button>
              <Link
                href={`/dashboard/tickets?thread=${item.threadId}`}
                className="text-center text-[11px] font-semibold px-3 md:py-3 py-6 rounded-md border border-white/[0.10] hover:border-white/[0.20] text-white/70 transition-colors"
              >
                Edit
              </Link>
            </>
          ) : (
            <>
              <div className="text-center text-[11px] font-semibold px-3 md:py-3 py-6 rounded-md border border-white/[0.08] text-white/40">
                Requires review
              </div>
              <Link
                href={`/dashboard/tickets?thread=${item.threadId}`}
                className="text-center text-[11px] font-semibold px-3 md:py-3 py-6 rounded-md bg-green-400 hover:bg-green-300 text-black transition-colors"
              >
                Review decision
              </Link>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}
