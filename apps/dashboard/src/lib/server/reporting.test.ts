import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ChannelType, SenderType, createMessage, db, type DbChannelType } from "@shopkeeper/db"
import {
  cleanupTestData,
  createTestCustomer,
  createTestOrg,
} from "@shopkeeper/db/test-helpers"
import {
  ANALYTICS_TAG_LIMIT,
  REPORTS_TAG_LIMIT,
  getThreadReportingMetricsForRange,
  getThreadTagCountsForRange,
  parseReportingDateRange,
  type ReportingChannelCount,
} from "@/lib/server/reporting"

let org!: Awaited<ReturnType<typeof createTestOrg>>
let otherOrg!: Awaited<ReturnType<typeof createTestOrg>>
let customerSequence = 0

const RANGE = {
  from: new Date("2026-06-01T00:00:00.000Z"),
  to: new Date("2026-06-03T23:59:59.999Z"),
}

beforeEach(async () => {
  org = await createTestOrg()
  otherOrg = await createTestOrg()
  customerSequence = 0
})

afterEach(async () => {
  vi.useRealTimers()
  await cleanupTestData(org?.id)
  await cleanupTestData(otherOrg?.id)
})

async function createCustomer(organizationId = org.id) {
  customerSequence += 1
  return createTestCustomer(organizationId, `reporting-${customerSequence}@test.com`)
}

async function createThread(options: {
  organizationId?: string
  channelType?: DbChannelType
  status?: "open" | "pending" | "closed"
  tag?: string | null
  createdAt?: Date
  deletedAt?: Date | null
} = {}) {
  const organizationId = options.organizationId ?? org.id
  const customer = await createCustomer(organizationId)
  const createdAt = options.createdAt ?? new Date("2026-06-01T12:00:00.000Z")

  return db.thread.create({
    data: {
      organizationId,
      customerId: customer.id,
      channelType: options.channelType ?? ChannelType.email,
      status: options.status ?? "open",
      tag: options.tag ?? "Support",
      createdAt,
      updatedAt: createdAt,
      lastMessageAt: createdAt,
      deletedAt: options.deletedAt ?? null,
    },
  })
}

async function addMessage(
  threadId: string,
  senderType: typeof SenderType.customer | typeof SenderType.agent | typeof SenderType.ai,
  sentAt: Date,
) {
  return createMessage({ threadId, senderType, sentAt, contentText: `${senderType} message` })
}

function sortChannelCounts(rows: ReportingChannelCount[]) {
  return [...rows].sort((a, b) => a.channel.localeCompare(b.channel))
}

describe("parseReportingDateRange", () => {
  it("supports analytics range presets when explicit bounds are absent", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-04T12:00:00.000Z"))

    const parsed = parseReportingDateRange(new URLSearchParams("range=7d"), { allowRangePreset: true })

    expect(parsed).toEqual({
      from: new Date("2026-05-28T12:00:00.000Z"),
      to: new Date("2026-06-04T12:00:00.000Z"),
    })
  })

  it("uses default report windows when range presets are not enabled", () => {
    const parsed = parseReportingDateRange(new URLSearchParams("range=7d&to=2026-06-04T00:00:00.000Z"))

    expect(parsed).toEqual({
      from: new Date("2026-05-05T00:00:00.000Z"),
      to: new Date("2026-06-04T00:00:00.000Z"),
    })
  })

  it("rejects malformed ranges", () => {
    expect(() => parseReportingDateRange(
      new URLSearchParams("range=bad"),
      { allowRangePreset: true },
    )).toThrow("Invalid range")
    expect(() => parseReportingDateRange(
      new URLSearchParams("from=bad&to=2026-06-04T00:00:00.000Z"),
    )).toThrow("Invalid date range")
    expect(() => parseReportingDateRange(
      new URLSearchParams("from=2026-06-05T00:00:00.000Z&to=2026-06-04T00:00:00.000Z"),
    )).toThrow("Invalid date range")
  })
})

