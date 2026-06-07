"use client"

import { useState } from "react"
import useSWR from "swr"
import { ChevronDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fetcher } from "@/lib/api/fetcher"
import { cn } from "@/lib/ui/cn"
import { CopyButton } from "./CopyButton"

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

export function EmailForwardingDisclosure({
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
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState<ForwardingProviderId>("google")
  const { data: org } = useSWR<{ id: string; inboundEmailDomain: string }>(open ? "/api/org" : null, fetcher)
  const inboundAddress = org?.id && org.inboundEmailDomain ? `${org.id}@${org.inboundEmailDomain}` : null
  const guide = FORWARDING_GUIDES.find(g => g.id === provider) ?? FORWARDING_GUIDES[0]

  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.015]">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-left"
      >
        <span className="text-xs font-medium text-white/55">Use email forwarding (advanced)</span>
        <ChevronDown className={cn("size-3.5 text-white/30 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 space-y-3 border-t border-white/[0.05]">
          <div className="space-y-1.5 pt-3">
            <p className="text-xs font-semibold text-white/35 uppercase tracking-wider">Forward incoming mail to</p>
            <div className="flex items-center gap-2 rounded-md bg-black/30 border border-white/[0.07] px-3 py-2">
              {inboundAddress ? (
                <>
                  <p className="text-xs font-mono text-white/65 truncate flex-1">{inboundAddress}</p>
                  <CopyButton text={inboundAddress} />
                </>
              ) : (
                <p className="text-xs text-white/30">Loading…</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-white/35 uppercase tracking-wider">Set up forwarding</p>
            <div className="flex flex-wrap gap-1">
              {FORWARDING_GUIDES.map(g => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setProvider(g.id)}
                  className={cn(
                    "text-xs font-medium rounded-md px-2.5 py-1 border transition-colors",
                    provider === g.id
                      ? "bg-white/[0.08] border-white/[0.15] text-white/85"
                      : "bg-transparent border-white/[0.08] text-white/40 hover:text-white/65 hover:border-white/[0.12]",
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <ol className="text-xs text-white/40 space-y-1 list-decimal list-inside leading-relaxed pt-0.5">
              {guide.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-white/35 uppercase tracking-wider">Your support address</p>
            <div className="flex gap-2">
              <Input aria-label="support@yourstore.com"
                type="email"
                placeholder="support@yourstore.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onSave() }}
                className="h-9 text-sm"
              />
              <Button
                size="sm"
                disabled={!email || loading}
                onClick={onSave}
                className="shrink-0 h-9 px-4 font-medium"
              >
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : isConnected ? "Replace" : "Save"}
              </Button>
            </div>
            <p className="text-xs text-white/30 leading-relaxed">
              Replies go out under this address.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
