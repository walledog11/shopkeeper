import type { OrgSettings } from "@shopkeeper/agent/types"

export interface ShopifyPermissionRow {
  label: string
  enabled: boolean
  detail: string | null
}

/** What the agent may do in the store under these settings, as the merchant reads it. */
export function shopifyPermissionRows(settings: OrgSettings): ShopifyPermissionRow[] {
  // A ceiling, not an approval threshold: nothing larger runs even when approved.
  const refundCap = settings.maxRefundAmount == null
    ? "No per-refund limit"
    : `Never more than $${settings.maxRefundAmount} per refund`
  const actions = settings.toolsEnabled.action

  return [
    { label: "Read orders, customers, products", enabled: true, detail: null },
    { label: "Issue refunds", enabled: actions, detail: actions ? refundCap : null },
    { label: "Cancel unfulfilled orders", enabled: actions && !settings.blockCancellations, detail: null },
    { label: "Add custom items to new orders", enabled: actions && !settings.blockCustomLineItems, detail: null },
  ]
}
