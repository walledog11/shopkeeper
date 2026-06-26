import Link from "next/link"
import type { ReactNode } from "react"
import { MessageCircle } from "lucide-react"
import { cn } from "@/lib/ui/cn"

export default function TelegramConnectBanner({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-blue-600/20 bg-blue-600/10 px-3 py-2 text-xs text-blue-700",
        className,
      )}
    >
      <MessageCircle className="mr-1.5 inline size-3.5 -mt-px" aria-hidden />
      {children}{" "}
      <Link
        href="/dashboard/integrations#telegram"
        className="font-semibold underline decoration-blue-700/30 underline-offset-2 hover:decoration-blue-700/60"
      >
        Connect Telegram
      </Link>
    </div>
  )
}
