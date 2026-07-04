"use client"

import { useState } from "react"
import { getEmailAuthReauthorizationReason } from "@shopkeeper/email/providers"
import {
  BookOpen,
  Check,
  Forward,
  Mail,
  RefreshCw,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/ui/cn"
import { useOrg } from "@/hooks/useOrg"
import type { ConnectType, PlatformConfig } from "@/lib/integrations/catalog"
import type { Integration } from "@/types"
import { ActionRow } from "./ActionRow"
import { ConfigureSection } from "./ConfigureSection"
import { EmailForwardingSetupPanel } from "./EmailForwardingDisclosure"
import { GmailSupportAddressPanel } from "./GmailSupportAddressPanel"
import { PermissionActionLink, PermissionRow } from "./PermissionRow"
import { ShopifyPermissionRows } from "./ShopifyPermissionsPanel"
import { getEmailReceivingDisplay } from "./integration-card-helpers"

const DISCONNECT_NOTES: Record<ConnectType, string> = {
  email: "Your past tickets stay. New customer emails will stop arriving.",
  ig: "Your past tickets stay. New Instagram DMs will stop arriving.",
  shopify: "Order lookups and syncing will stop. Your Shopify store itself isn't affected.",
  imessage: "Your past tickets stay. New iMessages will stop arriving.",
}

export function IntegrationPermissionsSection({
  config,
  connected,
  gmailNativeInboundEnabled = false,
}: {
  config: PlatformConfig
  connected: Integration[]
  gmailNativeInboundEnabled?: boolean
}) {
  const integration = connected[0]
  const connectType = config.connectType!
  const isEmail = connectType === "email"
  const isPostmark = config.emailProvider === "postmark"
  const { data: org } = useOrg({ enabled: isEmail })
  const inboundAddress = org?.id && org.inboundEmailDomain ? `${org.id}@${org.inboundEmailDomain}` : null
  const emailReceiving = isEmail && integration
    ? getEmailReceivingDisplay(integration, inboundAddress, gmailNativeInboundEnabled)
    : null
  const gmailReadScopeMissing = config.emailProvider === "gmail"
    && integration
    && getEmailAuthReauthorizationReason(integration) === "missing_gmail_read_scope"

  if (connectType === "shopify") {
    return (
      <ConfigureSection title="Permissions">
        <ShopifyPermissionRows />
      </ConfigureSection>
    )
  }

  const rows = [
    ...(config.permissions?.map((permission) => (
      <PermissionRow
        key={permission}
        icon={Check}
        title={permission}
        action={
          <PermissionActionLink>
            {gmailReadScopeMissing && permission === "Read messages sent to your support inbox"
              ? "Not granted"
              : "Connected"}
          </PermissionActionLink>
        }
      />
    )) ?? []),
    ...(isEmail && (integration || isPostmark) ? [
      <PermissionRow
        key="receiving"
        icon={Mail}
        title="Receiving"
        description={
          emailReceiving?.description
            ?? (inboundAddress
              ? `Forward mail to ${inboundAddress}`
              : "Forward your support inbox to receive tickets")
        }
        action={
          <PermissionActionLink>
            {emailReceiving?.action ?? (integration || isPostmark ? "Connected" : "Connect")}
          </PermissionActionLink>
        }
      />,
    ] : []),
  ]

  if (rows.length === 0) return null

  return (
    <ConfigureSection title="Permissions">
      {rows}
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
  email,
  setEmail,
  emailLoading,
  onEmailSave,
  defaultForwardingOpen = false,
  gmailNativeInboundEnabled = false,
}: {
  config: PlatformConfig
  connected: Integration[]
  kbSyncing: boolean
  kbSyncResult: string | null
  onReauthorize: () => void
  onKbSync: () => void
  onDisconnect: (integrationId: string) => void
  email?: string
  setEmail?: (v: string) => void
  emailLoading?: boolean
  onEmailSave?: () => void
  defaultForwardingOpen?: boolean
  gmailNativeInboundEnabled?: boolean
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [forwardingOpen, setForwardingOpen] = useState(defaultForwardingOpen)
  const connectType = config.connectType!
  const integration = connected[0]
  const isEmail = connectType === "email"
  const isPostmark = config.emailProvider === "postmark"
  const isGmail = config.emailProvider === "gmail"
  // iMessage has no OAuth reconnect — changing creds means re-entering them via
  // the connect form, so don't show a dead "Reconnect account" action.
  const showReconnect = !(isEmail && isPostmark) && connectType !== "imessage"
  const showForwardingSetup = isEmail && email !== undefined && setEmail && onEmailSave

  return (
    <div className="space-y-2">
      {isGmail && integration && showForwardingSetup && (
        <ConfigureSection title="Support address">
          <GmailSupportAddressPanel
            email={email}
            setEmail={setEmail}
            loading={emailLoading ?? false}
            onSave={onEmailSave}
          />
        </ConfigureSection>
      )}
      <ConfigureSection title="Actions">
        {showForwardingSetup && (
          <>
            <ActionRow
              icon={Forward}
              label="Set up forwarding"
              onClick={() => setForwardingOpen(open => !open)}
            />
            {forwardingOpen && (
              <EmailForwardingSetupPanel
                isConnected={connected.length > 0}
                email={email}
                setEmail={setEmail}
                loading={emailLoading ?? false}
                onSave={onEmailSave}
                showAddressEditor={!isGmail}
              />
            )}
          </>
        )}
        {showReconnect && (
          <ActionRow icon={RefreshCw} label="Reconnect account" onClick={onReauthorize} />
        )}
        {config.connectType === "shopify" && (
          <ActionRow
            icon={BookOpen}
            label={kbSyncing ? "Syncing to KB…" : "Sync to KB"}
            onClick={onKbSync}
            disabled={kbSyncing}
          />
        )}
        {integration && (
          <>
            <ActionRow
              icon={Trash2}
              label="Delete connection"
              destructive
              onClick={() => setConfirmingId(integration.id)}
            />
            {confirmingId === integration.id && (
              <div className="flex items-center justify-between gap-3 px-4 py-3.5 bg-foreground/[0.02]">
                <p className="text-xs text-foreground/55 leading-relaxed">{DISCONNECT_NOTES[connectType]}</p>
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
          </>
        )}
      </ConfigureSection>
      {isGmail && integration && !gmailNativeInboundEnabled && (
        <p className="px-1 text-xs leading-relaxed text-foreground/45">
          Native Gmail receiving is in controlled rollout. Keep forwarding enabled
          until it is activated for this environment.
        </p>
      )}
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
