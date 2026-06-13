"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/ui/cn"
import type { PlatformConfig } from "@/lib/integrations/catalog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CardLogo } from "./IntegrationCardParts"
import { StatusPill } from "./StatusPill"
import type { PillState } from "./integration-card-types"
import { INTEGRATION_CONFIGURE_DIALOG_CLASS } from "./integration-card-styles"

export function IntegrationConfigureDialog({
  open,
  onOpenChange,
  config,
  statusState,
  statusLine,
  statusNote,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: PlatformConfig
  statusState?: PillState
  statusLine?: string | null
  statusNote?: boolean
  children: ReactNode
}) {
  const showStatusPill =
    statusState === "needs-attention" || statusState === "waiting"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={INTEGRATION_CONFIGURE_DIALOG_CLASS}>
        <DialogHeader className="gap-0">
          <div className="flex items-center gap-3 text-left pr-6">
            <CardLogo config={config} />
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <DialogTitle className="text-base font-semibold text-popover-foreground">{config.name}</DialogTitle>
                {showStatusPill && <StatusPill state={statusState} />}
              </div>
              {statusLine && (
                <DialogDescription className={cn("text-xs text-muted-foreground", statusNote && "text-amber-400/90")}>
                  {statusLine}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5">{children}</div>
      </DialogContent>
    </Dialog>
  )
}
