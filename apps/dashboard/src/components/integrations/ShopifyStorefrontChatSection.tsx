"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import useSWR from "swr"
import { fetcher } from "@/lib/api/fetcher"
import type { Integration } from "@/types"
import type { StorefrontChatReadiness } from "@/lib/storefront-chat/readiness"
import { Switch } from "@/components/ui/switch"
import { isStorefrontChatEnabledForIntegration } from "@/lib/storefront-chat/enabled"
import { buildShopifyThemeEditorAppEmbedUrl } from "@/lib/storefront-chat/theme-editor"
import { ConfigureSection } from "./ConfigureSection"

export function ShopifyStorefrontChatSection({
  integration, shopifyClientId, storefrontChatGloballyEnabled, canManageWorkspace, onUpdateEnabled, onboarding = false,
}: {
  integration: Integration
  shopifyClientId: string | null
  storefrontChatGloballyEnabled: boolean
  canManageWorkspace: boolean
  onUpdateEnabled: (enabled: boolean) => Promise<boolean>
  onboarding?: boolean
}) {
  const serverEnabled = isStorefrontChatEnabledForIntegration(integration.metadata)
  const [enabled, setEnabled] = useState(serverEnabled)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data: readiness, error: readinessError, mutate } = useSWR<StorefrontChatReadiness>(
    onboarding ? "/api/integrations/shopify/storefront-chat" : null, fetcher,
  )
  useEffect(() => { setEnabled(serverEnabled) }, [serverEnabled, integration.id])

  async function handleToggle(next: boolean) {
    if (!canManageWorkspace || saving) return
    setSaving(true)
    setError(null)
    try {
      if (await onUpdateEnabled(next)) setEnabled(next)
      else setError("Couldn't update chat. Try again.")
    } catch {
      setError("Couldn't update chat. Try again.")
    } finally { setSaving(false) }
  }

  const themeUrl = shopifyClientId ? buildShopifyThemeEditorAppEmbedUrl(integration.externalAccountId, shopifyClientId) : null
  return <ConfigureSection title="Website chat">
    {onboarding ? <div className="space-y-3 px-4 py-4 sm:px-5">
      <div className="flex items-center justify-between gap-4">
        <div><p className="text-sm font-medium">Let customers chat on your store</p><p className="mt-1 text-xs text-muted-foreground">You can customize it after setup.</p></div>
        <Switch checked={enabled} onChange={handleToggle} ariaLabel="Enable website chat"
          disabled={!canManageWorkspace || saving || (!enabled && (!storefrontChatGloballyEnabled || !readiness?.canEnable))} />
      </div>
      {enabled && themeUrl && <a href={themeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium">
        Enable Shopkeeper Chat in your theme and save<ArrowUpRight className="size-3.5" />
      </a>}
      {!enabled && readiness && !readiness.canEnable && <p className="text-xs text-muted-foreground">You can finish chat setup later in Website chat.</p>}
      {readinessError && <p className="text-xs text-muted-foreground">Couldn&apos;t check setup. <button type="button" onClick={() => void mutate().catch(() => undefined)} className="underline">Try again</button></p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div> : <Link href="/dashboard/chat" className="flex items-center justify-between gap-3 px-4 py-4 transition-colors hover:bg-foreground/[0.03] sm:px-5">
      <div><p className="text-sm font-medium">Manage website chat</p><p className="mt-1 text-xs text-muted-foreground">Customize its appearance and finish setup in one place.</p></div>
      <ArrowRight className="size-4 shrink-0" aria-hidden />
    </Link>}
  </ConfigureSection>
}
