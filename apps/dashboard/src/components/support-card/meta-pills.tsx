import Image from "next/image"
import type { ReactNode } from "react"
import { cn } from "@/lib/ui/cn"
import { getChannelInfoByName } from "@/lib/messaging/channels"
import { timeAgoCard } from "@/lib/messaging/customer-display"
import { getTagStyle } from "@/lib/ui/ticket-tags"
import { supportCardMetaPillShellClassName } from "./styles"

export function MetaPill({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn(supportCardMetaPillShellClassName, "justify-start bg-white", className)}>{children}</div>
}

const ONE_WORD_TAG_LABELS: Record<string, string> = {
  "Order Status": "Status",
  "Product Inquiry": "Product",
  needs_human: "Escalated",
}

export function ticketTopicLabel(tag: string | null, fallback: string | null = null): string | null {
  if (!tag) return fallback
  return ONE_WORD_TAG_LABELS[tag] ?? getTagStyle(tag).label.split(/\s+/)[0] ?? fallback
}

export function ChannelPill({ channelName, className }: { channelName: string; className?: string }) {
  const channel = getChannelInfoByName(channelName)
  return (
    <div className={cn(supportCardMetaPillShellClassName, channel.badgeClassName, className)}>
      <Image src={channel.logo} alt="" width={16} height={16} className="size-4 shrink-0 object-contain" aria-hidden />
      <span className="sr-only">{channel.label}</span>
    </div>
  )
}

export function CustomerIdentity({
  name,
  isVip,
  className,
  emailClassName = className,
  domainClassName,
}: {
  name: string | null
  isVip?: boolean
  className: string
  emailClassName?: string
  domainClassName: string
}) {
  const emailAt = name?.indexOf("@") ?? -1
  return (
    <>
      {name && (emailAt > 0 ? (
        <span className={emailClassName}>
          <span>{name.slice(0, emailAt)}</span>
          <span className={domainClassName}>@{name.slice(emailAt + 1)}</span>
        </span>
      ) : <span className={className}>{name}</span>)}
      {isVip && <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-violet-700">VIP</span>}
    </>
  )
}

export function DatePill({ at, className, textClassName }: { at: string; className: string; textClassName: string }) {
  const date = new Date(at)
  const relative = timeAgoCard(date, new Date())
  const label = relative === "Just now" || relative === "Yesterday" || relative.includes("ago")
    ? relative
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  return <MetaPill className={className}><time dateTime={at} className={textClassName}>{label}</time></MetaPill>
}
