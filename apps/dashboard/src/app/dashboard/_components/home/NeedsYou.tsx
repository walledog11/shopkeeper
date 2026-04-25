"use client"

import Link from "next/link"
import { Bot, Camera, Mail, MessageSquare, ShoppingBag, Smartphone } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Card } from "@/components/ui/card"
import { getTagStyle } from "@/app/dashboard/_lib/ticket-tags"

interface NeedsYouItem {
  threadId: string
  customerName: string
  channelLogo: string
  channelName: string
  ticketRef: string
  timeAgo: string
  proposalSummary: string
  tag: string | null
}

interface Props {
  items: NeedsYouItem[]
  agentName: string
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

export default function NeedsYou({ items, agentName }: Props) {
  if (items.length === 0) return null

  return (
    <section id="needs-you" className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-3">
        <h2 className="text-sm font-bold text-white/85">Needs you</h2>
      </div>

      <div className="space-y-2">
        {items.map(item => (
          <NeedsYouRow key={item.threadId} item={item} agentName={agentName} />
        ))}
      </div>
    </section>
  )
}

function NeedsYouRow({ item, agentName }: { item: NeedsYouItem; agentName: string }) {
  const channelMeta = CHANNEL_META[item.channelName] ?? { Icon: MessageSquare, className: "text-white/40" }
  const ChannelIcon = channelMeta.Icon
  const tagStyle = getTagStyle(item.tag)

  return (
    <Card className="bg-card border-border rounded-md overflow-hidden">
      <div className="flex items-stretch">
        <div className="flex-1 min-w-0 px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${tagStyle.className}`}>
              {tagStyle.label}
            </span>
            <Link
              href={`/dashboard/tickets?thread=${item.threadId}`}
              className="text-sm font-semibold text-white/90 truncate hover:text-white transition-colors"
            >
              {item.customerName}
            </Link>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-white/40 mb-1.5">
            <ChannelIcon aria-hidden className={`h-[11px] w-[11px] shrink-0 ${channelMeta.className}`} />
            <span className={`${channelMeta.className} uppercase tracking-wide`}>{item.channelName}</span>
            <span className="text-white/15">·</span>
            <span>{item.timeAgo}</span>
          </div>

          <div className="px-2.5 py-2 rounded-md bg-black/30 border border-white/[0.04]">
            <p className="text-xs text-white/60 leading-snug">
              <span className="text-white/40">{agentName} proposes: </span>
              <span className="text-white/80">{item.proposalSummary}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 px-3 py-3 border-l border-border bg-white/[0.01]">
          <Link
            href={`/dashboard/tickets?thread=${item.threadId}&action=approve`}
            className="text-center text-[11px] font-semibold px-3 py-1.5 rounded-md bg-green-400 hover:bg-green-300 text-black transition-colors"
          >
            ✓ Approve
          </Link>
          <Link
            href={`/dashboard/tickets?thread=${item.threadId}`}
            className="text-center text-[11px] font-semibold px-3 py-1.5 rounded-md border border-white/[0.10] hover:border-white/[0.20] text-white/70 transition-colors"
          >
            Edit & run
          </Link>
          <Link
            href={`/dashboard/tickets?thread=${item.threadId}&action=skip`}
            className="text-center text-[11px] font-medium px-3 py-1 rounded-md text-white/35 hover:text-white/70 transition-colors"
          >
            Skip
          </Link>
        </div>
      </div>
    </Card>
  )
}
