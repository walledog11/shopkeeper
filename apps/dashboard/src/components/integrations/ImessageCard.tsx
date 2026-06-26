"use client"

import { useState } from "react"
import useSWR from "swr"
import { cn } from "@/lib/ui/cn"
import { fetcher } from "@/lib/api/fetcher"
import type { PlatformConfig } from "@/lib/integrations/catalog"
import {
  CARD_BUTTON_DISABLED,
  CARD_BUTTON_PRIMARY,
  CARD_BUTTON_SECONDARY,
  CARD_DESCRIPTION,
  CARD_SHELL,
  CARD_TITLE,
} from "./integration-card-styles"
import { CardLogo } from "./IntegrationCardParts"
import { IntegrationConfigureDialog } from "./IntegrationConfigureDialog"
import { ImessageBindingSection } from "./connect-bodies"

interface ImessageBindStatus {
  lineConnected: boolean
  connected: boolean
  handles: { senderId: string; displayLabel: string; connectedAt: string }[]
}

// iMessage is an operator channel like Telegram: there is one Shopkeeper-owned
// platform line (configured via env), so there are no per-merchant credentials.
// The merchant just links their iPhone by texting a connect code. `handle` is the
// platform line the merchant texts; absent it, iMessage isn't available on this
// deployment.
export default function ImessageCard({
  config,
  handle,
}: {
  config: PlatformConfig
  handle: string | null
}) {
  const { data } = useSWR<ImessageBindStatus>('/api/integrations/imessage/bind', fetcher)
  const [open, setOpen] = useState(false)

  const handles = data?.handles ?? []
  const isConnected = handles.length > 0
  const isAvailable = Boolean(handle)

  const dialogStatusLine = isConnected
    ? handles.length === 1
      ? null
      : `${handles.length} iPhones linked`
    : config.description

  return (
    <>
      <div id={config.id} className={CARD_SHELL}>
        <CardLogo config={config} />

        <p className={cn("mt-4", CARD_TITLE)}>{config.name}</p>
        <p className={cn("mt-2 flex-1", CARD_DESCRIPTION)}>{config.description}</p>

        <div className="mt-4 flex gap-2">
          {!isConnected ? (
            isAvailable ? (
              <button type="button" onClick={() => setOpen(true)} className={CARD_BUTTON_PRIMARY}>Connect</button>
            ) : (
              <button
                type="button"
                disabled
                title="iMessage isn't configured on this deployment yet."
                className={CARD_BUTTON_DISABLED}
              >
                Connect
              </button>
            )
          ) : (
            <button type="button" onClick={() => setOpen(true)} className={CARD_BUTTON_SECONDARY}>Configure</button>
          )}
        </div>
      </div>

      <IntegrationConfigureDialog
        open={open}
        onOpenChange={setOpen}
        config={config}
        statusLine={dialogStatusLine}
      >
        <ImessageBindingSection handle={handle} />
      </IntegrationConfigureDialog>
    </>
  )
}
