import { useCallback, useMemo } from "react"
import useSWR from "swr"
import { AGENT_SETTINGS_DEFAULTS } from "@shopkeeper/agent/settings"
import { fetcher } from "@/lib/api/fetcher"
import {
  HOME_SUMMARY_REFRESH_INTERVAL_MS,
  createEmptyHomeSummary,
  type HomeChannelState,
  type HomeSummary,
} from "@/lib/home/summary-contract"
import { buildHomeSummaryView } from "@/lib/home/summary-view"
import { selectWalkthroughItems } from "@/lib/home/walkthrough"
import { CHANNEL_TYPE } from "@shopkeeper/agent/thread-constants"
import { useIntegrations } from "@/hooks/useIntegrations"
import { useOperatorChannels } from "@/hooks/useOperatorChannels"
import { isEmailIntegrationConfigured } from "@/lib/integrations/onboarding-setup"
import { isShopifyIntegrationActive } from "@/lib/integrations/shopify-connection"

export function useHomeData(
  initialHomeSummary?: HomeSummary,
  agentName?: string,
  initialChannelState?: HomeChannelState,
) {
  const {
    data: summaryData,
    isLoading: isSummaryLoading,
    mutate: mutateSummary,
  } = useSWR<HomeSummary>(
    "/api/home-summary",
    fetcher,
    {
      refreshInterval: HOME_SUMMARY_REFRESH_INTERVAL_MS,
      ...(initialHomeSummary ? { fallbackData: initialHomeSummary } : {}),
    },
  )
  const { data: integrationsData } = useIntegrations()
  const { anyBound, isLoading: isOperatorChannelsLoading } = useOperatorChannels()

  // Until each fetch lands, answer from the server-rendered seed rather than
  // from "nothing loaded yet" — the two read the same rows, so the banners that
  // depend on them render their final state on the first paint.
  const integrations = integrationsData ?? []
  const hasIntegrations = integrationsData != null
  const emailIntegration = integrations.find(integration => integration.platform === CHANNEL_TYPE.EMAIL)

  const hasShopify = hasIntegrations
    ? integrations.some(integration =>
        integration.platform === CHANNEL_TYPE.SHOPIFY && isShopifyIntegrationActive(integration),
      )
    : initialChannelState?.hasShopify ?? false
  const hasEmailForwarding = hasIntegrations
    ? isEmailIntegrationConfigured(emailIntegration)
    : initialChannelState?.hasEmailForwarding ?? false
  const hasInstagram = hasIntegrations
    ? integrations.some(integration => integration.platform === CHANNEL_TYPE.IG_DM)
    : initialChannelState?.hasInstagram ?? false
  const hasPhoneBound = isOperatorChannelsLoading
    ? initialChannelState?.hasPhoneBound ?? false
    : anyBound

  // Until the first fetch lands there is no summary — render it as pending rather
  // than letting the empty placeholder speak as if it were the real answer.
  const hasSummary = summaryData != null
  const summary = summaryData ?? createEmptyHomeSummary()
  const isInitialSummaryLoading = isSummaryLoading && !hasSummary
  const home = useMemo(() => buildHomeSummaryView(summary), [summary])
  const walkthroughItems = useMemo(
    () => selectWalkthroughItems(summary.needsAttention),
    [summary],
  )
  const walkthroughCount = walkthroughItems.length

  const ordersToShip = summary.ordersToShip

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

  const resolvedAgentName = agentName ?? AGENT_SETTINGS_DEFAULTS.agentName
  const refreshHomeSummary = useCallback(() => {
    void mutateSummary()
  }, [mutateSummary])

  return {
    ...home,
    walkthroughItems,
    walkthroughCount,
    ordersToShip,
    hasShopify,
    hasEmailForwarding,
    hasInstagram,
    hasPhoneBound,
    workflowSteps,
    agentName: resolvedAgentName,
    isSummaryPending: isInitialSummaryLoading,
    refreshHomeSummary,
  }
}
