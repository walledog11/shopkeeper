"use client"

import { Check } from "lucide-react"

export function NeedsYouAllClear({ agentName }: { agentName: string }) {
  return (
    <section className="flex flex-col items-center gap-3 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-full border border-border bg-foreground/[0.04]">
        <Check aria-hidden className="size-5 text-foreground/40" />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">You&apos;re all caught up</h2>
        <p className="text-sm text-foreground/50">{agentName} will surface anything that needs your eye here.</p>
      </div>
    </section>
  )
}
