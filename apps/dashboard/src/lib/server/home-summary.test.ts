import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ChannelType, SenderType, createMessage, db, type DbChannelType } from "@clerk/db"
import {
  cleanupTestData,
  createTestCustomer,
  createTestOrg,
} from "@clerk/db/test-helpers"
import { buildAgentPlanCacheRecord } from "@/lib/agent/api/plan-cache"
import { resolveAgentSettings } from "@clerk/agent/settings"
import {
  HOME_NEEDS_ATTENTION_LIMIT,
  HOME_OVERNIGHT_TOPIC_LIMIT,
  HOME_REPEAT_CUSTOMER_LIMIT,
} from "@/lib/home/summary-contract"
import { getHomeSummary } from "@/lib/server/home-summary"
import type { AgentPlan } from "@/types"

const NOW = new Date("2026-06-04T18:00:00.000Z")
const TODAY = new Date("2026-06-04T10:00:00.000Z")
const YESTERDAY = new Date("2026-06-03T10:00:00.000Z")
const QUICK_REPLY_PLAN: AgentPlan = {
  instruction: "Reply",
  steps: [{
    id: "send_1",
    tool: "send_reply",
    label: "Reply",
    description: "Send reply",
    category: "communication",
    enabled: true,
  }],
  rawToolCalls: [{
    id: "send_1",
    name: "send_reply",
    input: { text: "We can help." },
  }],
}

let org!: Awaited<ReturnType<typeof createTestOrg>>
let customerSequence = 0

beforeEach(async () => {
  org = await createTestOrg()
  customerSequence = 0
})

afterEach(async () => {
  await cleanupTestData(org?.id)
})

async function createCustomer(name = "Customer") {
  customerSequence += 1
  return createTestCustomer(org.id, `home-${customerSequence}@test.com`, { name: `${name} ${customerSequence}` })
}

