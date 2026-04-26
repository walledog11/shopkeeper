import { useCallback, useMemo } from "react"
import useSWR from "swr"
import { useOrganization } from "@clerk/nextjs"
import { useThreads } from "@/hooks/useThreads"
import { getCustomerName } from "@/lib/messaging/customer-name"
import { getChannelInfo } from "@/lib/messaging/channels"
import { fetcher } from "@/lib/api/fetcher"
import { CHANNEL_TYPE, SENDER_TYPE } from "@/lib/messaging/thread-constants"
import { AGENT_SETTINGS_DEFAULTS } from "@/lib/agent/settings"
import { readAgentPlanCachePlan } from "@/lib/agent/plan-cache-shape"
import { buildPlanPreview, classifyHomePlan } from "@/lib/agent/plan-preview"
import type { Thread, Integration, OrgSettings, KnowledgeBase, AgentPlan } from "@/types"

// Rough heuristic: a typical Shopify-support reply takes ~14 minutes of human
// time end-to-end (read, look up order, draft, send). Used only for the
// "saved you ~Xh" copy on the home page.
const MINUTES_SAVED_PER_AUTO_TICKET = 14
const DAY_MS = 24 * 60 * 60 * 1000

interface AnalyticsSnapshot {
  firstReply: { avgMinutes: number | null }
  aiUsage: { aiReplyPct: number | null }
}

interface OrdersResponse {
  orders: Array<{
    id: number
    name: string
    fulfillment_status: string | null
    financial_status: string
    total_price: string
    customer: { name: string } | null
    line_items: { title: string; variant_title: string | null }[]
  }>
}

interface NeedsYouItem {
  threadId: string
  kind: "quick_reply" | "needs_review"
  customerName: string
  channelName: string
  timeAgo: string
  headline: string
  contextLine: string
  proposalSummary: string
  replyText: string | null
  orderRef: string | null
  tag: string | null
}

interface ClearedTopic {
  tag: string
  count: number
  subtitle: string
}

interface RepeatCustomer {
  customerId: string
  name: string
  initials: string
  ticketCount: number
}

const TAG_SUBTITLES: Record<string, string> = {
  Shipping: "WISMO replies sent",
  Returns: "size swaps + refunds",
  "Order Status": "tracking pulled & shared",
  "Product Inquiry": "answered from KB",
  General: "answered from KB",
}

