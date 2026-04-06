import Link from "next/link"
import { UserPlus, Cable, Bot, CreditCard } from "lucide-react"
import { Card } from "@/components/ui/card"

const actions = [
  { href: "/dashboard/team", icon: UserPlus, label: "Invite teammate" },
  { href: "/dashboard/integrations", icon: Cable, label: "Connect channel" },
  { href: "/dashboard/settings?tab=agent", icon: Bot, label: "Update AI persona" },
  { href: "/dashboard/settings?tab=billing", icon: CreditCard, label: "Manage billing" },
]

export default function QuickActions() {
  return (
    <Card className="shrink-0 bg-card border-border rounded-md overflow-hidden">
      {/* Mobile: 2x2 grid */}
      <div className="grid grid-cols-2 divide-x divide-y divide-white/[0.07] md:hidden">
        {actions.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white/40 hover:text-white/80 hover:bg-white/[0.05] transition-colors"
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{label}</span>
          </Link>
        ))}
      </div>
      {/* Desktop: horizontal bar */}
      <div className="hidden md:flex items-center">
        <div className="flex items-center px-5 py-2 shrink-0">
          <span className="text-[11px] font-semibold tracking-widest text-white/25 uppercase">Quick Actions:</span>
        </div>
        {actions.map(({ href, icon: Icon, label }) => (
          <div key={href} className="flex items-center flex-1">
            <div className="w-px h-5 bg-white/[0.08] shrink-0" />
            <Link
              href={href}
              className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium text-white/40 hover:text-white/80 hover:bg-white/[0.05] transition-colors"
            >
              <Icon className="w-4 h-4 shrink-0" /> {label}
            </Link>
          </div>
        ))}
      </div>
    </Card>
  )
}
