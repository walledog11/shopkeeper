"use client"

import { useEffect, useRef, useState } from "react"
import { BookOpen, Mail, RefreshCw, Trash2 } from "lucide-react"
import type { OAuthIntegrationDefinition } from "@/lib/integrations/catalog"
import { captureClientProductEvent } from "@/lib/product-events"
import type { Integration } from "@/types"
import { ActionRow } from "./ActionRow"
import { ConfigureSection } from "./ConfigureSection"
import { ConnectedAccountRow } from "./ConnectedAccountRow"
import { EmailForwardingSetupPanel } from "./EmailForwardingDisclosure"
import { GmailConnectedConfigureBody } from "./GmailConnectedConfigureBody"
import type { IntegrationCardModel } from "./integration-presentation"
import { IntegrationPermissionsSection } from "./IntegrationPermissionsSection"
import { ShopifyConnectBody } from "./connect-bodies/ShopifyConnectBody"
import { ShopifyStorefrontChatSection } from "./ShopifyStorefrontChatSection"
import { cn } from "@/lib/ui/cn"

export interface IntegrationCardCallbacks {
  connectForwardingEmail: (email: string) => Promise<boolean>
  updateEmailAddress: (integrationId: string, email: string) => Promise<boolean>
  disconnect: (integrationId: string) => Promise<boolean>
  setDefaultEmail: (integrationId: string) => Promise<void>
  launchOAuth: (
    definition: OAuthIntegrationDefinition,
    params: Record<string, string | undefined>,
    onClosed?: () => void,
    reauthorize?: Integration,
  ) => void
  syncShopifyKnowledgeBase: () => Promise<{ syncedPolicies: number; syncedPages: number }>
  updateShopifyStorefrontChat: (enabled: boolean) => Promise<boolean>
}

const DISCONNECT_NOTES: Record<"email" | "instagram" | "shopify" | "tiktok-shop", string> = {
  email: "Your past tickets stay. Forwarded email intake through this connection stops. Gmail is unaffected.",
  instagram: "Your past tickets stay. New Instagram DMs will stop arriving.",
  shopify: "Order lookups and syncing will stop. Your Shopify store itself isn't affected.",
  "tiktok-shop": "Your past tickets stay. New TikTok Shop buyer messages will stop arriving.",
}

function DeleteConnectionAction({
  canManageWorkspace,
  integration,
  note,
  onDisconnect,
}: {
  canManageWorkspace: boolean
  integration: Integration
  note: string
  onDisconnect: (integrationId: string) => Promise<boolean>
}) {
  const [confirming, setConfirming] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  return (
    <>
      <ActionRow
        icon={Trash2}
        label="Delete connection"
        destructive
        disabled={!canManageWorkspace || disconnecting}
        onClick={() => setConfirming(true)}
      />
      {confirming ? (
        <div className="flex items-center justify-between gap-3 bg-foreground/[0.02] px-4 py-3.5">
          <p className="text-xs leading-relaxed text-foreground/55">{note}</p>
          <button
            type="button"
            disabled={disconnecting}
            onClick={async () => {
              setDisconnecting(true)
              const accepted = await onDisconnect(integration.id)
              if (!accepted) setDisconnecting(false)
              setConfirming(false)
            }}
            className="shrink-0 whitespace-nowrap text-xs font-semibold text-red-600 transition-colors hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {disconnecting ? "Disconnecting…" : "Confirm"}
          </button>
        </div>
      ) : null}
    </>
  )
}

function useEmailValue(integration: Integration | null) {
  const [email, setEmail] = useState("")
  useEffect(() => {
    setEmail(integration?.fromEmail || integration?.externalAccountId || "")
  }, [integration?.externalAccountId, integration?.fromEmail, integration?.id])
  return [email, setEmail] as const
}

function useMountedRef() {
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  return mountedRef
}

