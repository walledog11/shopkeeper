"use client"

import Link from "next/link"
import { resolveAgentSettings } from "@shopkeeper/agent/settings"
import { useOrg } from "@/hooks/useOrg"
import type { OrgSettings } from "@/types"
import { PermissionToggleRow } from "./PermissionToggleRow"

export function ShopifyPermissionsPanel({ enabled }: { enabled: boolean }) {
  const { data, mutate } = useOrg({ enabled })
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

  if (!enabled) return null

  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] px-4 py-3">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-xs font-semibold text-white/30 uppercase tracking-widest">Permissions &amp; limits</p>
        <Link
          href="/dashboard/settings"
          className="text-xs font-medium text-white/30 hover:text-white/70 transition-colors"
        >
          Advanced settings →
        </Link>
      </div>
      <div className="divide-y divide-white/[0.05]">
        <PermissionToggleRow
          label="Read orders, customers, products"
          required
          checked={settings.toolsEnabled.read}
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
      </div>
    </div>
  )
}
