"use client"

import type { ReactNode } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/ui/cn"

interface DashboardDetailDialogProps {
  open: boolean
  title: string
  maxWidthClassName: string
  onClose: () => void
  children: ReactNode
}

const DETAIL_DIALOG_CLASS_NAME = "flex h-[86vh] w-[calc(100%-2rem)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border-border bg-background p-0 shadow-xl"

export function DashboardDetailDialog({
  open,
  title,
  maxWidthClassName,
  onClose,
  children,
}: DashboardDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <DialogContent
        showCloseButton
        className={cn(DETAIL_DIALOG_CLASS_NAME, maxWidthClassName)}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  )
}
