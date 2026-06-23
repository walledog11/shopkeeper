"use client"

import { useState } from "react"
import { BookOpen, Check, Copy, ExternalLink, Loader2 } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/ui/cn"
import { ConfigureSection } from "./ConfigureSection"

export function EmailRailStatus({ providerLabel }: { providerLabel: string }) {
  return (
    <div className="rounded-md border border-foreground/[0.06] bg-foreground/[0.015] px-3.5 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-emerald-400" />
        <span className="text-xs font-medium text-foreground/70">Sending</span>
        <span className="text-xs text-foreground/40">Connected via {providerLabel}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-amber-400" />
        <span className="text-xs font-medium text-foreground/70">Receiving</span>
        <span className="text-xs text-foreground/40">Forwarding required</span>
      </div>
      <p className="text-xs text-foreground/30 leading-relaxed">
        {providerLabel} sign-in lets Shopkeeper send replies. Until native inbox sync ships,
        forward your support inbox to the address below so incoming mail becomes tickets.
      </p>
    </div>
  )
}

export function InstagramConnectBody({ isConnected }: { isConnected: boolean }) {
  return (
    <div className="space-y-3">
      {!isConnected && (
        <div className="space-y-2">
          <p className="text-xs text-foreground/40 leading-relaxed">
            Connect your Instagram Business account to manage DMs alongside every other channel.
          </p>
          <ol className="text-xs text-foreground/30 space-y-1 list-decimal list-inside leading-relaxed">
            <li>Make sure your Instagram is linked to a Facebook Business Page</li>
            <li>Click Connect below and authorize Shopkeeper via Meta OAuth</li>
            <li>DMs will start appearing as tickets immediately</li>
          </ol>
        </div>
      )}
      <form action="/api/integrations/instagram/auth" method="post">
        <Button type="submit" size="sm" className="h-9 px-4 font-medium">
          {isConnected ? "Reconnect" : "Connect with Instagram"}
        </Button>
      </form>
    </div>
  )
}

export function TelegramConnectBody({
  botUsername,
  connecting,
  connectUrl,
  disabled,
  onConnect,
}: {
  botUsername: string | null
  connecting: boolean
  connectUrl: string | null
  disabled?: boolean
  onConnect: () => void
}) {
  const botLabel = botUsername ? `@${botUsername.replace(/^@+/, "")}` : "the Shopkeeper bot"

  return (
    <div className="space-y-3">
      {!connectUrl && (
        <>
          <div className="space-y-2">
            <p className="text-xs text-foreground/40 leading-relaxed">
              Link Telegram to approve agent replies and receive ticket digests on your phone.
            </p>
            <ol className="text-xs text-foreground/30 space-y-1 list-decimal list-inside leading-relaxed">
              <li>Click Connect below — opens a chat with {botLabel}</li>
              <li>Tap Start in Telegram to link this device</li>
              <li>Reply to digests or send instructions from there</li>
            </ol>
          </div>
          <Button
            size="sm"
            disabled={disabled || connecting}
            onClick={onConnect}
            className="h-9 px-4 font-medium"
          >
            {connecting ? <Loader2 className="size-3.5 animate-spin" /> : "Connect Telegram"}
          </Button>
        </>
      )}
      {connectUrl && (
        <ConfigureSection title="Connect">
          <div className="px-4 py-4 flex flex-col items-center gap-3">
            <div className="rounded-lg bg-white p-2 shadow-sm">
              <QRCodeSVG
                value={connectUrl}
                size={176}
                level="M"
                marginSize={2}
                title="Telegram connect QR code"
              />
            </div>
            <a
              href={connectUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-foreground/[0.14] bg-foreground/[0.06] px-3 text-sm font-medium text-foreground/85 transition-colors hover:bg-foreground/[0.10]"
            >
              <ExternalLink className="size-4" />
              Open Telegram
            </a>
          </div>
        </ConfigureSection>
      )}
    </div>
  )
}

export function ShopifyConnectBody({
  isConnected,
  shop,
  setShop,
  loading,
  onConnect,
}: {
  isConnected: boolean
  shop: string
  setShop: (v: string) => void
  loading: boolean
  onConnect: () => void
}) {
  return (
    <div className="space-y-3">
      {!isConnected && (
        <div className="space-y-2">
          <p className="text-xs text-foreground/40 leading-relaxed">
            Sync customer orders, returns, and Shopify Inbox messages directly into Shopkeeper.
          </p>
          <ol className="text-xs text-foreground/30 space-y-1 list-decimal list-inside leading-relaxed">
            <li>Enter your <span className="font-mono text-foreground/45">.myshopify.com</span> store domain below</li>
            <li>You&apos;ll be redirected to Shopify to authorize Shopkeeper</li>
            <li>Order data and messages will sync automatically</li>
          </ol>
        </div>
      )}
      {!isConnected && (
        <div className="flex gap-2">
          <Input aria-label="mystore.myshopify.com"
            type="text"
            placeholder="mystore.myshopify.com"
            value={shop}
            onChange={(e) => setShop(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onConnect() }}
            className="h-9 text-sm"
          />
          <Button
            size="sm"
            disabled={!shop.trim() || loading}
            onClick={onConnect}
            className="shrink-0 h-9 px-4 font-medium"
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : "Connect"}
          </Button>
        </div>
      )}
    </div>
  )
}

