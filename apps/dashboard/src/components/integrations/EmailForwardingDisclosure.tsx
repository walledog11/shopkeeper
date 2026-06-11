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
      "Gmail sends a verification code to that address , it will appear as a new ticket in Shopkeeper. Paste the code back into Gmail.",
      "Select \"Forward a copy of incoming mail to…\" and choose to keep Gmail's copy in the inbox.",
    ],
  },
  {
    id: "outlook",
    label: "Outlook 365",
    steps: [
      "Outlook on the web → Settings → Mail → Forwarding.",
      "Enable forwarding and paste the address above.",
      "Tick \"Keep a copy of forwarded messages\" so your archive stays intact.",
      "Save.",
    ],
  },
  {
    id: "cpanel",
    label: "cPanel",
    steps: [
      "cPanel → Email → Forwarders → Add Forwarder.",
      "Address to Forward: your support address (e.g. support@yourstore.com).",
      "Destination: Forward to email address , paste the address above.",
      "Add Forwarder.",
    ],
  },
  {
    id: "cloudflare",
    label: "Cloudflare",
    steps: [
      "Cloudflare Dashboard → your domain → Email → Email Routing → Destination addresses.",
      "Add the address above as a destination. Cloudflare sends a verification email , it will appear as a new ticket in Shopkeeper. Click the link inside.",
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
}: {
  isConnected: boolean
  email: string
  setEmail: (v: string) => void
  loading: boolean
  onSave: () => void
}) {
  const [provider, setProvider] = useState<ForwardingProviderId>("google")
  const { data: org } = useOrg({ enabled: true })
  const inboundAddress = org?.id && org.inboundEmailDomain ? `${org.id}@${org.inboundEmailDomain}` : null
  const guide = FORWARDING_GUIDES.find(g => g.id === provider) ?? FORWARDING_GUIDES[0]

  return (
    <div className="px-4 py-3.5 bg-white/[0.02] space-y-3">
      <div className="space-y-2">
        <p className="text-xs text-white/40">Forward incoming mail to</p>
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
          {inboundAddress ? (
            <>
              <p className="text-sm font-mono text-white/75 truncate flex-1">{inboundAddress}</p>
              <CopyButton text={inboundAddress} />
            </>
          ) : (
            <p className="text-sm text-white/35">Loading…</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-white/40">Set up forwarding</p>
        <div className="flex flex-wrap gap-1.5">
          {FORWARDING_GUIDES.map(g => (
            <button
              key={g.id}
              type="button"
              onClick={() => setProvider(g.id)}
              className={cn(
                "text-xs font-medium rounded-lg px-2.5 py-1.5 border transition-colors",
                provider === g.id
                  ? "bg-white/[0.08] border-white/[0.15] text-white/85"
                  : "bg-transparent border-white/[0.08] text-white/40 hover:text-white/65 hover:border-white/[0.12]",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
        <ol className="text-xs text-white/40 space-y-1 list-decimal list-inside leading-relaxed">
          {guide.steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-white/40">Your support address</p>
        <div className="flex items-center gap-3">
          <Input
            aria-label="support@yourstore.com"
            type="email"
            placeholder="support@yourstore.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSave() }}
            className="h-10 flex-1 border-white/[0.10] bg-white/[0.03] text-sm text-white placeholder:text-white/30"
          />
          <div className="shrink-0 flex items-center gap-1.5">
            {loading && <Loader2 className="size-3.5 animate-spin text-white/50" />}
            <PermissionActionLink onClick={onSave} disabled={!email || loading}>
              {isConnected ? "Replace" : "Save"}
            </PermissionActionLink>
          </div>
        </div>
        <p className="text-xs text-white/35 leading-relaxed">
          Replies go out under this address.
        </p>
      </div>
    </div>
  )
}
