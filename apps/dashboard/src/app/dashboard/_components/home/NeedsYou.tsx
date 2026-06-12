"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertCircle, Camera, Loader2, Mail, MessageSquare, ShoppingBag } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Card } from "@/components/ui/card"
import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"
import AgentAvatar from "@/app/dashboard/_components/agent-panel/AgentAvatar"

interface Props {
  items: HomeNeedsAttentionItem[]
  agentName: string
  onApproved: () => void
}

const CHANNEL_META: Record<string, { Icon: LucideIcon; className: string }> = {
  Email: { Icon: Mail, className: "text-blue-600" },
  Instagram: { Icon: Camera, className: "text-pink-600" },
  Shopify: { Icon: ShoppingBag, className: "text-green-600" },
}

export default function NeedsYou({ items, agentName, onApproved }: Props) {
  if (items.length === 0) return null

  return (
    <section id="needs-you" className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-3">
        <h2 className="font-display-serif text-lg text-foreground">Needs you</h2>
      </div>

      <div className="space-y-2">
        {items.map(item => (
          <NeedsYouRow key={item.threadId} item={item} agentName={agentName} onApproved={onApproved} />
        ))}
      </div>
    </section>
  )
}

function NeedsYouRow({ item, agentName, onApproved }: { item: HomeNeedsAttentionItem; agentName: string; onApproved: () => void }) {
  const channelMeta = CHANNEL_META[item.channelName] ?? { Icon: MessageSquare, className: "text-foreground/40" }
  const ChannelIcon = channelMeta.Icon
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

  const isQuickReply = item.kind === "quick_reply" && item.replyText

  return (
    <Card className="bg-card border-border rounded-xl overflow-hidden">
      <div className="flex md:flex-row flex-col items-stretch">
        <div className="flex-1 min-w-0 px-4 py-3.5">
          <Link
            href={`/dashboard/tickets?thread=${item.threadId}`}
            className="text-sm font-semibold text-foreground/90 hover:text-foreground transition-colors leading-snug"
          >
            {item.headline}
          </Link>

          <div className="flex items-center gap-1.5 text-xs text-foreground/45 mt-1 mb-2.5">
            <span className="font-medium text-foreground/65 truncate">{item.customerName}</span>
            <span className="text-foreground/20">·</span>
            <ChannelIcon aria-hidden className={`size-[11px] shrink-0 ${channelMeta.className}`} />
            <span>{item.channelName}</span>
            {item.orderRef && (
              <>
                <span className="text-foreground/20">·</span>
                <span className="tabular-nums">{item.orderRef}</span>
              </>
            )}
            <span className="text-foreground/20">·</span>
            <span>{item.timeAgo}</span>
          </div>

          {item.contextLine && (
            <p className="text-xs text-foreground/55 leading-snug mb-2">{item.contextLine}</p>
          )}

          <div className="flex items-start gap-2.5">
            <AgentAvatar agentName={agentName} size="sm" className="mt-4" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-foreground/45 mb-1">
                {agentName} {isQuickReply ? "drafted this reply" : "proposes"}
              </p>
              <div
                className={
                  isQuickReply
                    ? "px-3.5 py-2.5 rounded-2xl rounded-tl-md bg-foreground/[0.04] border border-border w-fit"
                    : "px-3.5 py-2.5 rounded-2xl rounded-tl-md bg-amber-600/[0.07] border border-amber-600/25 w-fit"
                }
              >
                <p className="text-[13px] text-foreground/80 leading-relaxed">
                  {isQuickReply ? item.replyText : item.proposalSummary}
                </p>
              </div>
            </div>
          </div>

          {approvalError && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
              <AlertCircle aria-hidden className="size-3 shrink-0" />
              {approvalError}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5 justify-center p-3 md:border-l max-md:border-t border-border">
          {item.kind === "quick_reply" ? (
            <>
              <button
                type="button"
                onClick={approveQuickReply}
                disabled={isApproving}
                className="inline-flex items-center justify-center gap-1.5 text-center md:text-xs text-sm font-semibold px-4 md:py-2.5 py-3.5 rounded-full bg-green-600 hover:bg-green-700 disabled:opacity-40 text-primary-foreground transition-colors"
              >
                {isApproving && <Loader2 aria-hidden className="size-3 animate-spin" />}
                {isApproving ? "Sending" : "Send as-is"}
              </button>
              <Link
                href={`/dashboard/tickets?thread=${item.threadId}`}
                className="text-center md:text-xs text-sm font-semibold px-4 md:py-2.5 py-3.5 rounded-full border border-border hover:bg-foreground/[0.04] text-foreground/70 transition-colors"
              >
                View ticket
              </Link>
            </>
          ) : (
            <Link
              href={`/dashboard/tickets?thread=${item.threadId}`}
              className="text-center md:text-xs text-sm font-semibold px-4 md:py-2.5 py-3.5 rounded-full bg-amber-600 hover:bg-amber-700 text-primary-foreground transition-colors"
            >
              Review decision
            </Link>
          )}
        </div>
      </div>
    </Card>
  )
}