function ImessageDeliverabilityNote() {
  return (
    <div className="rounded-md border border-foreground/[0.06] bg-foreground/[0.015] px-3.5 py-3 space-y-1.5">
      <p className="text-xs text-foreground/45 leading-relaxed">
        iMessage is inbound-first — Shopkeeper only replies inside conversations a
        customer starts. It never sends cold or proactive messages.
      </p>
      <p className="text-xs text-foreground/30 leading-relaxed">
        A dedicated Business line is recommended so your number stays consistent.
        Apple caps new conversations at ~50 per line per day.
      </p>
    </div>
  )
}

export function ImessageConnectBody({
  onConnect,
}: {
  onConnect: (creds: { projectId: string; projectSecret: string; webhookSecret: string }) => Promise<boolean>
}) {
  const [projectId, setProjectId] = useState("")
  const [projectSecret, setProjectSecret] = useState("")
  const [webhookSecret, setWebhookSecret] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const canSubmit =
    !!projectId.trim() && !!projectSecret.trim() && !!webhookSecret.trim() && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await onConnect({
        projectId: projectId.trim(),
        projectSecret: projectSecret.trim(),
        webhookSecret: webhookSecret.trim(),
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-xs text-foreground/40 leading-relaxed">
          Connect a Photon Spectrum project to handle iMessage. Find these under your
          Spectrum project settings.
        </p>
        <ol className="text-xs text-foreground/30 space-y-1 list-decimal list-inside leading-relaxed">
          <li>Create a Spectrum project with a provisioned iMessage line</li>
          <li>Paste the project ID and secrets below</li>
          <li>After connecting, copy the webhook URL into Spectrum&apos;s settings</li>
        </ol>
      </div>
      <div className="space-y-2">
        <Input
          aria-label="Project ID"
          type="text"
          placeholder="Project ID"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="h-9 text-sm"
        />
        <Input
          aria-label="Project secret"
          type="password"
          placeholder="Project secret"
          value={projectSecret}
          onChange={(e) => setProjectSecret(e.target.value)}
          className="h-9 text-sm"
        />
        <Input
          aria-label="Webhook secret"
          type="password"
          placeholder="Webhook secret"
          value={webhookSecret}
          onChange={(e) => setWebhookSecret(e.target.value)}
          className="h-9 text-sm"
        />
      </div>
      <Button
        size="sm"
        disabled={!canSubmit}
        onClick={handleSubmit}
        className="h-9 px-4 font-medium"
      >
        {submitting ? <Loader2 className="size-3.5 animate-spin" /> : "Connect"}
      </Button>
      <ImessageDeliverabilityNote />
    </div>
  )
}

export function ImessageWebhookPanel({ webhookUrl }: { webhookUrl: string | null }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (!webhookUrl) return
    try {
      await navigator.clipboard.writeText(webhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be unavailable (insecure context) — the URL is still shown.
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground/60">Webhook URL</p>
      <p className="text-xs text-foreground/35 leading-relaxed">
        Paste this into your Spectrum project&apos;s webhook settings so inbound
        iMessages reach Shopkeeper.
      </p>
      {webhookUrl ? (
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-md border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-2 text-xs font-mono text-foreground/70">
            {webhookUrl}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy webhook URL"
            className="shrink-0 inline-flex items-center justify-center h-9 px-3 rounded-md border border-foreground/[0.08] text-foreground/60 hover:text-foreground/90 hover:bg-foreground/[0.04] transition-colors"
          >
            {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
          </button>
        </div>
      ) : (
        <p className="text-xs text-amber-400/80 leading-relaxed">
          Webhook URL unavailable — the gateway URL isn&apos;t configured.
        </p>
      )}
      <ImessageDeliverabilityNote />
    </div>
  )
}

export function SyncToKbLink({
  syncing,
  result,
  onSync,
}: {
  syncing: boolean
  result: string | null
  onSync: () => void
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={syncing}
        onClick={onSync}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground/40 hover:text-foreground/70 transition-colors disabled:opacity-50"
      >
        {syncing
          ? <><Loader2 className="size-3.5 animate-spin" />Syncing…</>
          : <><BookOpen className="size-3.5" />Sync to KB</>
        }
      </button>
      {result && (
        <span className={cn(
          "text-xs",
          result.startsWith("Sync failed") ? "text-red-400" : "text-emerald-400",
        )}>
          {result}
        </span>
      )}
    </div>
  )
}
