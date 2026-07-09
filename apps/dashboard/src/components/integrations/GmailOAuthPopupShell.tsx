"use client"

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { PLATFORM_CONFIG } from "@/lib/integrations/catalog"
import type { OAuthPopupVisualState } from "@/lib/integrations/oauth-popup-shell"
import { cn } from "@/lib/ui/cn"
import { CardLogo } from "./IntegrationCardParts"
import { GmailConfigureSkeleton } from "./GmailConfigureSkeleton"
import { INTEGRATION_CONFIGURE_DIALOG_CLASS } from "./integration-card-styles"

const GMAIL_CONFIG = PLATFORM_CONFIG.find((config) => config.id === "gmail")!

export function GmailOAuthPopupShell({
  state,
  title,
  message,
  footer,
}: {
  state: OAuthPopupVisualState
  title: string
  message: string
  footer?: string
}) {
  const showOverlay = state === "loading" || Boolean(title)

  return (
    <div
      className={cn(
        INTEGRATION_CONFIGURE_DIALOG_CLASS,
        "relative mx-auto w-full max-w-[420px] shadow-lg",
      )}
    >
      <div className="flex items-center gap-3 pr-6 text-left">
        <CardLogo config={GMAIL_CONFIG} />
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold text-popover-foreground">{GMAIL_CONFIG.name}</h1>
        </div>
      </div>

      <GmailConfigureSkeleton />

      {showOverlay ? (
        <div
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center rounded-2xl px-6 text-center",
            "bg-background/75 backdrop-blur-[2px]",
          )}
          aria-live="polite"
        >
          <div
            className={cn(
              "mb-4 flex size-14 items-center justify-center rounded-2xl",
              state === "success" && "bg-emerald-400/10 text-emerald-400",
              state === "error" && "bg-red-400/10 text-red-400",
              state === "loading" && "bg-muted text-muted-foreground",
            )}
          >
            {state === "success" ? (
              <CheckCircle2 className="size-7" aria-hidden />
            ) : state === "error" ? (
              <AlertCircle className="size-7" aria-hidden />
            ) : (
              <Loader2 className="size-7 animate-spin text-primary" aria-hidden />
            )}
          </div>

          <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
          <p className="mt-2 max-w-[16rem] text-sm leading-relaxed text-muted-foreground">{message}</p>
          {footer ? (
            <p className="mt-4 text-xs text-muted-foreground/70">{footer}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
