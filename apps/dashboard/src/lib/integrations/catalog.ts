import { getEmailProvider, getEmailReauthorizePath } from "@shopkeeper/email/providers"
import type { Integration } from "@/types"

export type IntegrationChannelKind = "operator" | "support"
export type WorkspaceConnectType = "email" | "ig" | "shopify" | "tiktok_shop"
export type PersonalDeviceType = "imessage" | "telegram"
export type IntegrationId =
  | "email"
  | "gmail"
  | "imessage"
  | "instagram"
  | "shopify"
  | "telegram"
  | "tiktok-shop"
  | "whatsapp"

interface IntegrationDefinitionBase {
  id: IntegrationId
  name: string
  logo: string | null
  description: string
  channelKind: IntegrationChannelKind
  permissions: readonly string[]
}

export interface OAuthIntegrationDefinition extends IntegrationDefinitionBase {
  kind: "oauth"
  id: "gmail" | "instagram" | "shopify" | "tiktok-shop"
  platform: Integration["platform"]
  connectType: WorkspaceConnectType
  details: "gmail" | "shopify" | "oauth"
  oauth: {
    authPath: string
    analyticsPlatform: "email" | "ig_dm" | "shopify" | "tiktok"
    successCopy: string
    reauthorizePath?: (integration: Integration) => string | null
  }
  availabilityFlag?: "instagram" | "tiktok-shop"
  matches: (integration: Integration) => boolean
}

export interface ForwardingEmailIntegrationDefinition extends IntegrationDefinitionBase {
  kind: "forwarding-email"
  id: "email"
  platform: "email"
  connectType: "email"
  details: "forwarding-email"
  analyticsPlatform: "email"
  matches: (integration: Integration) => boolean
}

export interface PersonalDeviceIntegrationDefinition extends IntegrationDefinitionBase {
  kind: "personal-device"
  id: PersonalDeviceType
  details: "device-binding"
  device: PersonalDeviceType
}

export interface UnavailableIntegrationDefinition extends IntegrationDefinitionBase {
  kind: "unavailable"
  id: "whatsapp"
  details: "unavailable"
  unavailableLabel: "Coming soon"
}

export type WorkspaceIntegrationDefinition =
  | OAuthIntegrationDefinition
  | ForwardingEmailIntegrationDefinition

export type IntegrationDefinition =
  | WorkspaceIntegrationDefinition
  | PersonalDeviceIntegrationDefinition
  | UnavailableIntegrationDefinition

export const INTEGRATION_CHANNEL_SECTIONS: {
  kind: IntegrationChannelKind
  title: string
  description: string
}[] = [
  {
    kind: "support",
    title: "Support channels",
    description: "Where customer messages arrive as tickets.",
  },
  {
    kind: "operator",
    title: "Operator channels",
    description: "Connect your store and manage the agent from your phone.",
  },
]

const OPERATOR_CHANNEL_ORDER: IntegrationId[] = ["imessage", "telegram", "shopify", "whatsapp"]

export function sortIntegrationDefinitionsByChannelKind(
  definitions: IntegrationDefinition[],
  kind: IntegrationChannelKind,
): IntegrationDefinition[] {
  const filtered = definitions.filter((definition) => definition.channelKind === kind)
  if (kind !== "operator") return filtered

  const order = new Map<IntegrationId, number>(OPERATOR_CHANNEL_ORDER.map((id, index) => [id, index]))
  return [...filtered].sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99))
}

