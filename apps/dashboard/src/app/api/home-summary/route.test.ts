import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ChannelType } from "@shopkeeper/db"
import {
  cleanupTestData,
  createTestCustomer,
  createTestOrg,
  createTestThread,
} from "@shopkeeper/db/test-helpers"

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}))

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: vi.fn(),
}))

import { GET } from "./route"

let org!: Awaited<ReturnType<typeof createTestOrg>>
let otherOrg: Awaited<ReturnType<typeof createTestOrg>> | null = null

beforeEach(async () => {
  org = await createTestOrg()
  mockAuth.mockResolvedValue({ userId: "usr_home", orgId: org.clerkOrgId })
})

afterEach(async () => {
  await cleanupTestData(org?.id)
  await cleanupTestData(otherOrg?.id)
  otherOrg = null
  vi.clearAllMocks()
})

describe("GET /api/home-summary", () => {
  it("returns the bounded summary contract for the active organization", async () => {
    otherOrg = await createTestOrg()
    const foreignCustomer = await createTestCustomer(otherOrg.id, "foreign-home@test.com")
    await createTestThread(otherOrg.id, foreignCustomer.id, ChannelType.email)

    const response = await GET()
    const body = await response.json() as {
      generatedAt: string
      metrics: { openCount: number }
      series: { days: string[] }
      needsAttention: unknown[]
      overnight: { topics: unknown[] }
      repeatCustomers: unknown[]
    }

    expect(response.status).toBe(200)
    expect(body.generatedAt).toEqual(expect.any(String))
    expect(body.metrics.openCount).toBe(0)
    expect(body.series.days).toHaveLength(7)
    expect(body.needsAttention).toEqual([])
    expect(body.overnight.topics).toEqual([])
    expect(body.repeatCustomers).toEqual([])
  })
})
