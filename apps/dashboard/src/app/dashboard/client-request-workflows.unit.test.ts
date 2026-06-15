import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchCustomersPage } from "./(shell)/orders/_components/customers/customer-requests"
import {
  fetchOrdersPage,
  startOrderSupportThread,
} from "./(shell)/orders/_components/order-requests"
import {
  deleteTeamMember,
  revokeTeamInvitation,
} from "./(shell)/team/_components/team-page-requests"

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubApiError(message: string) {
  vi.stubGlobal("fetch", vi.fn(async () => (
    new Response(JSON.stringify({ error: message }), { status: 500 })
  )))
}

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
