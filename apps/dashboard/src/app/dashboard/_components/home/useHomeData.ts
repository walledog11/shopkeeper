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
import { selectWalkthroughItems } from "@/lib/home/walkthrough"
import { CHANNEL_TYPE } from "@shopkeeper/agent/thread-constants"
import { useOrg } from "@/hooks/useOrg"
import { useIntegrations } from "@/hooks/useIntegrations"
import { isShopifyIntegrationActive } from "@/lib/integrations/shopify-connection"
import type { KnowledgeBase } from "@/types"

interface OrdersResponse {
  orders: Array<{
    fulfillment_status: string | null
    financial_status: string
  }>
}

interface Options {
  initialSummary: HomeSummary
}

export function useHomeData({ initialSummary }: Options) {
  const { data: summaryData, mutate: mutateSummary } = useSWR<HomeSummary>(
    "/api/home-summary",
    fetcher,
    {
      fallbackData: initialSummary,
      refreshInterval: HOME_SUMMARY_REFRESH_INTERVAL_MS,
    },
  )
  const { data: integrations = [] } = useIntegrations()
  const { data: orgData } = useOrg()
  const { data: kbData } = useSWR<{ knowledgeBases: KnowledgeBase[] }>("/api/kb", fetcher, { revalidateOnFocus: false })
  const { data: telegramData } = useSWR<{ connected: boolean; botUsername: string | null }>("/api/integrations/telegram", fetcher, { revalidateOnFocus: false })
  const { memberships } = useOrganization({ memberships: { infinite: false, pageSize: 10 } })

  const channelConnected = integrations.length > 0
  const hasShopify = integrations.some(integration =>
    integration.platform === CHANNEL_TYPE.SHOPIFY && isShopifyIntegrationActive(integration),
  )
  const summary = summaryData ?? createEmptyHomeSummary()
  const home = useMemo(() => buildHomeSummaryView(summary), [summary])
  const walkthroughItems = useMemo(
    () => selectWalkthroughItems(summary.needsAttention),
    [summary],
  )
  const walkthroughCount = walkthroughItems.length

  const { data: ordersData } = useSWR<OrdersResponse>(
    hasShopify ? "/api/orders?limit=10" : null,
    fetcher,
    { refreshInterval: 300_000, revalidateOnFocus: false },
  )

  const ordersToShip = useMemo(() => {
    if (!ordersData?.orders) return null
    return ordersData.orders.filter(order => order.fulfillment_status == null && order.financial_status === "paid").length
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
    { label: "Configure agent", href: "/dashboard/agent/configure", status: (hasConfiguredAgent ? "done" : "pending") as "done" | "pending" },
    { label: "Add memory notes", href: "/dashboard/kb", status: (hasKbArticle ? "done" : "pending") as "done" | "pending" },
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
    ...home,
    walkthroughItems,
    walkthroughCount,
    ordersToShip,
    hasShopify,
    workflowSteps,
    workflowDoneCount,
    agentName,
    refreshHomeSummary,
  }
}
