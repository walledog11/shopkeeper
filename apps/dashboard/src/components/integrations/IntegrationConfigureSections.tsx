"use client"

import { useState } from "react"
import {
  BookOpen,
  Check,
  Mail,
  RefreshCw,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/ui/cn"
import type { ConnectType, PlatformConfig } from "@/lib/integrations/catalog"
import type { Integration } from "@/types"
import { ActionRow } from "./ActionRow"
import { ConfigureSection } from "./ConfigureSection"
import { PermissionActionLink, PermissionRow } from "./PermissionRow"
import { ShopifyPermissionRows } from "./ShopifyPermissionsPanel"

const DISCONNECT_NOTES: Record<ConnectType, string> = {
  email: "Your past conversations stay. New customer emails will stop arriving.",
  ig: "Your past conversations stay. New Instagram DMs will stop arriving.",
  shopify: "Order lookups and syncing will stop. Your Shopify store itself isn't affected.",
}

export function IntegrationPermissionsSection({
  config,
  connected,
  isOAuthEmail,
}: {
  config: PlatformConfig
  connected: Integration[]
  isOAuthEmail: boolean
}) {
  const integration = connected[0]
  const connectType = config.connectType!

  return (
    <ConfigureSection title="Permissions">
      {connectType === "shopify" ? (
        <ShopifyPermissionRows />
      ) : (
        <>
          {config.permissions?.map((permission) => (
            <PermissionRow
              key={permission}
              icon={Check}
              title={permission}
              action={<PermissionActionLink>Connected</PermissionActionLink>}
            />
          ))}
          {isOAuthEmail && integration && (
            <PermissionRow
              icon={Mail}
              title="Receiving"
              description="Forward your support inbox to receive tickets"
              action={<PermissionActionLink>Connect</PermissionActionLink>}
            />
          )}
        </>
      )}
    </ConfigureSection>
  )
}

export function IntegrationActionsSection({
  config,
  connected,
  kbSyncing,
  kbSyncResult,
  onReauthorize,
  onKbSync,
  onDisconnect,
}: {
  config: PlatformConfig
  connected: Integration[]
  kbSyncing: boolean
  kbSyncResult: string | null
  onReauthorize: () => void
  onKbSync: () => void
  onDisconnect: (integrationId: string) => void
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const connectType = config.connectType!
  const integration = connected[0]

  return (
    <div className="space-y-2">
      <ConfigureSection title="Actions">
        <ActionRow icon={RefreshCw} label="Reconnect account" onClick={onReauthorize} />
        {config.connectType === "shopify" && (
          <ActionRow
            icon={BookOpen}
            label={kbSyncing ? "Syncing to KB…" : "Sync to KB"}
            onClick={onKbSync}
            disabled={kbSyncing}
          />
        )}
        <ActionRow
          icon={Trash2}
          label="Delete connection"
          destructive
          onClick={() => setConfirmingId(integration.id)}
        />
        {confirmingId === integration.id && (
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 bg-white/[0.02]">
            <p className="text-xs text-white/55 leading-relaxed">{DISCONNECT_NOTES[connectType]}</p>
            <button
              type="button"
              onClick={() => {
                setConfirmingId(null)
                onDisconnect(integration.id)
              }}
              className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors whitespace-nowrap shrink-0"
            >
              Confirm
            </button>
          </div>
        )}
      </ConfigureSection>
      {kbSyncResult && (
        <p className={cn(
          "text-xs px-1",
          kbSyncResult.startsWith("Sync failed") ? "text-red-400" : "text-emerald-400",
        )}>
          {kbSyncResult}
        </p>
      )}
    </div>
  )
}
