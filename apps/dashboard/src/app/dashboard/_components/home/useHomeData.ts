import { useCallback, useMemo } from "react"
import useSWR from "swr"
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
import { useOperatorChannels } from "@/hooks/useOperatorChannels"
import { isEmailIntegrationConfigured } from "@/lib/integrations/onboarding-setup"
import { isShopifyIntegrationActive } from "@/lib/integrations/shopify-connection"

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
  const {
    data: summaryData,
    isLoading: isSummaryLoading,
    isValidating: isSummaryValidating,
    mutate: mutateSummary,
  } = useSWR<HomeSummary>(
    "/api/home-summary",
    fetcher,
    {
      fallbackData: initialSummary,
      refreshInterval: HOME_SUMMARY_REFRESH_INTERVAL_MS,
    },
  )
  const { data: integrations = [] } = useIntegrations()
  const { data: orgData } = useOrg()
  const { anyBound: hasPhoneBound } = useOperatorChannels()

  const hasShopify = integrations.some(integration =>
    integration.platform === CHANNEL_TYPE.SHOPIFY && isShopifyIntegrationActive(integration),
  )
  const emailIntegration = integrations.find(integration => integration.platform === CHANNEL_TYPE.EMAIL)
  const hasEmailForwarding = isEmailIntegrationConfigured(emailIntegration)

  const summary = summaryData ?? createEmptyHomeSummary()
  const isInitialSummaryLoading = isSummaryLoading || (summaryData === initialSummary && isSummaryValidating)
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

  const hasReceivedTicket = useMemo(() => (
    summary.metrics.openCount > 0
    || summary.metrics.hasSentReply
    || summary.metrics.weeklyVolume > 0
    || summary.needsAttention.length > 0
  ), [summary])

  const workflowSteps = useMemo(() => [
    { label: "Connect Shopify", href: "/dashboard/integrations", status: (hasShopify ? "done" : "pending") as "done" | "pending" },
    { label: "Set up email forwarding", href: "/dashboard/integrations", status: (hasEmailForwarding ? "done" : "pending") as "done" | "pending" },
    { label: "Connect your phone (optional)", href: "/dashboard/integrations", status: (hasPhoneBound ? "done" : "pending") as "done" | "pending", optional: true },
    { label: "Receive first ticket", href: "/dashboard/tickets", status: (hasReceivedTicket ? "done" : "pending") as "done" | "pending" },
    { label: "Send first reply", href: "/dashboard/tickets", status: (home.hasSentReply ? "done" : "pending") as "done" | "pending" },
  ], [
    hasShopify,
    hasEmailForwarding,
    hasPhoneBound,
    hasReceivedTicket,
    home.hasSentReply,
  ])

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
    hasPhoneBound,
    workflowSteps,
    agentName,
    isNeedsYouLoading: home.needsYouItems.length === 0 && isInitialSummaryLoading,
    refreshHomeSummary,
  }
}
