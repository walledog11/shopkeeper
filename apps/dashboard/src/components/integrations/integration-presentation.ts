import { formatLastActivityTime } from "@/lib/format/date"
import {
  INTEGRATION_DEFINITIONS,
  type IntegrationDefinition,
  type OAuthIntegrationDefinition,
  type WorkspaceIntegrationDefinition,
} from "@/lib/integrations/catalog"
import { isShopifyIntegrationLinked } from "@/lib/integrations/shopify-connection"
import { normalizeImessageLineHandle } from "@/lib/integrations/imessage-visibility"
import { normalizeTelegramBotUsername } from "@/lib/integrations/telegram-visibility"
import type { Integration } from "@/types"
import type { OAuthProvider } from "@/lib/integrations/oauth-contract"
import { deriveIntegrationHealth, type IntegrationHealth } from "./integration-card-helpers"
import { deriveGmailPresentation, type GmailPresentation } from "./gmail-configure-state"

export interface IntegrationDeploymentFlags {
  gmailNativeInboundEnabled: boolean
  instagramIntegrationEnabled: boolean
  tiktokShopConfigured: boolean
  telegramBotUsername: string | null
  imessageHandle: string | null
}

export type IntegrationAvailability =
  | { state: "available"; label: null }
  | { state: "private-beta"; label: "Private beta" }
  | { state: "coming-soon"; label: "Coming soon" }
  | { state: "not-configured"; label: "Connect" }

export interface IntegrationCardModel {
  definition: IntegrationDefinition
  availability: IntegrationAvailability
  visible: boolean
  connections: Integration[]
  selectedConnection: Integration | null
  isConnected: boolean
  health: IntegrationHealth
  status: IntegrationHealth["state"]
  note: string | null
  recoveryAction: {
    kind: "oauth"
    label: "Fix"
    definition: OAuthIntegrationDefinition
    params: Record<string, string>
    reauthorize: Integration
  } | null
  connectAction: {
    kind: "oauth"
    definition: OAuthIntegrationDefinition
  } | { kind: "open-details" } | null
  permissions: readonly string[]
  activityCopy: string | null
  canManageWorkspace: boolean
  gmail: GmailPresentation | null
  dialogStatusLine: string | null
  preventInitialFocus: boolean
}

export interface IntegrationAttentionSummary {
  count: number
  allActionable: boolean
  copy: string | null
}

function availabilityFor(
  definition: IntegrationDefinition,
  flags: IntegrationDeploymentFlags,
): IntegrationAvailability {
  if (definition.kind === "unavailable") {
    return { state: "coming-soon", label: definition.unavailableLabel }
  }
  if (definition.kind === "personal-device") {
    const configured = definition.device === "telegram"
      ? Boolean(normalizeTelegramBotUsername(flags.telegramBotUsername))
      : Boolean(normalizeImessageLineHandle(flags.imessageHandle))
    return configured
      ? { state: "available", label: null }
      : { state: "not-configured", label: "Connect" }
  }
  if (definition.kind === "oauth" && definition.availabilityFlag === "instagram" && !flags.instagramIntegrationEnabled) {
    return { state: "private-beta", label: "Private beta" }
  }
  if (definition.kind === "oauth" && definition.availabilityFlag === "tiktok-shop" && !flags.tiktokShopConfigured) {
    return { state: "coming-soon", label: "Coming soon" }
  }
  return { state: "available", label: null }
}

function descriptionFor(definition: IntegrationDefinition, availability: IntegrationAvailability): string {
  if (definition.id === "instagram" && availability.state === "private-beta") {
    return "Instagram DM connections are currently limited to the private beta."
  }
  if (definition.id === "tiktok-shop" && availability.state === "coming-soon") {
    return "Buyer messages from your TikTok Shop, answered in the same inbox. Not open yet — we will turn it on for you when it is."
  }
  return definition.description
}

export function selectPrimaryConnection(
  definition: WorkspaceIntegrationDefinition,
  integrations: Integration[],
): { connections: Integration[]; selectedConnection: Integration | null } {
  const connections = integrations
    .filter((integration) => definition.matches(integration))
    .sort((left, right) => {
      const created = left.createdAt.localeCompare(right.createdAt)
      return created || left.id.localeCompare(right.id)
    })
  return { connections, selectedConnection: connections[0] ?? null }
}

