import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createCannedResponse,
  deleteCannedResponse,
  duplicateCannedResponse,
  updateCannedResponse,
} from "./canned-responses/_components/canned-response-requests"
import { fetchCustomersPage } from "./customers/_components/customer-requests"
import {
  fetchOrdersPage,
  startOrderSupportThread,
} from "./orders/_components/order-requests"
import {
  deletePlaybook,
  savePlaybook,
  togglePlaybook,
} from "./playbooks/_components/playbook-requests"
import {
  deleteTeamMember,
  revokeTeamInvitation,
} from "./team/_components/team-page-requests"

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubApiError(message: string) {
  vi.stubGlobal("fetch", vi.fn(async () => (
    new Response(JSON.stringify({ error: message }), { status: 500 })
  )))
}

describe("saved reply requests", () => {
  it("rejects create, update, duplicate, and delete failures", async () => {
    stubApiError("Saved reply write failed")
    const input = { title: "Shipping", body: "On the way", tags: ["shipping"] }

    await expect(createCannedResponse(input)).rejects.toThrow("Saved reply write failed")
    await expect(updateCannedResponse("reply_1", input)).rejects.toThrow("Saved reply write failed")
    await expect(duplicateCannedResponse("reply_1")).rejects.toThrow("Saved reply write failed")
    await expect(deleteCannedResponse("reply_1")).rejects.toThrow("Saved reply write failed")
  })
})

describe("playbook requests", () => {
  it("rejects save, toggle, and delete failures", async () => {
    stubApiError("Playbook write failed")
    const input = {
      name: "Auto close",
      trigger: { type: "ticket_closed" as const },
      actions: [{ type: "add_note" as const, note: "Closed" }],
    }

    await expect(savePlaybook(null, input)).rejects.toThrow("Playbook write failed")
    await expect(togglePlaybook("playbook_1", false)).rejects.toThrow("Playbook write failed")
    await expect(deletePlaybook("playbook_1")).rejects.toThrow("Playbook write failed")
  })
})

describe("team deletion requests", () => {
  it("rejects member and invitation deletion failures", async () => {
    stubApiError("Team deletion failed")

    await expect(deleteTeamMember("user_1")).rejects.toThrow("Team deletion failed")
    await expect(revokeTeamInvitation("invite_1")).rejects.toThrow("Team deletion failed")
  })
})

describe("pagination requests", () => {
  it("rejects order and customer page failures", async () => {
    stubApiError("Next page failed")

    await expect(fetchOrdersPage("orders_cursor")).rejects.toThrow("Next page failed")
    await expect(fetchCustomersPage("customers_cursor")).rejects.toThrow("Next page failed")
  })

  it("rejects malformed success pages instead of appending them", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "not a page" })))

    await expect(fetchOrdersPage("orders_cursor")).rejects.toThrow("Unable to load more orders.")
    await expect(fetchCustomersPage("customers_cursor")).rejects.toThrow("Unable to load more customers.")
  })
})

describe("order support-thread requests", () => {
  it("rejects API failures and missing thread ids", async () => {
    stubApiError("Thread creation failed")
    const input = {
      shopifyCustomerId: "customer_1",
      customerEmail: "customer@example.com",
      customerName: "Customer",
      orderName: "#1001",
    }

    await expect(startOrderSupportThread(input)).rejects.toThrow("Thread creation failed")

    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true })))
    await expect(startOrderSupportThread(input)).rejects.toThrow("Failed to start support thread.")
  })
})
