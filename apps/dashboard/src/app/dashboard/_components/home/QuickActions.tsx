import Link from "next/link"
import { useMemo } from "react"
import { Inbox, BarChart2, Cable, UserPlus, MessageSquareText, BookOpen } from "lucide-react"

interface Props {
  openCount: number
  oldestOpenThreadId: string | null
  channelConnected: boolean
  hasInvitedTeam: boolean
}

export default function QuickActions({ openCount, oldestOpenThreadId, channelConnected, hasInvitedTeam }: Props) {
  const actions = useMemo(() => {
    const list = []

    // Slot 1: direct path to work
    if (openCount > 0 && oldestOpenThreadId) {
      list.push({ href: `/dashboard/tickets?thread=${oldestOpenThreadId}`, icon: Inbox, label: "Oldest ticket" })
    } else {
      list.push({ href: "/dashboard/tickets", icon: Inbox, label: "All tickets" })
    }

    // Slot 2: analytics (always operational)
    list.push({ href: "/dashboard/analytics", icon: BarChart2, label: "Analytics" })

    // Slot 3: setup action if pending, else canned responses
    if (!channelConnected) {
      list.push({ href: "/dashboard/settings?tab=integrations", icon: Cable, label: "Connect channel" })
    } else {
      list.push({ href: "/dashboard/settings?tab=workspace", icon: MessageSquareText, label: "Canned responses" })
    }

    // Slot 4: team invite if pending, else knowledge base
    if (!hasInvitedTeam) {
      list.push({ href: "/dashboard/team", icon: UserPlus, label: "Invite teammate" })
    } else {
      list.push({ href: "/dashboard/kb", icon: BookOpen, label: "Knowledge base" })
    }

    return list
  }, [openCount, oldestOpenThreadId, channelConnected, hasInvitedTeam])

  return (
    <div className="grid grid-cols-2 @min-[520px]:grid-cols-4 gap-2 shrink-0">
      {actions.map(({ href, icon: Icon, label }) => (
        <Link
          key={href}
          href={href}
          className="group flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.11] transition-all"
        >
          <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-white/[0.06] transition-colors">
            <Icon className="w-3 h-3 shrink-0 text-white/40" />
          </div>
          <span className="text-xs font-medium text-white/45 group-hover:text-white/75 transition-colors truncate">{label}</span>
        </Link>
      ))}
    </div>
  )
}