function timeAgoShort(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function lastNDays(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  for (let i = n - 1; i >= 0; i--) {
    const dd = new Date(d)
    dd.setDate(d.getDate() - i)
    out.push(dayKey(dd))
  }
  return out
}

function currentPlanForThread(thread: Thread): AgentPlan | null {
  const latestMessage = thread.messages[0]
  if (latestMessage?.senderType !== SENDER_TYPE.CUSTOMER) return null
  if (!thread.cachedPlanMessageId || thread.cachedPlanMessageId !== latestMessage.id) return null
  const plan = readAgentPlanCachePlan(thread.cachedPlan)
  return plan && plan.steps.length > 0 ? plan : null
}

function initialsOf(name: string): string {
  return name.split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
}

interface Options {
  initialOpenThreads: Thread[]
}

export function useHomeData({ initialOpenThreads }: Options) {
  const { data: integrations = [] } = useSWR<Integration[]>('/api/integrations', fetcher)
  const { data: orgData } = useSWR<{ settings: Partial<OrgSettings> }>('/api/org', fetcher)
  const { data: kbData } = useSWR<{ knowledgeBases: KnowledgeBase[] }>('/api/kb', fetcher, { revalidateOnFocus: false })
  const { data: phoneData } = useSWR<{ phoneNumber: string | null; phoneVerified: boolean }>('/api/phone', fetcher, { revalidateOnFocus: false })
  const { memberships } = useOrganization({ memberships: { infinite: false, pageSize: 10 } })

  const { data: analyticsData } = useSWR<AnalyticsSnapshot>(
    '/api/analytics?range=7d',
    fetcher,
    { refreshInterval: 300_000, revalidateOnFocus: false },
  )

  const { threads: openThreads, isLoading: loadingOpen, mutate: mutateOpenThreads } = useThreads('open', initialOpenThreads, true, true)
  const { threads: closedThreads, isLoading: loadingClosed } = useThreads('closed', undefined, true, true)

  const channelConnected = integrations.length > 0
  const hasShopify = integrations.some(i => i.platform === CHANNEL_TYPE.SHOPIFY)

  const { data: ordersData } = useSWR<OrdersResponse>(
    hasShopify ? '/api/orders?limit=10' : null,
    fetcher,
    { refreshInterval: 300_000, revalidateOnFocus: false },
  )

  const isLoading = loadingOpen || loadingClosed
  const openCount = openThreads.length

  // Single combined list — re-used by every cross-status derivation below.
  const allThreads = useMemo(() => openThreads.concat(closedThreads), [openThreads, closedThreads])

  // Per-customer thread counts — drives both VIP queue + repeat-customer panel.
  const customerCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of allThreads) m.set(t.customerId, (m.get(t.customerId) ?? 0) + 1)
    return m
  }, [allThreads])

  // ── Overnight cleared (last 24h, AI-resolved) ──────────────────────────────
  const overnight = useMemo(() => {
    const cutoff = Date.now() - DAY_MS
    const cleared: Thread[] = []
    let replies = 0
    const channelNames = new Set<string>()
    for (const t of allThreads) {
      const msg = t.messages[0]
      if (!msg) continue
      const sentAt = new Date(msg.sentAt).getTime()
      if (sentAt >= cutoff && (msg.senderType === SENDER_TYPE.AGENT || msg.senderType === SENDER_TYPE.AI)) {
        replies++
      }
      if (
        t.status === 'closed' &&
        msg.senderType === SENDER_TYPE.AI &&
        new Date(t.updatedAt).getTime() >= cutoff
      ) {
        cleared.push(t)
        channelNames.add(getChannelInfo(t.channelType).name)
      }
    }
    return { cleared, replies, channelNames: Array.from(channelNames) }
  }, [allThreads])

  const overnightClearedCount = overnight.cleared.length
  const repliesSent24h = overnight.replies
  const briefingChannels = overnight.channelNames
  const timeSavedHours = (overnightClearedCount * MINUTES_SAVED_PER_AUTO_TICKET) / 60

  const clearedTopics = useMemo<ClearedTopic[]>(() => {
    const counts: Record<string, number> = {}
    for (const t of overnight.cleared) {
      const tag = t.tag ?? "General"
      counts[tag] = (counts[tag] ?? 0) + 1
    }
    return Object.entries(counts)
      .map(([tag, count]) => ({ tag, count, subtitle: TAG_SUBTITLES[tag] ?? "auto-resolved" }))
      .sort((a, b) => b.count - a.count)
  }, [overnight.cleared])

  // ── Needs-you queue ────────────────────────────────────────────────────────
  const needsYouAll = useMemo(
    () => openThreads.filter(t => currentPlanForThread(t) !== null),
    [openThreads],
  )
  const needsYouCount = needsYouAll.length
  const needsYouItems = useMemo<NeedsYouItem[]>(
    () => needsYouAll.slice(0, 5).map(t => {
      const channel = getChannelInfo(t.channelType)
      const plan = currentPlanForThread(t)
      const firstMessage = t.messages[0]?.contentText ?? null
      const copy = buildPlanPreview(plan, t.aiSummary, firstMessage)
      const classification = classifyHomePlan(plan)
      return {
        threadId: t.id,
        kind: classification.kind,
        customerName: getCustomerName(t.customer),
        channelName: channel.name,
        timeAgo: timeAgoShort(t.messages[0]?.sentAt ?? t.updatedAt),
        headline: copy.headline,
        contextLine: copy.context,
        proposalSummary: copy.proposal,
        replyText: classification.replyText,
        orderRef: copy.orderRef,
        tag: t.tag,
      }
    }),
    [needsYouAll],
  )

  // ── Sparklines + week chart (single walk producing 3 daily series) ─────────
  const days = useMemo(() => lastNDays(7), [])

  const series = useMemo(() => {
    const newThreads: Record<string, number> = {}
    const aiResolved: Record<string, number> = {}
    const totalReplies: Record<string, number> = {}
    for (const d of days) {
      newThreads[d] = 0
      aiResolved[d] = 0
      totalReplies[d] = 0
    }

    for (const t of allThreads) {
      const created = dayKey(new Date(t.createdAt))
      if (created in newThreads) newThreads[created]++

      const msg = t.messages[0]
      if (!msg) continue
      if (msg.senderType === SENDER_TYPE.AGENT || msg.senderType === SENDER_TYPE.AI) {
        const sent = dayKey(new Date(msg.sentAt))
        if (sent in totalReplies) totalReplies[sent]++
      }
      if (t.status === 'closed' && msg.senderType === SENDER_TYPE.AI) {
        const closed = dayKey(new Date(t.updatedAt))
        if (closed in aiResolved) aiResolved[closed]++
      }
    }

    return {
      newThreadsByDay: days.map(d => newThreads[d]),
      aiResolvedByDay: days.map(d => aiResolved[d]),
      totalRepliesByDay: days.map(d => totalReplies[d]),
    }
  }, [days, allThreads])

  const yourWeek = useMemo(
    () => days.map((d, i) => ({
      label: new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' }),
      auto: series.aiResolvedByDay[i],
      manual: Math.max(0, series.totalRepliesByDay[i] - series.aiResolvedByDay[i]),
    })),
    [days, series],
  )

  const weeklyVolume = series.newThreadsByDay.reduce((s, n) => s + n, 0)

  const openDelta = useMemo(() => {
    const arr = series.newThreadsByDay
    if (arr.length < 2) return null
    return arr[arr.length - 1] - arr[arr.length - 2]
  }, [series])

  // ── Today's shape ──────────────────────────────────────────────────────────
  const refundsPending = openThreads.filter(t => t.tag === "Returns").length

  const ordersToShip = useMemo(() => {
    if (!ordersData?.orders) return null
    return ordersData.orders.filter(o => o.fulfillment_status == null && o.financial_status === 'paid').length
  }, [ordersData])

  const vipsInQueue = useMemo(
    () => openThreads.filter(t => (customerCounts.get(t.customerId) ?? 0) >= 3).length,
    [openThreads, customerCounts],
  )

  // ── Repeat customers (≥3 threads in 30d) ───────────────────────────────────
  const repeatCustomers = useMemo<RepeatCustomer[]>(() => {
    const cutoff = Date.now() - 30 * DAY_MS
    const recent = new Map<string, { customer: Thread['customer']; count: number }>()
    for (const t of allThreads) {
      if (new Date(t.updatedAt).getTime() < cutoff) continue
      const e = recent.get(t.customerId)
      if (e) e.count++
      else recent.set(t.customerId, { customer: t.customer, count: 1 })
    }
    return Array.from(recent.values())
      .filter(e => e.count >= 3)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)
      .map(e => {
        const name = getCustomerName(e.customer)
        return { customerId: e.customer.id, name, initials: initialsOf(name), ticketCount: e.count }
      })
  }, [allThreads])

  const todaysOrders = useMemo(() => {
    if (!ordersData?.orders) return []
    return ordersData.orders.slice(0, 5).map(o => {
      const li = o.line_items[0]
      const summary = li ? `${li.title}${li.variant_title ? ` — ${li.variant_title}` : ''}` : ''
      const status: 'ship' | 'refund' = o.financial_status === 'refunded' || o.financial_status === 'partially_refunded' ? 'refund' : 'ship'
      return {
        id: o.id,
        name: o.name,
        customerName: o.customer?.name || 'Guest',
        summary,
        status,
        amount: status === 'refund' ? o.total_price : null,
      }
    })
  }, [ordersData])

  // ── Workflow setup ─────────────────────────────────────────────────────────
  const hasKbArticle = (kbData?.knowledgeBases ?? []).some(kb => kb.articles.length > 0)
  const hasVerifiedPhone = phoneData?.phoneVerified ?? false
  const hasInvitedTeam = (memberships?.data?.length ?? 1) > 1
  const hasMultipleChannels = integrations.length > 1
  const hasSentReply =
    openThreads.some(t => t.messages[0]?.senderType === SENDER_TYPE.AGENT || t.messages[0]?.senderType === SENDER_TYPE.AI) ||
    closedThreads.some(t => t.messages[0]?.senderType === SENDER_TYPE.AGENT || t.messages[0]?.senderType === SENDER_TYPE.AI)
  const hasConfiguredAgent = useMemo(() => {
    const s = orgData?.settings ?? {}
    return !!(
      (s.aiContext && s.aiContext.trim().length > 0) ||
      (s.brandVoice && s.brandVoice.trim().length > 0) ||
      (s.agentName && s.agentName !== AGENT_SETTINGS_DEFAULTS.agentName)
    )
  }, [orgData])

  const workflowSteps = useMemo(() => [
    { label: "Connect a channel", href: "/dashboard/settings?tab=integrations", status: (channelConnected ? "done" : "pending") as "done" | "pending" },
    { label: "Connect Shopify", href: "/dashboard/integrations", status: (hasShopify ? "done" : "pending") as "done" | "pending" },
    { label: "Configure agent", href: "/dashboard/settings?tab=agent", status: (hasConfiguredAgent ? "done" : "pending") as "done" | "pending" },
    { label: "Add knowledge base content", href: "/dashboard/kb", status: (hasKbArticle ? "done" : "pending") as "done" | "pending" },
    { label: "Send your first reply", href: "/dashboard/tickets", status: (hasSentReply ? "done" : "pending") as "done" | "pending" },
    { label: "Invite team members", href: "/dashboard/team", status: (hasInvitedTeam ? "done" : "pending") as "done" | "pending" },
    { label: "Verify phone for notifications", href: "/dashboard/team", status: (hasVerifiedPhone ? "done" : "pending") as "done" | "pending" },
    { label: "Add more channels", href: "/dashboard/settings?tab=integrations", status: (hasMultipleChannels ? "done" : "pending") as "done" | "pending" },
  ], [channelConnected, hasShopify, hasConfiguredAgent, hasKbArticle, hasSentReply, hasInvitedTeam, hasVerifiedPhone, hasMultipleChannels])
  const workflowDoneCount = workflowSteps.filter(s => s.status === "done").length

  const agentName = (orgData?.settings?.agentName ?? AGENT_SETTINGS_DEFAULTS.agentName) as string
  const refreshOpenThreads = useCallback(() => {
    void mutateOpenThreads()
  }, [mutateOpenThreads])

  return {
    isLoading,
    openCount,
    openDelta,
    weeklyVolume,
    firstReplyMinutes: analyticsData?.firstReply?.avgMinutes ?? null,
    autoResolvedPct: analyticsData?.aiUsage?.aiReplyPct ?? null,
    repliesSent24h,
    overnightClearedCount,
    needsYouCount,
    needsYouItems,
    clearedTopics,
    briefingChannels,
    timeSavedHours,
    newThreadsByDay: series.newThreadsByDay,
    aiResolvedByDay: series.aiResolvedByDay,
    totalRepliesByDay: series.totalRepliesByDay,
    yourWeek,
    refundsPending,
    ordersToShip,
    vipsInQueue,
    repeatCustomers,
    todaysOrders,
    hasShopify,
    workflowSteps,
    workflowDoneCount,
    agentName,
    refreshOpenThreads,
  }
}