async function createThread(options: {
  customerId?: string
  channelType?: DbChannelType
  status?: "open" | "closed"
  tag?: string | null
  createdAt?: Date
  updatedAt?: Date
} = {}) {
  const customerId = options.customerId ?? (await createCustomer()).id
  const createdAt = options.createdAt ?? TODAY
  return db.thread.create({
    data: {
      organizationId: org.id,
      customerId,
      channelType: options.channelType ?? ChannelType.email,
      status: options.status ?? "open",
      tag: options.tag,
      createdAt,
      updatedAt: options.updatedAt ?? createdAt,
      lastMessageAt: createdAt,
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

async function excludeThread(
  kind: "archived" | "deleted" | "filtered" | "operator",
) {
  const thread = await createThread({
    channelType: kind === "operator" ? ChannelType.dashboard_agent : ChannelType.email,
  })
  await addMessage(thread.id, SenderType.ai, new Date("2026-06-04T12:00:00.000Z"))
  if (kind === "archived") {
    await db.thread.update({ where: { id: thread.id }, data: { archivedAt: TODAY } })
  } else if (kind === "deleted") {
    await db.thread.update({ where: { id: thread.id }, data: { deletedAt: TODAY } })
  } else if (kind === "filtered") {
    await db.thread.update({ where: { id: thread.id }, data: { filterStatus: "filtered" } })
  }
}

async function createNeedsAttentionThread(sentAt: Date) {
  const thread = await createThread({ createdAt: sentAt, updatedAt: sentAt })
  const message = await addMessage(thread.id, SenderType.customer, sentAt)
  const settings = resolveAgentSettings(null)
  await db.thread.update({
    where: { id: thread.id },
    data: {
      cachedPlanMessageId: message.id,
      cachedPlan: buildAgentPlanCacheRecord({
        instruction: "Reply",
        lastCustomerMessageId: message.id,
        settings,
        plan: QUICK_REPLY_PLAN,
      }) as unknown as Parameters<typeof db.thread.update>[0]["data"]["cachedPlan"],
      updatedAt: sentAt,
    },
  })
}

describe("getHomeSummary", () => {
  it("returns stable empty-state metrics and series", async () => {
    const summary = await getHomeSummary(org.id, null, NOW)

    expect(summary.metrics).toEqual({
      openCount: 0,
      openDelta: 0,
      weeklyVolume: 0,
      firstReplyMinutes: null,
      autoResolvedPct: null,
      repliesSent24h: 0,
      overnightClearedCount: 0,
      needsYouCount: 0,
      refundsPending: 0,
      vipsInQueue: 0,
      hasSentReply: false,
    })
    expect(summary.series.days).toHaveLength(7)
    expect(summary.series.newThreadsByDay).toEqual([0, 0, 0, 0, 0, 0, 0])
    expect(summary.needsAttention).toEqual([])
    expect(summary.overnight.topics).toEqual([])
    expect(summary.repeatCustomers).toEqual([])
  })

  it("counts all replies and daily comparison metrics while applying canonical inbox filters", async () => {
    const repliedThread = await createThread()
    await addMessage(repliedThread.id, SenderType.customer, TODAY)
    await addMessage(repliedThread.id, SenderType.ai, new Date("2026-06-04T10:10:00.000Z"))
    await addMessage(repliedThread.id, SenderType.ai, new Date("2026-06-04T11:00:00.000Z"))
    await addMessage(repliedThread.id, SenderType.agent, new Date("2026-06-04T12:00:00.000Z"))
    await db.message.create({
      data: {
        threadId: repliedThread.id,
        senderType: SenderType.ai,
        contentText: "deleted reply",
        sentAt: new Date("2026-06-04T13:00:00.000Z"),
        deletedAt: new Date("2026-06-04T13:01:00.000Z"),
      },
    })

    await createThread()
    await createThread({ createdAt: YESTERDAY, updatedAt: YESTERDAY })
    await Promise.all([
      excludeThread("archived"),
      excludeThread("deleted"),
      excludeThread("filtered"),
      excludeThread("operator"),
    ])

    const summary = await getHomeSummary(org.id, null, NOW)

    expect(summary.metrics).toMatchObject({
      openCount: 3,
      openDelta: 1,
      weeklyVolume: 3,
      firstReplyMinutes: 10,
      autoResolvedPct: 67,
      repliesSent24h: 3,
      hasSentReply: true,
    })
    expect(summary.series.newThreadsByDay.slice(-2)).toEqual([1, 2])
    expect(summary.series.totalRepliesByDay[6]).toBe(3)
  })

  it("bounds needs-attention, overnight-topic, and repeat-customer lists", async () => {
    for (let index = 0; index < 7; index++) {
      await createNeedsAttentionThread(new Date(NOW.getTime() - index * 60_000))
    }

    for (let customerIndex = 0; customerIndex < 5; customerIndex++) {
      const customer = await createCustomer("Repeat")
      const channels = [ChannelType.email, ChannelType.ig_dm, ChannelType.sms] as const
      for (let threadIndex = 0; threadIndex < 3; threadIndex++) {
        await createThread({
          customerId: customer.id,
          channelType: channels[threadIndex],
          createdAt: new Date(NOW.getTime() - (customerIndex + threadIndex + 1) * 60_000),
          updatedAt: new Date(NOW.getTime() - (customerIndex + threadIndex + 1) * 60_000),
        })
      }
    }

    for (const tag of ["Shipping", "Returns", "Order Status", "Product Inquiry", "Billing"]) {
      const thread = await createThread({ status: "closed", tag })
      await addMessage(thread.id, SenderType.ai, new Date("2026-06-04T15:00:00.000Z"))
      await db.thread.update({
        where: { id: thread.id },
        data: { status: "closed", updatedAt: new Date("2026-06-04T15:05:00.000Z") },
      })
    }

    const summary = await getHomeSummary(org.id, null, NOW)

    expect(summary.metrics.needsYouCount).toBe(7)
    expect(summary.metrics.overnightClearedCount).toBe(5)
    expect(summary.needsAttention).toHaveLength(HOME_NEEDS_ATTENTION_LIMIT)
    expect(summary.overnight.topics).toHaveLength(HOME_OVERNIGHT_TOPIC_LIMIT)
    expect(summary.repeatCustomers).toHaveLength(HOME_REPEAT_CUSTOMER_LIMIT)
    expect(summary.repeatCustomers.every(customer => customer.ticketCount === 3)).toBe(true)
  })
})