describe("thread reporting metrics", () => {
  it("returns matching analytics and report results for the same range", async () => {
    const firstThread = await createThread({
      channelType: ChannelType.email,
      status: "open",
      tag: "Shipping",
      createdAt: new Date("2026-06-01T10:00:00.000Z"),
    })
    await addMessage(firstThread.id, SenderType.customer, new Date("2026-06-01T10:00:00.000Z"))
    await addMessage(firstThread.id, SenderType.ai, new Date("2026-06-01T10:15:00.000Z"))

    const secondThread = await createThread({
      channelType: ChannelType.shopify,
      status: "closed",
      tag: "Returns",
      createdAt: new Date("2026-06-02T11:00:00.000Z"),
    })
    await addMessage(secondThread.id, SenderType.customer, new Date("2026-06-02T11:00:00.000Z"))
    await addMessage(secondThread.id, SenderType.agent, new Date("2026-06-02T11:30:00.000Z"))

    await createThread({
      channelType: ChannelType.sms,
      status: "pending",
      tag: "Support",
      createdAt: new Date("2026-06-03T12:00:00.000Z"),
    })
    await createThread({
      tag: "Deleted",
      createdAt: new Date("2026-06-01T12:00:00.000Z"),
      deletedAt: new Date("2026-06-01T13:00:00.000Z"),
    })
    await createThread({
      tag: "Outside",
      createdAt: new Date("2026-05-20T12:00:00.000Z"),
    })
    await createThread({
      organizationId: otherOrg.id,
      channelType: ChannelType.ig_dm,
      status: "closed",
      tag: "Foreign",
      createdAt: new Date("2026-06-01T12:00:00.000Z"),
    })

    const [analyticsMetrics, reportMetrics] = await Promise.all([
      getThreadReportingMetricsForRange(org.id, RANGE, { tagLimit: ANALYTICS_TAG_LIMIT }),
      getThreadReportingMetricsForRange(org.id, RANGE, { tagLimit: REPORTS_TAG_LIMIT }),
    ])

    expect(reportMetrics.total).toBe(3)
    expect(analyticsMetrics.total).toBe(reportMetrics.total)
    expect(analyticsMetrics.byStatus).toEqual(reportMetrics.byStatus)
    expect(analyticsMetrics.byStatus).toEqual({ closed: 1, open: 1, pending: 1 })
    expect(sortChannelCounts(analyticsMetrics.byChannel)).toEqual(sortChannelCounts(reportMetrics.byChannel))
    expect(sortChannelCounts(analyticsMetrics.byChannel)).toEqual([
      { channel: "email", count: 1 },
      { channel: "shopify", count: 1 },
      { channel: "sms", count: 1 },
    ])
    expect(analyticsMetrics.byTag).toEqual(reportMetrics.byTag)
    expect(analyticsMetrics.byTag).toEqual([
      { tag: "Returns", count: 1 },
      { tag: "Shipping", count: 1 },
      { tag: "Support", count: 1 },
    ])
    expect(analyticsMetrics.firstReply).toEqual(reportMetrics.firstReply)
    expect(analyticsMetrics.firstReply).toEqual({ avgMinutes: 23, measuredCount: 2 })
  })

  it("keeps analytics and report tag limits explicit", async () => {
    for (let tagIndex = 0; tagIndex < ANALYTICS_TAG_LIMIT; tagIndex++) {
      const tag = `Topic ${tagIndex + 1}`
      const threadCount = ANALYTICS_TAG_LIMIT - tagIndex
      for (let threadIndex = 0; threadIndex < threadCount; threadIndex++) {
        await createThread({
          status: "closed",
          tag,
          createdAt: new Date("2026-06-02T12:00:00.000Z"),
        })
      }
    }

    const [analyticsTags, reportTags] = await Promise.all([
      getThreadTagCountsForRange(org.id, RANGE, { limit: ANALYTICS_TAG_LIMIT }),
      getThreadTagCountsForRange(org.id, RANGE, { limit: REPORTS_TAG_LIMIT }),
    ])

    expect(analyticsTags).toHaveLength(ANALYTICS_TAG_LIMIT)
    expect(reportTags).toHaveLength(REPORTS_TAG_LIMIT)
    expect(reportTags).toEqual(analyticsTags.slice(0, REPORTS_TAG_LIMIT))
    expect(analyticsTags[0]).toEqual({ tag: "Topic 1", count: 8 })
    expect(analyticsTags[7]).toEqual({ tag: "Topic 8", count: 1 })
  })
})
