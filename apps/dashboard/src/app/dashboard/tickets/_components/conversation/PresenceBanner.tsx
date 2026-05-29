"use client"

import { Users } from "lucide-react"

interface Props {
  presenceCount: number
}

export default function PresenceBanner({ presenceCount }: Props) {
  if (presenceCount <= 0) {
    return null
  }

  return (
    <div className="px-5 py-2 border-b border-amber-400/20 bg-amber-400/[0.04] flex items-center gap-2 shrink-0">
      <Users className="size-3.5 text-amber-400 shrink-0" />
      <span className="text-xs text-amber-400 font-medium">
        {presenceCount === 1 ? "Another agent is" : `${presenceCount} other agents are`} viewing this ticket
      </span>
    </div>
  )
}
