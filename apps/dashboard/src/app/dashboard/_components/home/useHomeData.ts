import { useCallback, useMemo } from "react"
import useSWR from "swr"
import { useOrganization } from "@clerk/nextjs"
import { AGENT_SETTINGS_DEFAULTS } from "@shopkeeper/agent/settings"
import { fetcher } from "@/lib/api/fetcher"
import {
  HOME_SUMMARY_REFRESH_INTERVAL_MS,
  createEmptyHomeSummary,
  type HomeSummary,
} from "@/lib/home/summary-contract"
import { buildHomeSummaryView } from "@/lib/home/summary-view"
import { CHANNEL_TYPE } from "@shopkeeper/agent/thread-constants"
import { useOrg } from "@/hooks/useOrg"
import type { Integration, KnowledgeBase } from "@/types"

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

interface Options {
  initialSummary: HomeSummary
}

export function useHomeData({ initialSummary }: Options) {
  const { data: summaryData, isLoading, mutate: mutateSummary } = useSWR<HomeSummary>(
    "/api/home-summary",
    fetcher,
    {
      fallbackData: initialSummary,
      refreshInterval: HOME_SUMMARY_REFRESH_INTERVAL_MS,
    },
  )
  const { data: integrations = [] } = useSWR<Integration[]>("/api/integrations", fetcher)
  const { data: orgData } = useOrg()
  const { data: kbData } = useSWR<{ knowledgeBases: KnowledgeBase[] }>("/api/kb", fetcher, { revalidateOnFocus: false })
  const { data: telegramData } = useSWR<{ connected: boolean }>("/api/integrations/telegram", fetcher, { revalidateOnFocus: false })
  const { memberships } = useOrganization({ memberships: { infinite: false, pageSize: 10 } })

  const channelConnected = integrations.length > 0
  const hasShopify = integrations.some(integration => integration.platform === CHANNEL_TYPE.SHOPIFY)
  const summary = summaryData ?? createEmptyHomeSummary()
  const home = useMemo(() => buildHomeSummaryView(summary), [summary])

  const { data: ordersData } = useSWR<OrdersResponse>(
    hasShopify ? "/api/orders?limit=10" : null,
    fetcher,
    { refreshInterval: 300_000, revalidateOnFocus: false },
  )

  const ordersToShip = useMemo(() => {
    if (!ordersData?.orders) return null
    return ordersData.orders.filter(order => order.fulfillment_status == null && order.financial_status === "paid").length
  }, [ordersData])

  const todaysOrders = useMemo(() => {
    if (!ordersData?.orders) return []
    return ordersData.orders.slice(0, 5).map((order) => {
      const lineItem = order.line_items[0]
      const summary = lineItem ? `${lineItem.title}${lineItem.variant_title ? ` , ${lineItem.variant_title}` : ""}` : ""
      const status: "ship" | "refund" =
        order.financial_status === "refunded" || order.financial_status === "partially_refunded" ? "refund" : "ship"
      return {
        id: order.id,
        name: order.name,
        customerName: order.customer?.name || "Guest",
        summary,
        status,
        amount: status === "refund" ? order.total_price : null,
      }
    })
  }, [ordersData])

  const hasKbArticle = (kbData?.knowledgeBases ?? []).some(kb => kb.articles.length > 0)
  const hasTelegramBound = telegramData?.connected ?? false
  const hasInvitedTeam = (memberships?.data?.length ?? 1) > 1
  const hasMultipleChannels = integrations.length > 1
  const hasConfiguredAgent = useMemo(() => {
    const settings = orgData?.settings ?? {}
    return !!(
      (settings.aiContext && settings.aiContext.trim().length > 0) ||
      (settings.brandVoice && settings.brandVoice.trim().length > 0) ||
      (settings.agentName && settings.agentName !== AGENT_SETTINGS_DEFAULTS.agentName)
    )
  }, [orgData])

  const workflowSteps = useMemo(() => [
    { label: "Connect a channel", href: "/dashboard/integrations", status: (channelConnected ? "done" : "pending") as "done" | "pending" },
    { label: "Connect Shopify", href: "/dashboard/integrations", status: (hasShopify ? "done" : "pending") as "done" | "pending" },
    { label: "Configure agent", href: "/dashboard/settings?tab=agent", status: (hasConfiguredAgent ? "done" : "pending") as "done" | "pending" },
    { label: "Add knowledge base content", href: "/dashboard/kb", status: (hasKbArticle ? "done" : "pending") as "done" | "pending" },
    { label: "Send your first reply", href: "/dashboard/tickets", status: (home.hasSentReply ? "done" : "pending") as "done" | "pending" },
    { label: "Invite team members", href: "/dashboard/team", status: (hasInvitedTeam ? "done" : "pending") as "done" | "pending" },
    { label: "Connect Telegram for notifications", href: "/dashboard/integrations", status: (hasTelegramBound ? "done" : "pending") as "done" | "pending" },
    { label: "Add more channels", href: "/dashboard/integrations", status: (hasMultipleChannels ? "done" : "pending") as "done" | "pending" },
  ], [
    channelConnected,
    hasShopify,
    hasConfiguredAgent,
    hasKbArticle,
    home.hasSentReply,
    hasInvitedTeam,
    hasTelegramBound,
    hasMultipleChannels,
  ])
  const workflowDoneCount = workflowSteps.filter(step => step.status === "done").length

  const agentName = (orgData?.settings?.agentName ?? AGENT_SETTINGS_DEFAULTS.agentName) as string
  const refreshHomeSummary = useCallback(() => {
    void mutateSummary()
  }, [mutateSummary])

  return {
    isLoading,
    ...home,
    ordersToShip,
    todaysOrders,
    hasShopify,
    workflowSteps,
    workflowDoneCount,
    agentName,
    refreshHomeSummary,
  }
}
