"use client"

import Link from "next/link"
import { Check, X } from "lucide-react"
import { resolveAgentSettings } from "@shopkeeper/agent/settings"
import { agentConfigureHref } from "@/lib/agent/configure"
import { useOrg } from "@/hooks/useOrg"
import { PermissionRow } from "./PermissionRow"

function StatusBadge({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300">
      <Check className="size-3.5" />
      On
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground/35">
      <X className="size-3.5" />
      Off
    </span>
  )
}

export function ShopifyPermissionRows() {
  const { data } = useOrg({ enabled: true })
  const settings = resolveAgentSettings(data?.settings)
  const refundCap = settings.maxRefundAmount == null ? null : `auto-approve up to $${settings.maxRefundAmount}`

  const rows = [
    {
      label: "Read orders, customers, products",
      enabled: true,
      required: true,
    },
    {
      label: "Issue refunds",
      enabled: settings.toolsEnabled.action,
      suffix: settings.toolsEnabled.action ? refundCap : null,
    },
    {
      label: "Cancel unfulfilled orders",
      enabled: settings.toolsEnabled.action && !settings.blockCancellations,
    },
    {
      label: "Modify line items & discounts",
      enabled: settings.toolsEnabled.action && !settings.blockCustomLineItems,
    },
  ] as const

  return (
    <>
      {rows.map(row => (
        <PermissionRow
          key={row.label}
          icon={Check}
          title={row.label}
          description={
            "required" in row && row.required
              ? "Required for Shopify integration"
              : "suffix" in row && row.suffix
                ? row.suffix
                : undefined
          }
          action={<StatusBadge enabled={row.enabled} />}
        />
      ))}
      <div className="border-t border-foreground/[0.06] px-4 py-3">
        <Link
          href={agentConfigureHref("autonomy")}
          className="text-xs font-semibold text-amber-300 transition-colors hover:text-amber-200"
        >
          Change in Configure →
        </Link>
      </div>
    </>
  )
}
