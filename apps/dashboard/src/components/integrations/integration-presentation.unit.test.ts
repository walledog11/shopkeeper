import { describe, expect, it } from "vitest"
import { GMAIL_READONLY_SCOPE } from "@shopkeeper/email/providers"
import { getIntegrationDefinition } from "@/lib/integrations/catalog"
import type { Integration } from "@/types"
import {
  deriveIntegrationCardModels,
  selectPrimaryConnection,
} from "./integration-presentation"

const FLAGS = {
  instagramConnectAvailable: true,
  tiktokShopConfigured: true,
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

  it("derives coming-soon availability for providers this deployment does not offer", () => {
    const models = deriveIntegrationCardModels({
      integrations: [],
      flags: {
        ...FLAGS,
        instagramConnectAvailable: false,
        tiktokShopConfigured: false,
        imessageHandle: "   ",
      },
      isAdmin: true,
    })
    expect(models.find((model) => model.definition.id === "instagram")?.availability.state).toBe("coming-soon")
    expect(models.find((model) => model.definition.id === "tiktok-shop")?.availability.state).toBe("coming-soon")
    expect(models.find((model) => model.definition.id === "whatsapp")?.availability.state).toBe("coming-soon")
  })

  it("keeps a connected Instagram card manageable after direct connect closes", () => {
    const connected = integration({ id: "ig-1", platform: "ig_dm" })
    const models = deriveIntegrationCardModels({
      integrations: [connected],
      flags: { ...FLAGS, instagramConnectAvailable: false },
      isAdmin: true,
    })
    const instagram = models.find((model) => model.definition.id === "instagram")
    expect(instagram?.availability.state).toBe("available")
    expect(instagram?.isConnected).toBe(true)
  })
})