export const INTEGRATION_DEFINITIONS: IntegrationDefinition[] = [
  {
    kind: "oauth",
    id: "shopify",
    platform: "shopify",
    name: "Shopify",
    logo: "/logos/shopify.svg",
    description: "Manage orders, customers, and refunds with live store data.",
    connectType: "shopify",
    channelKind: "operator",
    details: "shopify",
    permissions: [],
    oauth: {
      authPath: "/api/integrations/shopify/auth",
      analyticsPlatform: "shopify",
      successCopy: "Shopify store connected.",
    },
    matches: (integration) => integration.platform === "shopify",
  },
  {
    kind: "oauth",
    id: "gmail",
    platform: "email",
    name: "Gmail",
    logo: "/logos/gmail.png",
    description: "Route support mail, draft replies, and send responses from your Gmail inbox.",
    connectType: "email",
    channelKind: "support",
    details: "gmail",
    permissions: [
      "Send replies from your Gmail address",
      "Read messages sent to your support inbox",
      "View your email address",
    ],
    oauth: {
      authPath: "/api/integrations/gmail/auth",
      analyticsPlatform: "email",
      successCopy: "Gmail connected.",
      reauthorizePath: getEmailReauthorizePath,
    },
    matches: (integration) => integration.platform === "email" && getEmailProvider(integration) === "gmail",
  },
  {
    kind: "unavailable",
    id: "whatsapp",
    name: "WhatsApp",
    logo: "/logos/whatsapp-logo.png",
    description: "Get customer reply approvals and daily ticket summaries in WhatsApp chats.",
    channelKind: "operator",
    details: "unavailable",
    unavailableLabel: "Coming soon",
    permissions: [],
  },
  {
    kind: "oauth",
    id: "instagram",
    platform: "ig_dm",
    name: "Instagram",
    logo: "/logos/instagram-logo.png",
    description: "Receive and reply to customer DMs from an Instagram Professional account.",
    connectType: "ig",
    channelKind: "support",
    details: "oauth",
    permissions: [
      "Read Direct Messages sent to your Professional account",
      "Send replies from your Professional account",
      "View your Professional account profile",
    ],
    oauth: {
      authPath: "/api/integrations/instagram/auth",
      analyticsPlatform: "ig_dm",
      successCopy: "Instagram connected.",
    },
    availabilityFlag: "instagram",
    matches: (integration) => integration.platform === "ig_dm",
  },
  {
    kind: "oauth",
    id: "tiktok-shop",
    platform: "tiktok",
    name: "TikTok Shop",
    logo: "/logos/tiktok-logo.png",
    description: "Manage TikTok Shop buyer messages and send support replies from your connected seller account.",
    connectType: "tiktok_shop",
    channelKind: "support",
    details: "oauth",
    permissions: [
      "Read buyer-service conversations for your TikTok Shop",
      "Send text replies from your seller account",
      "View shop and seller authorization details",
    ],
    oauth: {
      authPath: "/api/integrations/tiktok-shop/auth",
      analyticsPlatform: "tiktok",
      successCopy: "TikTok Shop connected.",
    },
    availabilityFlag: "tiktok-shop",
    matches: (integration) => integration.platform === "tiktok",
  },
  {
    kind: "personal-device",
    id: "imessage",
    name: "iMessage",
    logo: "/logos/sms.svg",
    description: "Text your store's agent from iMessage — order lookups, daily digests, and one-tap approvals.",
    channelKind: "operator",
    details: "device-binding",
    device: "imessage",
    permissions: [
      "Send instructions and approvals from your iPhone",
      "Receive order updates and ticket digests on iMessage",
    ],
  },
  {
    kind: "personal-device",
    id: "telegram",
    name: "Telegram",
    logo: "/logos/telegram.svg",
    description: "Approve agent replies and receive ticket digests via the Shopkeeper Telegram bot.",
    channelKind: "operator",
    details: "device-binding",
    device: "telegram",
    permissions: [],
  },
  {
    kind: "forwarding-email",
    id: "email",
    platform: "email",
    name: "Email",
    logo: null,
    description: "Forward your support inbox to receive and reply to customer emails.",
    connectType: "email",
    channelKind: "support",
    details: "forwarding-email",
    permissions: [],
    analyticsPlatform: "email",
    matches: (integration) => integration.platform === "email" && getEmailProvider(integration) === "postmark",
  },
]

export function getIntegrationDefinition(id: IntegrationId): IntegrationDefinition {
  const definition = INTEGRATION_DEFINITIONS.find((candidate) => candidate.id === id)
  if (!definition) throw new Error(`Unknown integration definition: ${id}`)
  return definition
}

export function getOAuthIntegrationDefinition(
  id: OAuthIntegrationDefinition["id"],
): OAuthIntegrationDefinition {
  const definition = getIntegrationDefinition(id)
  if (definition.kind !== "oauth") throw new Error(`Integration is not OAuth: ${id}`)
  return definition
}

export { OAUTH_ERROR_MESSAGES } from "./oauth-contract"
