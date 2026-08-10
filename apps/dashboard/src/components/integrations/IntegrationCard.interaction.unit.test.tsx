/**
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getIntegrationDefinition } from "@/lib/integrations/catalog"
import type { Integration } from "@/types"
import IntegrationCard from "./IntegrationCard"
import ImessageCard from "./ImessageCard"
import { ForwardingEmailDetails, type IntegrationCardCallbacks } from "./IntegrationCardDetails"
import { deriveIntegrationCardModels } from "./integration-presentation"

const FLAGS = {
  gmailNativeInboundEnabled: false,
  instagramIntegrationEnabled: true,
  tiktokShopConfigured: true,
  telegramBotUsername: "ShopkeeperBot",
  imessageHandle: "+15555550100",
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function callbacks(): IntegrationCardCallbacks {
  return {
    connectForwardingEmail: vi.fn(async () => true),
    updateEmailAddress: vi.fn(async () => true),
    disconnect: vi.fn(async () => undefined),
    setDefaultEmail: vi.fn(async () => undefined),
    launchOAuth: vi.fn(),
    syncShopifyKnowledgeBase: vi.fn(async () => ({ syncedPolicies: 0, syncedPages: 0 })),
    updateShopifyStorefrontChat: vi.fn(async () => true),
  }
}

function model(id: "gmail" | "email" | "tiktok-shop", isAdmin: boolean, integrations: Integration[] = []) {
  return deriveIntegrationCardModels({
    integrations,
    flags: FLAGS,
    isAdmin,
    definitions: [getIntegrationDefinition(id)],
  })[0]
}

function emailIntegration(): Integration {
  return {
    id: "forwarding-id",
    organizationId: "org-id",
    platform: "email",
    emailProvider: "postmark",
    externalAccountId: "support@example.test",
    fromEmail: "support@example.test",
    tokenExpiresAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    isDefaultEmail: false,
  }
}

describe("IntegrationCard workspace permissions", () => {
  it("launches workspace OAuth for admins and disables it for members", async () => {
    const adminCallbacks = callbacks()
    await act(async () => root.render(
      <IntegrationCard
        model={model("gmail", true)}
        callbacks={adminCallbacks}
        open={false}
        onOpenChange={() => undefined}
        shopifyClientId={null}
        storefrontChatGloballyEnabled={false}
      />,
    ))
    const adminConnect = container.querySelector("button") as HTMLButtonElement
    adminConnect.click()
    expect(adminCallbacks.launchOAuth).toHaveBeenCalledOnce()

    const memberCallbacks = callbacks()
    await act(async () => root.render(
      <IntegrationCard
        model={model("gmail", false)}
        callbacks={memberCallbacks}
        open={false}
        onOpenChange={() => undefined}
        shopifyClientId={null}
        storefrontChatGloballyEnabled={false}
      />,
    ))
    const memberConnect = container.querySelector("button") as HTMLButtonElement
    expect(memberConnect.disabled).toBe(true)
    memberConnect.click()
    expect(memberCallbacks.launchOAuth).not.toHaveBeenCalled()
  })

  it("disables update, default selection, and delete controls for members", async () => {
    const integration = emailIntegration()
    const memberCallbacks = callbacks()
    await act(async () => root.render(
      <ForwardingEmailDetails
        model={model("email", false, [integration])}
        callbacks={memberCallbacks}
        shopifyClientId={null}
        storefrontChatGloballyEnabled={false}
      />,
    ))

    const input = container.querySelector("input") as HTMLInputElement
    const defaultButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Use for new emails")) as HTMLButtonElement
    const deleteButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Delete connection")) as HTMLButtonElement
    expect(input.disabled).toBe(true)
    expect(defaultButton.disabled).toBe(true)
    expect(deleteButton.disabled).toBe(true)
    defaultButton.click()
    deleteButton.click()
    expect(memberCallbacks.setDefaultEmail).not.toHaveBeenCalled()
    expect(memberCallbacks.disconnect).not.toHaveBeenCalled()
  })

  it("allows admins to select a default forwarding connection", async () => {
    const integration = emailIntegration()
    const adminCallbacks = callbacks()
    await act(async () => root.render(
      <ForwardingEmailDetails model={model("email", true, [integration])} callbacks={adminCallbacks} />,
    ))
    const defaultButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Use for new emails")) as HTMLButtonElement

    defaultButton.click()
    expect(adminCallbacks.setDefaultEmail).toHaveBeenCalledWith("forwarding-id")
  })

  it("keeps personal iMessage binding interactive without an admin role", async () => {
    const definition = getIntegrationDefinition("imessage")
    if (definition.kind !== "personal-device") throw new Error("Expected iMessage device definition")
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      lineConnected: true,
      connected: false,
      handles: [],
    }), { status: 200, headers: { "Content-Type": "application/json" } })))

    await act(async () => root.render(<ImessageCard config={definition} handle="+15555550100" />))
    const connect = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Connect") as HTMLButtonElement
    expect(connect.disabled).toBe(false)
    await act(async () => connect.click())
    expect(document.body.textContent).toContain("Link your iPhone")
  })
})
