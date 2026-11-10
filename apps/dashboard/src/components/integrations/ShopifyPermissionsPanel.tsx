"use client"

import Link from "next/link"
import { Check, X } from "lucide-react"
import { resolveAgentSettings } from "@shopkeeper/agent/settings"
import { settingsSectionHref } from "@/app/dashboard/_components/nav-items"
import { useOrg } from "@/hooks/useOrg"
import { shopifyPermissionRows } from "@/lib/integrations/shopify-permissions"
import { PermissionRow } from "./PermissionRow"

function StatusBadge({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
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
  const rows = shopifyPermissionRows(resolveAgentSettings(data?.settings))

  return (
    <>
      {rows.map(row => (
        <PermissionRow
          key={row.label}
          icon={Check}
          title={row.label}
          description={row.detail ?? undefined}
          action={<StatusBadge enabled={row.enabled} />}
        />
      ))}
      <div className="border-t border-foreground/[0.06] px-4 py-3">
        <Link
          href={settingsSectionHref("approvals")}
          className="text-xs font-semibold text-amber-700 transition-colors hover:text-amber-800"
        >
          Change in Approvals & limits →
        </Link>
      </div>
    </>
  )
}
