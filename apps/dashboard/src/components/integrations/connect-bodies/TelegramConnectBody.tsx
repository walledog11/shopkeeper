"use client"

import { ExternalLink, Loader2 } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { ConfigureSection } from "../ConfigureSection"

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
