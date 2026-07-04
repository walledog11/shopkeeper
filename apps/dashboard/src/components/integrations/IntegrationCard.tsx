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
import { captureClientProductEvent } from "@/lib/product-events"
import { CardLogo } from "./IntegrationCardParts"
import {
  CARD_BUTTON_AMBER,
  CARD_BUTTON_DISABLED,
  CARD_BUTTON_PRIMARY,
  CARD_BUTTON_SECONDARY,
  CARD_DESCRIPTION,
  CARD_SHELL,
  CARD_TITLE,
} from "./integration-card-styles"
import { useIntegrationCardActions } from "./useIntegrationCardActions"

interface Props {
  config: PlatformConfig
  connected: Integration[]
  onConnect: (platform: string, email: string) => Promise<boolean>
  onUpdateEmailAddress?: (integrationId: string, email: string) => Promise<boolean>
  onDisconnect: (integrationId: string) => void
  onLaunchOAuth?: (url: string, onClosed?: () => void) => void
  lastActivity?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  gmailNativeInboundEnabled?: boolean
}

export default function IntegrationCard({ config, connected, onConnect, onUpdateEmailAddress, onDisconnect, onLaunchOAuth, lastActivity, open, onOpenChange, gmailNativeInboundEnabled = false }: Props) {
  const isConnected = config.connectType === "shopify"
    ? isShopifyIntegrationLinked(connected[0])
    : connected.length > 0
  const isOAuthEmail = config.emailProvider === "gmail" || config.emailProvider === "outlook"

  const health = config.connectType
    ? deriveIntegrationHealth(config.connectType, connected, lastActivity ?? null, gmailNativeInboundEnabled)
    : { state: 'not-connected' as const, note: null, canFix: false }

  const threadsThisWeek = isConnected ? connected[0].threadsThisWeek ?? 0 : 0
  const activityLabel = config.connectType === "shopify" ? "Last activity" : "Last message"
  const dialogStatusLine = isConnected
    ? health.note ?? (
        config.connectType === "email"
          ? null
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
        <CardLogo config={config} />

        <p className={cn("mt-4", CARD_TITLE)}>{config.name}</p>
        <p className={cn("mt-2 flex-1", CARD_DESCRIPTION)}>{config.description}</p>

        <div className="mt-4 flex gap-2">
          {config.comingSoon ? (
            <button type="button" disabled className={CARD_BUTTON_DISABLED}>Coming soon</button>
          ) : !isConnected ? (
            isOAuthEmail ? (
              <form
                action={`/api/integrations/${config.emailProvider}/auth`}
                method="post"
                className="flex-1 flex"
                onSubmit={() => {
                  void captureClientProductEvent({
                    event: "integration_connection_started",
                    platform: "email",
                  })
                }}
              >
                <button type="submit" className={cn(CARD_BUTTON_PRIMARY, "w-full")}>Connect</button>
              </form>
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
      >
        {isConnected && config.connectType && (
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
              email={config.connectType === "email" ? email : undefined}
              setEmail={config.connectType === "email" ? setEmail : undefined}
              emailLoading={config.connectType === "email" ? loading : undefined}
              onEmailSave={config.connectType === "email" ? handleEmailConnect : undefined}
              gmailNativeInboundEnabled={gmailNativeInboundEnabled}
            />
          </>
        )}

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
              defaultForwardingOpen
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
