"use client"

import { resolveAgentSettings } from "@shopkeeper/agent/settings"
import { useOrg } from "@/hooks/useOrg"
import type { OrgSettings } from "@/types"
import { PermissionToggleRow } from "./PermissionToggleRow"

export function ShopifyPermissionRows() {
  const { data, mutate } = useOrg({ enabled: true })
  const settings = resolveAgentSettings(data?.settings)
  const refundCap = settings.maxRefundAmount == null ? null : `auto-approve up to $${settings.maxRefundAmount}`

  async function patch(partial: Partial<OrgSettings>) {
    await fetch("/api/org", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: partial }),
    })
    await mutate()
  }

  return (
    <>
      <PermissionToggleRow
        label="Read orders, customers, products"
        required
        checked
        onChange={() => { /* required */ }}
      />
      <PermissionToggleRow
        label="Issue refunds"
        suffix={settings.toolsEnabled.action ? refundCap : null}
        checked={settings.toolsEnabled.action}
        onChange={(v) => { void patch({ toolsEnabled: { ...settings.toolsEnabled, action: v } }) }}
      />
      <PermissionToggleRow
        label="Cancel unfulfilled orders"
        checked={settings.toolsEnabled.action && !settings.blockCancellations}
        onChange={(v) => { void patch({ blockCancellations: !v }) }}
      />
      <PermissionToggleRow
        label="Modify line items & discounts"
        checked={settings.toolsEnabled.action && !settings.blockCustomLineItems}
        onChange={(v) => { void patch({ blockCustomLineItems: !v }) }}
      />
    </>
  )
}
