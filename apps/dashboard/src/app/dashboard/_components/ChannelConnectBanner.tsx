import Link from "next/link"
import type { ComponentType, ReactNode } from "react"
import { MessageCircle } from "lucide-react"
import { cn } from "@/lib/ui/cn"

export default function ChannelConnectBanner({
  children,
  className,
  href = "/dashboard/integrations#imessage",
  actionLabel = "Connect iMessage",
  icon: Icon = MessageCircle,
}: {
  children: ReactNode
  className?: string
  href?: string
  actionLabel?: string
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-blue-600/20 bg-blue-600/10 px-3 py-2 text-xs text-blue-700",
        className,
      )}
    >
      <Icon className="mr-1.5 inline size-3.5 -mt-px" aria-hidden />
      {children}{" "}
      <Link
        href={href}
        className="font-semibold underline decoration-blue-700/30 underline-offset-2 hover:decoration-blue-700/60"
      >
        {actionLabel}
      </Link>
    </div>
  )
}
