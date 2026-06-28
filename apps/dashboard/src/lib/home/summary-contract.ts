export const HOME_SUMMARY_REFRESH_INTERVAL_MS =
  process.env.NEXT_PUBLIC_GATEWAY_EVENTS_URL ? 60_000 : 30_000
export const HOME_NEEDS_ATTENTION_LIMIT = 5
export const HOME_OVERNIGHT_TOPIC_LIMIT = 4
export const HOME_REPEAT_CUSTOMER_LIMIT = 4

export interface HomeNeedsAttentionItem {
  threadId: string
  kind: "quick_reply" | "needs_review" | "needs_merchant_input"
  customerName: string | null
  customerMessage: string
  channelName: string
  timeAgo: string
  headline: string
  contextLine: string
  proposalSummary: string
  actionText: string | null
  replyText: string | null
  question: string | null
  orderRef: string | null
  tag: string | null
  isVip: boolean
}

export interface HomeClearedTopic {
  tag: string
  count: number
  subtitle: string
}

export interface HomeRepeatCustomer {
  customerId: string
  name: string
  initials: string
  ticketCount: number
}

export interface HomeSummary {
  generatedAt: string
  metrics: {
    openCount: number
    openDelta: number
    weeklyVolume: number
    firstReplyMinutes: number | null
    autoResolvedPct: number | null
    repliesSent24h: number
    overnightClearedCount: number
    needsYouCount: number
    refundsPending: number
    vipsInQueue: number
    hasSentReply: boolean
  }
  series: {
    days: string[]
    newThreadsByDay: number[]
    aiResolvedByDay: number[]
    totalRepliesByDay: number[]
  }
  needsAttention: HomeNeedsAttentionItem[]
  overnight: {
    topics: HomeClearedTopic[]
    channelNames: string[]
  }
  repeatCustomers: HomeRepeatCustomer[]
}

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function lastUtcDayKeys(now: Date, count: number): string[] {
  const today = new Date(now)
  today.setUTCHours(0, 0, 0, 0)

  return Array.from({ length: count }, (_, index) => {
    const day = new Date(today)
    day.setUTCDate(today.getUTCDate() - (count - index - 1))
    return utcDayKey(day)
  })
}

export function createEmptyHomeSummary(now = new Date()): HomeSummary {
  const days = lastUtcDayKeys(now, 7)
  const emptySeries = days.map(() => 0)

  return {
    generatedAt: now.toISOString(),
    metrics: {
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
    },
    series: {
      days,
      newThreadsByDay: [...emptySeries],
      aiResolvedByDay: [...emptySeries],
      totalRepliesByDay: [...emptySeries],
    },
    needsAttention: [],
    overnight: {
      topics: [],
      channelNames: [],
    },
    repeatCustomers: [],
  }
}
