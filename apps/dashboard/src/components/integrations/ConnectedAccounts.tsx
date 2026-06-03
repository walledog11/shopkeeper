"use client"

import { AlertTriangle } from "lucide-react"
import { getEmailProviderLabel } from "@/lib/messaging/email/providers"
import type { ConnectType } from "@/lib/integrations/catalog"
import type { Integration } from "@/types"
import { CopyButton } from "./CopyButton"
import { isTokenExpired, isTokenExpiringSoon } from "./integration-card-helpers"

export function ConnectedAccounts({
  connectType,
  connected,
  onDisconnect,
}: {
  connectType: ConnectType
  connected: Integration[]
  onDisconnect: (integrationId: string) => void
}) {
  if (!connected.length) return null

  return (
    <div className="rounded-md overflow-hidden border border-white/[0.07] divide-y divide-white/[0.05]">
      {connected.map((integration) => (
        <div key={integration.id} className="flex items-center gap-2.5 px-3.5 py-2.5 bg-white/[0.02]">
          <div className="flex-1 min-w-0">
            {connectType === "ig" ? (
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-medium text-white/55 truncate">
                  {integration.fromEmail || integration.externalAccountId}
                </p>
                {isTokenExpired(integration) ? (
                  <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-400 bg-red-400/[0.08] border border-red-400/[0.15] rounded-full px-1.5 py-0.5 shrink-0">
                    <AlertTriangle className="size-2.5" /> Expired
                  </span>
                ) : isTokenExpiringSoon(integration) ? (
                  <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-400 bg-amber-400/[0.08] border border-amber-400/[0.15] rounded-full px-1.5 py-0.5 shrink-0">
                    <AlertTriangle className="size-2.5" /> Expiring
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-xs font-mono text-white/50 truncate">{integration.externalAccountId}</p>
                <CopyButton text={integration.externalAccountId} />
                {connectType === "email" && (
                  <span className="inline-flex items-center text-xs font-semibold text-white/45 bg-white/[0.05] border border-white/[0.10] rounded px-1.5 py-0.5 shrink-0">
                    {getEmailProviderLabel(integration)}
                  </span>
                )}
              </div>
            )}
          </div>
          <button type="button"
            onClick={() => onDisconnect(integration.id)}
            className="text-xs font-medium text-white/25 hover:text-red-400 transition-colors whitespace-nowrap shrink-0"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  )
}
