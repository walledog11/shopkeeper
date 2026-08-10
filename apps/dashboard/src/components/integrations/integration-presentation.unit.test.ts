import { describe, expect, it } from "vitest"
import { GMAIL_READONLY_SCOPE } from "@shopkeeper/email/providers"
import { getIntegrationDefinition } from "@/lib/integrations/catalog"
import type { Integration } from "@/types"
import {
  deriveIntegrationCardModels,
  integrationAttentionSummary,
  oauthDefinitionForProvider,
  selectPrimaryConnection,
} from "./integration-presentation"

const FLAGS = {
  gmailNativeInboundEnabled: true,
  instagramIntegrationEnabled: true,
  tiktokShopConfigured: true,
  telegramBotUsername: "ShopkeeperBot",
  imessageHandle: "+15555550100",
}

function integration(overrides: Partial<Integration> & Pick<Integration, "id" | "platform">): Integration {
  return {
    organizationId: "org-id",
    externalAccountId: `${overrides.id}@example.test`,
    fromEmail: null,
    tokenExpiresAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function modelFor(id: string, integrations: Integration[], options?: { admin?: boolean; flags?: Partial<typeof FLAGS> }) {
  const definition = getIntegrationDefinition(id as Parameters<typeof getIntegrationDefinition>[0])
  return deriveIntegrationCardModels({
    integrations,
    definitions: [definition],
    flags: { ...FLAGS, ...options?.flags },
    isAdmin: options?.admin ?? true,
  })[0]
}

describe("integration presentation", () => {
  it.each([
    "email",
    "gmail",
    "instagram",
    "shopify",
    "tiktok-shop",
    "whatsapp",
  ])("derives a disconnected %s card without an inferred recovery", (id) => {
    const model = modelFor(id, [])
    expect(model.status).toBe("not-connected")
    expect(model.selectedConnection).toBeNull()
    expect(model.recoveryAction).toBeNull()
  })

  it("selects one stable primary connection regardless of API input order", () => {
    const definition = getIntegrationDefinition("email")
    if (definition.kind !== "forwarding-email") throw new Error("Expected forwarding email")
    const later = integration({
      id: "later",
      platform: "email",
      emailProvider: "postmark",
      createdAt: "2026-02-01T00:00:00.000Z",
    })
    const earlier = integration({
      id: "earlier",
      platform: "email",
      emailProvider: "postmark",
      createdAt: "2026-01-01T00:00:00.000Z",
    })

    const selected = selectPrimaryConnection(definition, [later, earlier])
    expect(selected.connections.map((connection) => connection.id)).toEqual(["earlier", "later"])
    expect(selected.selectedConnection?.id).toBe("earlier")
  })

  it.each([
    {
      label: "forwarding email waiting for its first message",
      id: "email",
      record: integration({ id: "email", platform: "email", emailProvider: "postmark" }),
      status: "waiting",
      recovery: false,
    },
    {
      label: "active native Gmail",
      id: "gmail",
      record: integration({
        id: "gmail",
        platform: "email",
        emailProvider: "gmail",
        metadata: { provider: "gmail", oauthScopes: [GMAIL_READONLY_SCOPE], gmail: { inboundStatus: "active" } },
      }),
      status: "working",
      recovery: false,
    },
    {
      label: "degraded Gmail sync",
      id: "gmail",
      record: integration({
        id: "gmail-degraded",
        platform: "email",
        emailProvider: "gmail",
        metadata: { provider: "gmail", oauthScopes: [GMAIL_READONLY_SCOPE], gmail: { inboundStatus: "degraded" } },
      }),
      status: "needs-attention",
      recovery: false,
    },
    {
      label: "degraded Instagram provider check",
      id: "instagram",
      record: integration({
        id: "instagram-degraded",
        platform: "ig_dm",
        tokenExpiresAt: "2099-01-01T00:00:00.000Z",
        metadata: { instagram: { healthStatus: "degraded", subscribedFields: ["messages"] } },
      }),
      status: "needs-attention",
      recovery: false,
    },
    {
      label: "Instagram reconnect required",
      id: "instagram",
      record: integration({
        id: "instagram-reconnect",
        platform: "ig_dm",
        tokenExpiresAt: "2099-01-01T00:00:00.000Z",
        metadata: { instagram: { healthStatus: "reconnect_required", lastHealthError: { category: "permission" } } },
      }),
      status: "needs-attention",
      recovery: true,
    },
    {
      label: "expired TikTok Shop token",
      id: "tiktok-shop",
      record: integration({ id: "tiktok-expired", platform: "tiktok", tokenExpiresAt: "2020-01-01T00:00:00.000Z" }),
      status: "needs-attention",
      recovery: true,
    },
    {
      label: "Shopify missing scopes",
      id: "shopify",
      record: integration({ id: "shopify-scopes", platform: "shopify", connectionState: "active", missingScopes: ["read_returns"] }),
      status: "needs-attention",
      recovery: true,
    },
    {
      label: "expired Shopify connection",
      id: "shopify",
      record: integration({ id: "shopify-expired", platform: "shopify", connectionState: "invalid" }),
      status: "needs-attention",
      recovery: true,
    },
  ])("derives $label", ({ id, record, status, recovery }) => {
    const model = modelFor(id, [record])
    expect(model.status).toBe(status)
    expect(Boolean(model.recoveryAction)).toBe(recovery)
  })

  it("uses the same models for cards and banner copy", () => {
    const gmail = integration({
      id: "gmail",
      platform: "email",
      emailProvider: "gmail",
      metadata: { provider: "gmail", oauthScopes: [GMAIL_READONLY_SCOPE], gmail: { inboundStatus: "degraded" } },
    })
    const instagram = integration({
      id: "instagram",
      platform: "ig_dm",
      tokenExpiresAt: "2099-01-01T00:00:00.000Z",
      metadata: { instagram: { healthStatus: "degraded" } },
    })
    const shopify = integration({
      id: "shopify",
      platform: "shopify",
      connectionState: "active",
      missingScopes: ["write_returns"],
    })
    const models = deriveIntegrationCardModels({
      integrations: [gmail, instagram, shopify],
      flags: FLAGS,
      isAdmin: true,
    })

    expect(models.filter((model) => model.status === "needs-attention").map((model) => model.definition.id))
      .toEqual(["shopify", "gmail", "instagram"])
    expect(integrationAttentionSummary(models)).toEqual({
      count: 3,
      allActionable: false,
      copy: "3 connections need attention. Open the affected integration for details.",
    })
  })

  it("mentions Fix only when every counted card has an enabled recovery", () => {
    const shopify = integration({ id: "shopify", platform: "shopify", connectionState: "invalid" })
    const adminModels = deriveIntegrationCardModels({ integrations: [shopify], flags: FLAGS, isAdmin: true })
    const memberModels = deriveIntegrationCardModels({ integrations: [shopify], flags: FLAGS, isAdmin: false })

    expect(integrationAttentionSummary(adminModels).copy).toContain("Fix button")
    expect(integrationAttentionSummary(memberModels).copy).not.toContain("Fix button")
  })

  it("keeps personal binding available to members while workspace mutations are disabled", () => {
    const models = deriveIntegrationCardModels({ integrations: [], flags: FLAGS, isAdmin: false })
    expect(models.find((model) => model.definition.id === "telegram")?.canManageWorkspace).toBe(true)
    expect(models.find((model) => model.definition.id === "imessage")?.canManageWorkspace).toBe(true)
    expect(models.find((model) => model.definition.id === "gmail")?.canManageWorkspace).toBe(false)
  })

  it("derives deployment availability and visibility without mutating the catalog", () => {
    const models = deriveIntegrationCardModels({
      integrations: [],
      flags: {
        ...FLAGS,
        instagramIntegrationEnabled: false,
        tiktokShopConfigured: false,
        telegramBotUsername: "@@  ",
        imessageHandle: "   ",
      },
      isAdmin: true,
    })
    expect(models.find((model) => model.definition.id === "instagram")?.availability.state).toBe("private-beta")
    expect(models.find((model) => model.definition.id === "tiktok-shop")?.availability.state).toBe("coming-soon")
    expect(models.find((model) => model.definition.id === "whatsapp")?.availability.state).toBe("coming-soon")
    expect(models.find((model) => model.definition.id === "telegram")?.visible).toBe(false)
    expect(getIntegrationDefinition("instagram").description).not.toContain("private beta")
  })

  it.each([
    ["gmail", "Gmail connected."],
    ["instagram", "Instagram connected."],
    ["shopify", "Shopify store connected."],
    ["tiktok-shop", "TikTok Shop connected."],
  ] as const)("keeps %s OAuth success copy in its provider definition", (provider, successCopy) => {
    expect(oauthDefinitionForProvider(provider)?.oauth.successCopy).toBe(successCopy)
  })

  it("consolidates Gmail health, scene, receiving, and status copy", () => {
    const gmail = integration({
      id: "gmail",
      platform: "email",
      emailProvider: "gmail",
      externalAccountId: "merchant@gmail.test",
      metadata: { provider: "gmail", oauthScopes: [GMAIL_READONLY_SCOPE], gmail: { inboundStatus: "degraded" } },
    })
    const model = modelFor("gmail", [gmail])
    expect(model.gmail).toMatchObject({
      scene: "needs_forwarding",
      statusLine: "Gmail inbox sync needs attention. Sending still works.",
      receiving: { status: "Needs attention" },
    })
    expect(model.note).toBe(model.gmail?.statusLine)
  })
})
