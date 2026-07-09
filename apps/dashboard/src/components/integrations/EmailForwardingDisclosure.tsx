"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useOrg } from "@/hooks/useOrg"
import { cn } from "@/lib/ui/cn"
import { CopyButton } from "./CopyButton"
import { PermissionActionLink } from "./PermissionRow"

const FORWARDING_GUIDES = [
  {
    id: "google",
    label: "Google Workspace",
    steps: [
      "Gmail → Settings (gear) → See all settings → Forwarding and POP/IMAP.",
      "Click \"Add a forwarding address\" and paste the address above.",
      "Gmail sends a verification code to that address — it will appear as a new ticket in Shopkeeper. Paste the code back into Gmail.",
      "Select \"Forward a copy of incoming mail to…\" and choose to keep Gmail's copy in the inbox.",
    ],
  },
  {
    id: "cpanel",
    label: "cPanel",
    steps: [
      "cPanel → Email → Forwarders → Add Forwarder.",
      "Address to Forward: your support address (e.g. support@yourstore.com).",
      "Destination: Forward to email address — paste the address above.",
      "Add Forwarder.",
    ],
  },
  {
    id: "cloudflare",
    label: "Cloudflare",
    steps: [
      "Cloudflare Dashboard → your domain → Email → Email Routing → Destination addresses.",
      "Add the address above as a destination. Cloudflare sends a verification email — it will appear as a new ticket in Shopkeeper. Click the link inside.",
      "Routes → create a custom address (e.g. support@yourdomain.com) routed to that destination.",
      "Save.",
    ],
  },
] as const

type ForwardingProviderId = typeof FORWARDING_GUIDES[number]["id"]

export function EmailForwardingSetupPanel({
  isConnected,
  email,
  setEmail,
  loading,
  onSave,
  showAddressEditor = true,
}: {
  isConnected: boolean
  email: string
  setEmail: (v: string) => void
  loading: boolean
  onSave: () => void
  showAddressEditor?: boolean
}) {
  const [provider, setProvider] = useState<ForwardingProviderId>("google")
  const { data: org } = useOrg({ enabled: true })
  const inboundAddress = org?.id && org.inboundEmailDomain ? `${org.id}@${org.inboundEmailDomain}` : null
  const guide = FORWARDING_GUIDES.find(g => g.id === provider) ?? FORWARDING_GUIDES[0]

  return (
    <div className="space-y-5 bg-foreground/[0.02] px-4 py-4 sm:px-5 sm:py-5">
      {showAddressEditor && <div className="space-y-2">
        <div>
          <p className="text-[13px] font-semibold text-foreground/80">Your private forwarding address</p>
          <p className="mt-0.5 text-[12.5px] text-foreground/50">Copy this into your email provider&apos;s forwarding settings.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] px-3 py-2.5">
          {inboundAddress ? (
            <>
              <p className="text-sm font-mono text-foreground/75 truncate flex-1">{inboundAddress}</p>
              <CopyButton text={inboundAddress} />
            </>
          ) : (
            <p className="text-sm text-foreground/35">Loading…</p>
          )}
        </div>
      </div>}

      <div className="space-y-2">
        <p className="text-[13px] font-semibold text-foreground/80">Set up forwarding with</p>
        <div className="flex flex-wrap gap-1.5">
          {FORWARDING_GUIDES.map(g => (
            <button
              key={g.id}
              type="button"
              onClick={() => setProvider(g.id)}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                provider === g.id
                  ? "bg-foreground/[0.08] border-foreground/[0.15] text-foreground/85"
                  : "bg-transparent border-foreground/[0.08] text-foreground/40 hover:text-foreground/65 hover:border-foreground/[0.12]",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
        <ol className="list-inside list-decimal space-y-1.5 text-[13px] leading-relaxed text-foreground/55">
          {guide.steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </div>

      <div className="space-y-2">
        <div>
          <p className="text-[13px] font-semibold text-foreground/80">Address your customers use</p>
          <p className="mt-0.5 text-[12.5px] text-foreground/50">For example, support@yourstore.com.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Input
            aria-label="support@yourstore.com"
            type="email"
            placeholder="support@yourstore.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSave() }}
            className="h-10 flex-1 border-foreground/[0.10] bg-foreground/[0.03] text-sm text-white placeholder:text-foreground/30"
          />
          <div className="flex shrink-0 items-center gap-1.5">
            {loading && <Loader2 className="size-3.5 animate-spin text-foreground/50" />}
            <PermissionActionLink onClick={onSave} disabled={!email || loading}>
              {isConnected ? "Update inbox" : "Save inbox"}
            </PermissionActionLink>
          </div>
        </div>
        <p className="text-[12.5px] leading-relaxed text-foreground/45">
          Customer replies are sent from this address.
        </p>
      </div>
    </div>
  )
}
