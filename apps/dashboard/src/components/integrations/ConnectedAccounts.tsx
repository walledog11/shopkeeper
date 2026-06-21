"use client"

import { useState } from "react"
import { AlertTriangle } from "lucide-react"
import { getEmailProviderLabel } from "@shopkeeper/email/providers"
import type { ConnectType } from "@/lib/integrations/catalog"
import type { Integration } from "@/types"
import { CopyButton } from "./CopyButton"
import { IntegrationSettingsSection } from "./IntegrationSettingsSection"
import { isTokenExpired, isTokenExpiringSoon } from "./integration-card-helpers"

const DISCONNECT_NOTES: Record<ConnectType, string> = {
  email: "Your past tickets stay. New customer emails will stop arriving.",
  ig: "Your past tickets stay. New Instagram DMs will stop arriving.",
  shopify: "Order lookups and syncing will stop. Your Shopify store itself isn't affected.",
  imessage: "Your past tickets stay. New iMessages will stop arriving.",
}

export function ConnectedAccounts({
  connectType,
  connected,
  onDisconnect,
}: {
  connectType: ConnectType
  connected: Integration[]
  onDisconnect: (integrationId: string) => void
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  if (!connected.length) return null

  return (
    <IntegrationSettingsSection>
      {connected.map((integration) => (
        <div key={integration.id}>
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              {connectType === "ig" ? (
                <div className="flex items-center gap-1.5">
                  <p className="text-sm text-foreground/75 truncate">
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
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-sm text-foreground/75 truncate">{integration.externalAccountId}</p>
                  <CopyButton text={integration.externalAccountId} />
                  {connectType === "email" && (
                    <span className="inline-flex items-center text-[10px] font-semibold text-foreground/45 bg-foreground/[0.05] border border-foreground/[0.10] rounded px-1.5 py-0.5 shrink-0">
                      {getEmailProviderLabel(integration)}
                    </span>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setConfirmingId(confirmingId === integration.id ? null : integration.id)}
              className="text-sm font-medium text-foreground/40 hover:text-foreground/70 transition-colors whitespace-nowrap shrink-0"
            >
              {confirmingId === integration.id ? "Cancel" : "Disconnect"}
            </button>
          </div>
          {confirmingId === integration.id && (
            <div className="flex items-center justify-between gap-3 border-t border-foreground/[0.06] bg-foreground/[0.02] px-4 py-3">
              <p className="text-xs text-foreground/55 leading-relaxed">{DISCONNECT_NOTES[connectType]}</p>
              <button
                type="button"
                onClick={() => { setConfirmingId(null); onDisconnect(integration.id) }}
                className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors whitespace-nowrap shrink-0"
              >
                Confirm
              </button>
            </div>
          )}
        </div>
      ))}
    </IntegrationSettingsSection>
  )
}
