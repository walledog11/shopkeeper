"use client"

import { cn } from "@/lib/ui/cn"
import { formatLastActivityTime } from "@/lib/format/date"
import type { PlatformConfig } from "@/lib/integrations/catalog"
import type { Integration } from "@/types"
import { ConnectedAccountRow } from "./ConnectedAccountRow"
import { IntegrationActionsSection, IntegrationPermissionsSection } from "./IntegrationConfigureSections"
import { IntegrationConfigureDialog } from "./IntegrationConfigureDialog"
import { InstagramConnectBody, ShopifyConnectBody } from "./connect-bodies"
import { isShopifyIntegrationLinked } from "@/lib/integrations/shopify-connection"
import { deriveIntegrationHealth } from "./integration-card-helpers"
import { IntegrationCardHeader } from "./IntegrationCardParts"
import {
  CARD_ACTIONS,
  CARD_BUTTON_AMBER,
  CARD_BUTTON_DISABLED,
  CARD_BUTTON_PRIMARY,
  CARD_BUTTON_SECONDARY,
  CARD_DESCRIPTION,
  CARD_SHELL,
} from "./integration-card-styles"
import { GmailConnectedConfigureBody } from "./GmailConnectedConfigureBody"
import { gmailConfigureStatusLine, deriveGmailConfigureScene } from "./gmail-configure-state"
import { useIntegrationCardActions } from "./useIntegrationCardActions"

interface Props {
  config: PlatformConfig
  connected: Integration[]
  onConnect: (platform: string, email: string) => Promise<boolean>
  onUpdateEmailAddress?: (integrationId: string, email: string) => Promise<boolean>
  onDisconnect: (integrationId: string) => void
  onSetDefaultEmail?: (integrationId: string) => void
  onLaunchOAuth?: (url: string, onClosed?: () => void) => void
  lastActivity?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  gmailNativeInboundEnabled?: boolean
}

