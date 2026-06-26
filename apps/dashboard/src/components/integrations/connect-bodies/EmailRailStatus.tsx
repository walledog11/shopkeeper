"use client"

export function EmailRailStatus({ providerLabel }: { providerLabel: string }) {
  return (
    <div className="rounded-md border border-foreground/[0.06] bg-foreground/[0.015] px-3.5 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-emerald-400" />
        <span className="text-xs font-medium text-foreground/70">Sending</span>
        <span className="text-xs text-foreground/40">Connected via {providerLabel}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-amber-400" />
        <span className="text-xs font-medium text-foreground/70">Receiving</span>
        <span className="text-xs text-foreground/40">Forwarding required</span>
      </div>
      <p className="text-xs text-foreground/30 leading-relaxed">
        {providerLabel} sign-in lets Shopkeeper send replies. Until native inbox sync ships,
        forward your support inbox to the address below so incoming mail becomes tickets.
      </p>
    </div>
  )
}