function GmailDetails({ model, callbacks }: { model: IntegrationCardModel; callbacks: IntegrationCardCallbacks }) {
  const integration = model.selectedConnection
  const definition = model.definition
  const [email, setEmail] = useEmailValue(integration)
  const [loading, setLoading] = useState(false)
  const mountedRef = useMountedRef()
  if (!integration || !model.gmail || definition.kind !== "oauth" || definition.id !== "gmail") return null
  const gmailIntegration = integration
  const gmailDefinition = definition

  async function saveEmail() {
    if (!model.canManageWorkspace || !email.trim()) return
    setLoading(true)
    try {
      void captureClientProductEvent({ event: "integration_connection_started", platform: "email" })
      await callbacks.updateEmailAddress(gmailIntegration.id, email)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  const reauthorize = () => {
    if (!model.canManageWorkspace) return
    callbacks.launchOAuth(gmailDefinition, {}, undefined, gmailIntegration)
  }

  return (
    <GmailConnectedConfigureBody
      integration={integration}
      presentation={model.gmail}
      email={email}
      setEmail={setEmail}
      emailLoading={loading}
      onEmailSave={saveEmail}
      onReauthorize={reauthorize}
      onDisconnect={callbacks.disconnect}
      onSetDefaultEmail={callbacks.setDefaultEmail}
      canManageWorkspace={model.canManageWorkspace}
    />
  )
}

export function ForwardingEmailDetails({ model, callbacks }: { model: IntegrationCardModel; callbacks: IntegrationCardCallbacks }) {
  const integration = model.selectedConnection
  const [email, setEmail] = useEmailValue(integration)
  const [loading, setLoading] = useState(false)
  const mountedRef = useMountedRef()

  async function saveEmail() {
    if (!model.canManageWorkspace || !email.trim()) return
    setLoading(true)
    try {
      void captureClientProductEvent({ event: "integration_connection_started", platform: "email" })
      if (integration) {
        await callbacks.updateEmailAddress(integration.id, email)
      } else {
        const connected = await callbacks.connectForwardingEmail(email)
        if (connected && mountedRef.current) setEmail("")
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      {integration ? <ConnectedAccountRow connectType="email" integration={integration} /> : null}
      <ConfigureSection title="Setup">
        <EmailForwardingSetupPanel
          isConnected={Boolean(integration)}
          email={email}
          setEmail={setEmail}
          loading={loading}
          onSave={saveEmail}
          disabled={!model.canManageWorkspace}
        />
      </ConfigureSection>
      {integration ? (
        <ConfigureSection title="Actions">
          {!integration.isDefaultEmail ? (
            <ActionRow
              icon={Mail}
              label="Use for new emails"
              disabled={!model.canManageWorkspace}
              onClick={() => void callbacks.setDefaultEmail(integration.id)}
            />
          ) : null}
          <DeleteConnectionAction
            canManageWorkspace={model.canManageWorkspace}
            integration={integration}
            note={DISCONNECT_NOTES.email}
            onDisconnect={callbacks.disconnect}
          />
        </ConfigureSection>
      ) : null}
    </div>
  )
}

function ShopifyDetails({
  model,
  callbacks,
  shopifyClientId,
  storefrontChatGloballyEnabled,
}: {
  model: IntegrationCardModel
  callbacks: IntegrationCardCallbacks
  shopifyClientId: string | null
  storefrontChatGloballyEnabled: boolean
}) {
  const definition = model.definition
  const integration = model.selectedConnection
  const [shop, setShop] = useState("")
  const [loading, setLoading] = useState(false)
  const [kbSyncing, setKbSyncing] = useState(false)
  const [kbSyncResult, setKbSyncResult] = useState<string | null>(null)
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useMountedRef()

  useEffect(() => () => {
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current)
  }, [])

  if (definition.kind !== "oauth" || definition.id !== "shopify") return null
  const shopifyDefinition = definition

  function connect() {
    const domain = shop.trim()
    if (!domain || !model.canManageWorkspace) return
    setLoading(true)
    callbacks.launchOAuth(shopifyDefinition, { shop: domain }, () => {
      if (mountedRef.current) setLoading(false)
    })
  }

  function reauthorize() {
    if (!integration || !model.canManageWorkspace) return
    callbacks.launchOAuth(shopifyDefinition, { shop: integration.externalAccountId }, undefined, integration)
  }

  async function syncKnowledgeBase() {
    if (!model.canManageWorkspace) return
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current)
    setKbSyncing(true)
    setKbSyncResult(null)
    try {
      const result = await callbacks.syncShopifyKnowledgeBase()
      const total = result.syncedPolicies + result.syncedPages
      if (mountedRef.current) setKbSyncResult(`${total} note${total === 1 ? "" : "s"} synced to Memory`)
    } catch (error) {
      if (mountedRef.current) {
        setKbSyncResult(error instanceof Error ? error.message : "Sync failed, please try again")
      }
    } finally {
      if (mountedRef.current) {
        setKbSyncing(false)
        resultTimerRef.current = setTimeout(() => {
          if (mountedRef.current) setKbSyncResult(null)
        }, 4000)
      }
    }
  }

  if (!model.isConnected || !integration) {
    return (
      <ShopifyConnectBody
        isConnected={false}
        shop={shop}
        setShop={setShop}
        loading={loading}
        onConnect={connect}
        disabled={!model.canManageWorkspace}
      />
    )
  }

  return (
    <div className="space-y-5">
      <ConnectedAccountRow connectType="shopify" integration={integration} />
      <IntegrationPermissionsSection definition={definition} integration={integration} />
      <ShopifyStorefrontChatSection
        integration={integration}
        shopifyClientId={shopifyClientId}
        storefrontChatGloballyEnabled={storefrontChatGloballyEnabled}
        canManageWorkspace={model.canManageWorkspace}
        onUpdateEnabled={callbacks.updateShopifyStorefrontChat}
      />
      <ConfigureSection title="Actions">
        <ActionRow icon={RefreshCw} label="Reconnect account" onClick={reauthorize} disabled={!model.canManageWorkspace} />
        <ActionRow
          icon={BookOpen}
          label={kbSyncing ? "Syncing to KB…" : "Sync to KB"}
          onClick={() => void syncKnowledgeBase()}
          disabled={!model.canManageWorkspace || kbSyncing}
        />
        <DeleteConnectionAction
          canManageWorkspace={model.canManageWorkspace}
          integration={integration}
          note={DISCONNECT_NOTES.shopify}
          onDisconnect={callbacks.disconnect}
        />
      </ConfigureSection>
      {kbSyncResult ? (
        <p className={cn("px-1 text-xs", kbSyncResult.toLowerCase().includes("fail") ? "text-red-600" : "text-emerald-600")}>
          {kbSyncResult}
        </p>
      ) : null}
    </div>
  )
}

function DeclarativeOAuthDetails({ model, callbacks }: { model: IntegrationCardModel; callbacks: IntegrationCardCallbacks }) {
  const definition = model.definition
  const integration = model.selectedConnection
  if (definition.kind !== "oauth" || definition.details !== "oauth" || !integration) return null

  const reauthorize = () => {
    if (!model.canManageWorkspace) return
    callbacks.launchOAuth(definition, {}, undefined, integration)
  }

  return (
    <div className="space-y-5">
      <ConnectedAccountRow connectType={definition.connectType} integration={integration} />
      <IntegrationPermissionsSection definition={definition} integration={integration} />
      <ConfigureSection title="Actions">
        <ActionRow icon={RefreshCw} label="Reconnect account" onClick={reauthorize} disabled={!model.canManageWorkspace} />
        <DeleteConnectionAction
          canManageWorkspace={model.canManageWorkspace}
          integration={integration}
          note={definition.id === "instagram"
            ? DISCONNECT_NOTES.instagram
            : DISCONNECT_NOTES["tiktok-shop"]}
          onDisconnect={callbacks.disconnect}
        />
      </ConfigureSection>
    </div>
  )
}

export function IntegrationCardDetails({
  model,
  callbacks,
  shopifyClientId,
  storefrontChatGloballyEnabled,
}: {
  model: IntegrationCardModel
  callbacks: IntegrationCardCallbacks
  shopifyClientId: string | null
  storefrontChatGloballyEnabled: boolean
}) {
  switch (model.definition.details) {
    case "gmail":
      return <GmailDetails model={model} callbacks={callbacks} />
    case "forwarding-email":
      return <ForwardingEmailDetails model={model} callbacks={callbacks} />
    case "shopify":
      return (
        <ShopifyDetails
          model={model}
          callbacks={callbacks}
          shopifyClientId={shopifyClientId}
          storefrontChatGloballyEnabled={storefrontChatGloballyEnabled}
        />
      )
    case "oauth":
      return <DeclarativeOAuthDetails model={model} callbacks={callbacks} />
    case "device-binding":
    case "unavailable":
      return null
  }
}