export default function IntegrationCard({ config, connected, onConnect, onUpdateEmailAddress, onDisconnect, onSetDefaultEmail, onLaunchOAuth, lastActivity, open, onOpenChange, gmailNativeInboundEnabled = false }: Props) {
  const isConnected = config.connectType === "shopify"
    ? isShopifyIntegrationLinked(connected[0])
    : connected.length > 0
  const isOAuthEmail = config.emailProvider === "gmail"

  const health = config.connectType
    ? deriveIntegrationHealth(config.connectType, connected, lastActivity ?? null, gmailNativeInboundEnabled)
    : { state: 'not-connected' as const, note: null, canFix: false }

  const threadsThisWeek = isConnected ? connected[0].threadsThisWeek ?? 0 : 0
  const activityLabel = config.connectType === "shopify" ? "Last activity" : "Last message"
  const isGmail = config.emailProvider === "gmail"

  const dialogStatusLine = isConnected
    ? isGmail
      ? gmailConfigureStatusLine(
          deriveGmailConfigureScene(
            connected[0],
            lastActivity ?? null,
            gmailNativeInboundEnabled,
            health,
          ),
          connected[0],
          lastActivity ?? null,
          health,
        )
      : health.note ?? (
        config.connectType === "email"
          ? (lastActivity ? `Last message ${formatLastActivityTime(lastActivity)}` : "No messages received yet")
          : [
              lastActivity ? `${activityLabel} ${formatLastActivityTime(lastActivity)}` : null,
              ...(threadsThisWeek > 0
                ? [`${threadsThisWeek} conversation${threadsThisWeek === 1 ? "" : "s"} this week`]
                : []),
            ].filter(Boolean).join(" · ") || null
      )
    : config.description

  const {
    email,
    handleConnectClick,
    handleEmailConnect,
    handleGmailConnect,
    handleKbSync,
    handleReauthorize,
    handleShopifyConnect,
    kbSyncing,
    kbSyncResult,
    loading,
    setEmail,
    setShop,
    shop,
  } = useIntegrationCardActions({
    config,
    connected,
    onConnect,
    onUpdateEmailAddress,
    onLaunchOAuth,
    onOpenChange,
  })

  return (
    <>
      <div id={config.id} className={CARD_SHELL}>
        <IntegrationCardHeader config={config} />
        <p className={CARD_DESCRIPTION}>{config.description}</p>
        {isConnected && connected[0].isDefaultEmail && (
          <p className="text-xs font-medium text-emerald-400/90">Default for new emails</p>
        )}

        <div className={CARD_ACTIONS}>
          {config.comingSoon ? (
            <button type="button" disabled className={CARD_BUTTON_DISABLED}>Coming soon</button>
          ) : config.connectDisabled && !isConnected ? (
            <button type="button" disabled className={CARD_BUTTON_DISABLED}>Private beta</button>
          ) : !isConnected ? (
            isOAuthEmail ? (
              <button
                type="button"
                onClick={handleGmailConnect}
                disabled={loading}
                className={cn(CARD_BUTTON_PRIMARY, "w-full flex-1")}
              >
                Connect
              </button>
            ) : (
              <button type="button" onClick={handleConnectClick} className={CARD_BUTTON_PRIMARY}>Connect</button>
            )
          ) : (
            <>
              {health.canFix && (
                <button type="button" onClick={handleReauthorize} className={CARD_BUTTON_AMBER}>Fix</button>
              )}
              <button type="button" onClick={() => onOpenChange(true)} className={CARD_BUTTON_SECONDARY}>Configure</button>
            </>
          )}
        </div>
      </div>

      <IntegrationConfigureDialog
        open={open}
        onOpenChange={onOpenChange}
        config={config}
        statusState={isConnected ? health.state : undefined}
        statusLine={dialogStatusLine}
        statusNote={!!health.note}
        preventInitialFocus={isGmail && isConnected}
      >
        {isConnected && isGmail ? (
          <GmailConnectedConfigureBody
            integration={connected[0]}
            lastActivity={lastActivity ?? null}
            gmailNativeInboundEnabled={gmailNativeInboundEnabled}
            health={health}
            email={email}
            setEmail={setEmail}
            emailLoading={loading}
            onEmailSave={handleEmailConnect}
            onReauthorize={handleReauthorize}
            onDisconnect={onDisconnect}
            onSetDefaultEmail={onSetDefaultEmail}
          />
        ) : isConnected && config.connectType ? (
          <>
            <ConnectedAccountRow
              connectType={config.connectType}
              integration={connected[0]}
            />
            <IntegrationPermissionsSection
              config={config}
              connected={connected}
              gmailNativeInboundEnabled={gmailNativeInboundEnabled}
            />
            <IntegrationActionsSection
              config={config}
              connected={connected}
              kbSyncing={kbSyncing}
              kbSyncResult={kbSyncResult}
              onReauthorize={handleReauthorize}
              onKbSync={handleKbSync}
              onDisconnect={onDisconnect}
              onSetDefaultEmail={onSetDefaultEmail}
              email={config.connectType === "email" ? email : undefined}
              setEmail={config.connectType === "email" ? setEmail : undefined}
              emailLoading={config.connectType === "email" ? loading : undefined}
              onEmailSave={config.connectType === "email" ? handleEmailConnect : undefined}
              gmailNativeInboundEnabled={gmailNativeInboundEnabled}
            />
          </>
        ) : null}

        {!isConnected && config.emailProvider === "postmark" && (
          <>
            <IntegrationPermissionsSection
              config={config}
              connected={connected}
              gmailNativeInboundEnabled={gmailNativeInboundEnabled}
            />
            <IntegrationActionsSection
              config={config}
              connected={connected}
              kbSyncing={kbSyncing}
              kbSyncResult={kbSyncResult}
              onReauthorize={handleReauthorize}
              onKbSync={handleKbSync}
              onDisconnect={onDisconnect}
              email={email}
              setEmail={setEmail}
              emailLoading={loading}
              onEmailSave={handleEmailConnect}
            />
          </>
        )}

        {config.connectType === "shopify" && !isConnected && (
          <ShopifyConnectBody
            isConnected={isConnected}
            shop={shop}
            setShop={setShop}
            loading={loading}
            onConnect={handleShopifyConnect}
          />
        )}

        {config.connectType === "ig" && !isConnected && (
          <InstagramConnectBody isConnected={isConnected} />
        )}

      </IntegrationConfigureDialog>
    </>
  )
}
