"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowRight, ExternalLink, MessageSquare } from "lucide-react"
import useSWR from "swr"
import { fetcher } from "@/lib/api/fetcher"
import type { Integration } from "@/types"
import { Switch } from "@/components/ui/switch"
import { isStorefrontChatEnabledForIntegration } from "@/lib/storefront-chat/enabled"
import { buildShopifyThemeEditorAppEmbedUrl } from "@/lib/storefront-chat/theme-editor"
import { ConfigureSection } from "./ConfigureSection"
import { PermissionRow } from "./PermissionRow"

export function ShopifyStorefrontChatSection({
  integration,
  shopifyClientId,
  storefrontChatGloballyEnabled,
  canManageWorkspace,
  onUpdateEnabled,
}: {
  integration: Integration
  shopifyClientId: string | null
  storefrontChatGloballyEnabled: boolean
  canManageWorkspace: boolean
  onUpdateEnabled: (enabled: boolean) => Promise<boolean>
}) {
  const serverEnabled = isStorefrontChatEnabledForIntegration(integration.metadata)
  const [enabled, setEnabled] = useState(serverEnabled)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data: readiness, error: readinessError, mutate: refreshReadiness } = useSWR<{
    canEnable: boolean
    checks: { id: string; ready: boolean; detail: string }[]
    lastConnectedAt: string | null
  }>("/api/integrations/shopify/storefront-chat", fetcher)

  useEffect(() => {
    setEnabled(serverEnabled)
  }, [serverEnabled, integration.id])

  const themeEditorUrl = shopifyClientId
    ? buildShopifyThemeEditorAppEmbedUrl(integration.externalAccountId, shopifyClientId)
    : null

  async function handleToggle(next: boolean) {
    if (!canManageWorkspace || saving) return
    if (next && !storefrontChatGloballyEnabled) return

    const previous = enabled
    setEnabled(next)
    setSaving(true)
    setError(null)
    const ok = await onUpdateEnabled(next)
    if (!ok) {
      setEnabled(previous)
      setError("Couldn't update storefront chat. Try again.")
    }
    setSaving(false)
    void refreshReadiness()
  }

  const toggleDisabled = !canManageWorkspace
    || saving
    || (!storefrontChatGloballyEnabled && !enabled)
    || (!enabled && !readiness?.canEnable)

  return (
    <ConfigureSection title="Storefront chat">
      <Link href="/dashboard/chat" className="flex items-center justify-between gap-3 px-4 py-4 transition-colors hover:bg-foreground/[0.03] sm:px-5">
        <div><p className="text-[13px] font-semibold">Customize chat</p><p className="mt-1 text-xs text-muted-foreground">Your branding, welcome message, and placement — with a live preview.</p></div>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
      {!storefrontChatGloballyEnabled && !enabled ? (
        <div className="px-4 py-3.5 text-xs leading-relaxed text-foreground/55">
          Storefront chat is not available for your workspace yet.
        </div>
      ) : null}
      <PermissionRow
        icon={MessageSquare}
        title="Enable storefront chat"
        description="Let shoppers ask questions from your Online Store. Replies land in Shopkeeper like any other channel."
        action={(
          <Switch
            checked={enabled}
            onChange={handleToggle}
            disabled={toggleDisabled}
            ariaLabel={enabled ? "Disable storefront chat" : "Enable storefront chat"}
          />
        )}
      />
      <div className="space-y-2 px-4 py-3.5 text-xs leading-relaxed text-foreground/65">
        {readiness ? (
          <ul className="space-y-1.5">
            {readiness.checks.map((check) => (
              <li key={check.id}>
                <span className={check.ready ? "text-green-700" : "text-amber-700"}>
                  {check.ready ? "✓ " : "• "}
                </span>
                {check.detail}
              </li>
            ))}
          </ul>
        ) : <p>{readinessError ? "Couldn't check setup. Try again." : "Checking chat setup…"}</p>}
        {readiness?.lastConnectedAt ? (
          <p>Last storefront connection: {new Date(readiness.lastConnectedAt).toLocaleString()}</p>
        ) : <p>No storefront connection recorded yet.</p>}
        <button type="button" onClick={() => void refreshReadiness()} className="font-semibold underline underline-offset-2">
          Check setup again
        </button>
      </div>
      {enabled ? (
        <div className="space-y-4 px-4 py-4 sm:px-5">
          <div>
            <p className="text-[13px] font-semibold text-foreground/85">Finish setup in Shopify</p>
            <ol className="mt-2 list-inside list-decimal space-y-1.5 text-[12.5px] leading-relaxed text-foreground/55">
              <li>
                Open your theme editor and turn on the{" "}
                <span className="font-medium text-foreground/75">Shopkeeper Chat</span> app embed.
              </li>
              <li>Save the theme so the chat bubble appears on your storefront.</li>
              <li>Open your live storefront and test a product question, an order verification code, and a reply from Shopkeeper.</li>
              <li>
                Turn off Shopify Inbox&apos;s storefront chat bubble so shoppers do not see two launchers.
              </li>
            </ol>
          </div>
          {themeEditorUrl ? (
            <a
              href={themeEditorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground/85 transition-colors hover:text-foreground"
            >
              Open theme editor
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : null}
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5 text-[12.5px] leading-relaxed text-amber-900/80">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-700/80" aria-hidden />
            <p>
              Shopify Inbox can show its own chat bubble on the storefront. Disable it in Shopify
              admin before going live, or shoppers may see duplicate chat buttons.
            </p>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="px-4 pb-3.5 text-xs text-red-600">{error}</p>
      ) : null}
    </ConfigureSection>
  )
}