function activityCopyFor(
  definition: WorkspaceIntegrationDefinition,
  selectedConnection: Integration | null,
  health: IntegrationHealth,
): string | null {
  if (!selectedConnection) return definition.description
  if (health.note) return health.note

  const lastActivity = selectedConnection.lastActivity ?? null
  if (definition.id === "gmail" || definition.id === "email") {
    return lastActivity
      ? `Last message ${formatLastActivityTime(lastActivity)}`
      : "No messages received yet"
  }

  const parts = [lastActivity ? `Last activity ${formatLastActivityTime(lastActivity)}` : null]
  const threadsThisWeek = selectedConnection.threadsThisWeek ?? 0
  if (threadsThisWeek > 0) {
    parts.push(`${threadsThisWeek} conversation${threadsThisWeek === 1 ? "" : "s"} this week`)
  }
  return parts.filter(Boolean).join(" · ") || null
}

function disconnectedHealth(): IntegrationHealth {
  return { state: "not-connected", note: null, recoveryAction: null }
}

export function deriveIntegrationCardModels({
  integrations,
  flags,
  isAdmin,
  definitions = INTEGRATION_DEFINITIONS,
}: {
  integrations: Integration[]
  flags: IntegrationDeploymentFlags
  isAdmin: boolean
  definitions?: IntegrationDefinition[]
}): IntegrationCardModel[] {
  return definitions.map((originalDefinition) => {
    const availability = availabilityFor(originalDefinition, flags)
    const definition = descriptionFor(originalDefinition, availability) === originalDefinition.description
      ? originalDefinition
      : { ...originalDefinition, description: descriptionFor(originalDefinition, availability) }
    const visible = definition.kind !== "personal-device" || availability.state === "available"

    if (definition.kind === "personal-device" || definition.kind === "unavailable") {
      const health = disconnectedHealth()
      return {
        definition,
        availability,
        visible,
        connections: [],
        selectedConnection: null,
        isConnected: false,
        health,
        status: health.state,
        note: health.note,
        recoveryAction: null,
        connectAction: null,
        permissions: definition.permissions,
        activityCopy: definition.description,
        canManageWorkspace: definition.kind === "personal-device" || isAdmin,
        gmail: null,
        dialogStatusLine: definition.description,
        preventInitialFocus: false,
      }
    }

    const { connections, selectedConnection } = selectPrimaryConnection(definition, integrations)
    const isConnected = definition.connectType === "shopify"
      ? isShopifyIntegrationLinked(selectedConnection ?? undefined)
      : selectedConnection !== null
    const health = deriveIntegrationHealth(
      definition,
      selectedConnection,
      selectedConnection?.lastActivity ?? null,
      flags.gmailNativeInboundEnabled,
    )

    const gmail = definition.id === "gmail" && selectedConnection
      ? deriveGmailPresentation(
          selectedConnection,
          selectedConnection.lastActivity ?? null,
          flags.gmailNativeInboundEnabled,
          health,
        )
      : null
    const activityCopy = activityCopyFor(definition, selectedConnection, health)
    const recoveryParams: Record<string, string> = definition.details === "shopify" && selectedConnection
      ? { shop: selectedConnection.externalAccountId }
      : {}
    const recoveryAction = health.recoveryAction && definition.kind === "oauth" && selectedConnection
      ? {
          ...health.recoveryAction,
          definition,
          params: recoveryParams,
          reauthorize: selectedConnection,
        }
      : null
    const connectAction = definition.kind === "forwarding-email" || definition.details === "shopify"
      ? { kind: "open-details" as const }
      : { kind: "oauth" as const, definition }

    return {
      definition,
      availability,
      visible,
      connections,
      selectedConnection,
      isConnected,
      health,
      status: health.state,
      note: health.note,
      recoveryAction,
      connectAction,
      permissions: definition.permissions,
      activityCopy,
      canManageWorkspace: isAdmin,
      gmail,
      dialogStatusLine: gmail?.statusLine ?? activityCopy,
      preventInitialFocus: Boolean(gmail && selectedConnection),
    }
  })
}

export function integrationAttentionSummary(models: IntegrationCardModel[]): IntegrationAttentionSummary {
  const attention = models.filter((model) => model.status === "needs-attention")
  if (attention.length === 0) return { count: 0, allActionable: false, copy: null }

  const count = attention.length
  const subject = `${count} connection${count === 1 ? "" : "s"}`
  const verb = count === 1 ? "needs" : "need"
  const allActionable = attention.every((model) => model.recoveryAction && model.canManageWorkspace)
  return {
    count,
    allActionable,
    copy: allActionable
      ? `${subject} ${verb} attention — use the Fix button below.`
      : `${subject} ${verb} attention. Open the affected integration for details.`,
  }
}

export function oauthDefinitionForProvider(
  provider: OAuthProvider,
): OAuthIntegrationDefinition | null {
  const definition = INTEGRATION_DEFINITIONS.find(
    (candidate): candidate is OAuthIntegrationDefinition => candidate.kind === "oauth" && candidate.id === provider,
  )
  return definition ?? null
}
