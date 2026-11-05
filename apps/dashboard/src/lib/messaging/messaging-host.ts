import type { MessagingHost } from "@shopkeeper/messaging"
import { captureDashboardOutboundReplySent } from "@/lib/server/product-analytics"
import { recordInstagramSendFailure } from "./provider-send-failures"

// The dashboard's alerting and analytics for the sends it makes itself.
export const dashboardMessagingHost: MessagingHost = {
  recordInstagramSendFailure,
  captureReplySent: captureDashboardOutboundReplySent,
}
