"use client"

import { Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useOrg } from "@/hooks/useOrg"
import { CopyButton } from "./CopyButton"
import { PermissionActionLink } from "./PermissionRow"

export function EmailForwardingSetupPanel({
  isConnected,
  email,
  setEmail,
  loading,
  onSave,
}: {
  isConnected: boolean
  email: string
  setEmail: (v: string) => void
  loading: boolean
  onSave: () => void
}) {
  const { data: org } = useOrg({ enabled: true })
  const inboundAddress = org?.id && org.inboundEmailDomain ? `${org.id}@${org.inboundEmailDomain}` : null

  return (
    <div className="space-y-4 px-4 py-4 sm:px-5">
      <div className="space-y-2">
        <p className="text-[13px] font-semibold text-foreground/80">Forwarding address</p>
        <p className="text-xs leading-relaxed text-foreground/50">
          Forward your support inbox to this address in your email provider.
        </p>
        <div className="flex min-w-0 items-center gap-2 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] px-3 py-2.5">
          {inboundAddress ? (
            <>
              <p className="min-w-0 flex-1 truncate font-mono text-sm text-foreground/75">{inboundAddress}</p>
              <CopyButton text={inboundAddress} />
            </>
          ) : (
            <p className="text-sm text-foreground/35">Loading…</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[13px] font-semibold text-foreground/80">Support address</p>
        <p className="text-xs leading-relaxed text-foreground/50">
          The address customers email, like support@yourstore.com.
        </p>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Input
            aria-label="support@yourstore.com"
            type="email"
            placeholder="support@yourstore.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSave() }}
            className="h-10 min-w-0 flex-1 border-foreground/[0.10] bg-foreground/[0.03] text-sm text-white placeholder:text-foreground/30"
          />
          <div className="flex shrink-0 items-center gap-1.5">
            {loading && <Loader2 className="size-3.5 animate-spin text-foreground/50" />}
            <PermissionActionLink onClick={onSave} disabled={!email || loading}>
              {isConnected ? "Update" : "Save"}
            </PermissionActionLink>
          </div>
        </div>
      </div>
    </div>
  )
}
