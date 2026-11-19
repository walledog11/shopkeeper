"use client"

import type { ReactNode } from "react"
import { ArrowLeft, CheckCircle2, Loader2, RotateCcw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/ui/cn"
import type { TicketCardMeta } from "@/components/support-card/metadata"
import { ChannelPill, CustomerIdentity, ticketTopicLabel } from "@/components/support-card/meta-pills"
import { RelativeTime } from "@/components/ui/relative-time"
import { merchantInkClass, merchantMutedClass, merchantSandInkHoverClass } from "@/lib/ui/merchant-palette"
import type { TicketCocoAction } from "../../_lib/resolve-ticket-coco-action"
import { TicketTimelineMenu } from "./TicketTimelineMenu"

interface Props {
  activeTab: "open" | "closed"
  cocoAction?: TicketCocoAction | null
  meta: TicketCardMeta
  onBack: () => void
  onCocoAction?: () => void
  onResolve: () => void
  onReopen: () => void
  onOpenContext?: () => void
  /** The customer's context row, set under the name. */
  context?: ReactNode
  threadId?: string
  embedded?: boolean
}

const COCO_ACTION_CLASS: Record<NonNullable<TicketCocoAction>["variant"], string> = {
  send: "bg-emerald-700 text-white hover:bg-emerald-700/90 hover:text-white",
  draft: merchantSandInkHoverClass,
  caution: "bg-amber-600 text-white hover:bg-amber-600/90 hover:text-white",
  neutral: merchantSandInkHoverClass,
  loading: "bg-white text-muted-foreground hover:bg-white hover:text-muted-foreground",
}

const headerButtonClassName = "h-8 rounded-xl px-3 text-xs font-semibold"

const META_SEPARATOR = <span aria-hidden> · </span>

function TicketMetaLine({ meta, className }: { meta: TicketCardMeta; className?: string }) {
  const topic = ticketTopicLabel(meta.tag === "General" ? null : meta.tag ?? null)
  return (
    <p className={cn("min-w-0 truncate text-xs", merchantMutedClass, className)}>
      {meta.orderRef ? <span className={cn("font-semibold tabular-nums", merchantInkClass)}>{meta.orderRef}</span> : null}
      {meta.orderRef && topic ? META_SEPARATOR : null}
      {topic}
      {meta.orderRef || topic ? META_SEPARATOR : null}
      <RelativeTime at={meta.lastMessageAt} className="tabular-nums" />
    </p>
  )
}

export default function ConversationHeader({
  activeTab,
  cocoAction,
  meta,
  onBack,
  onCocoAction,
  onResolve,
  onReopen,
  onOpenContext,
  context,
  threadId,
  embedded = false,
}: Props) {
  const BackIcon = embedded ? X : ArrowLeft
  const nameClassName = cn("truncate text-[15px] font-semibold leading-tight", merchantInkClass)
  const name = (
    <CustomerIdentity
      name={meta.customerName}
      isVip={meta.isVip}
      className={nameClassName}
      domainClassName={cn("font-medium", merchantMutedClass)}
    />
  )

  // One grid so the main action renders once: beside Close on a desktop, on
  // the meta line on a phone, where the name needs the first line's room.
  return (
    <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={embedded ? "Close conversation" : "Back"}
        className={cn(
          embedded ? "" : "md:hidden",
          "col-start-1 row-start-1 size-8 shrink-0 rounded-xl text-[#6b5d4f] hover:bg-foreground/[0.05] hover:text-[#1a1a1a]",
        )}
        onClick={onBack}
      >
        <BackIcon className="size-4" />
      </Button>

      {meta.channelName ? (
        <ChannelPill
          channelName={meta.channelName}
          className="col-start-2 row-start-1 size-8 rounded-xl shadow-none"
        />
      ) : null}

      <div className="col-start-3 row-start-1 flex min-w-0 items-baseline gap-3">
        {onOpenContext ? (
          <button
            type="button"
            onClick={onOpenContext}
            className="flex min-w-0 cursor-pointer items-baseline gap-1.5 border-0 bg-transparent p-0 text-left [font-family:inherit] hover:underline hover:decoration-border hover:underline-offset-4"
          >
            {name}
          </button>
        ) : (
          <div className="flex min-w-0 items-baseline gap-1.5">{name}</div>
        )}
        <TicketMetaLine meta={meta} className="hidden sm:block" />
      </div>

      {cocoAction && onCocoAction ? (
        <Button
          size="sm"
          data-testid="ticket-coco-action"
          data-coco-action={cocoAction.id}
          disabled={cocoAction.disabled}
          onClick={onCocoAction}
          className={cn(
            headerButtonClassName,
            "col-start-4 col-end-6 row-start-2 gap-1.5 justify-self-end sm:col-end-5 sm:row-start-1",
            COCO_ACTION_CLASS[cocoAction.variant],
          )}
        >
          {cocoAction.disabled ? <Loader2 className="size-3.5 shrink-0 animate-spin" /> : null}
          <span className="truncate">{cocoAction.label}</span>
        </Button>
      ) : null}

      <div className="col-start-5 row-start-1 flex shrink-0 items-center gap-1.5">
        {activeTab === "open" && (
          <Button
            variant="outline"
            size="sm"
            onClick={onResolve}
            aria-label="Close ticket"
            className={cn(
              headerButtonClassName,
              "w-8 gap-1.5 border-border bg-white px-0 text-[#1a1a1a] hover:bg-foreground/[0.04] sm:w-auto sm:px-3",
            )}
          >
            <CheckCircle2 className="size-3.5" />
            <span className="hidden sm:inline">Close ticket</span>
          </Button>
        )}
        {activeTab === "closed" && (
          <>
            <Badge variant="outline" className="border-green-600/20 bg-green-600/10 px-2.5 py-1 text-xs font-semibold text-green-700">
              <CheckCircle2 className="mr-1 size-3" /> Closed
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={onReopen}
              className={cn(headerButtonClassName, "gap-1.5 border-border text-muted-foreground hover:bg-foreground/[0.06] hover:text-strong")}
            >
              <RotateCcw className="size-3.5" /> Reopen
            </Button>
          </>
        )}
        {threadId ? <TicketTimelineMenu threadId={threadId} /> : null}
      </div>

      <TicketMetaLine meta={meta} className="col-start-2 col-end-4 row-start-2 sm:hidden" />

      {context ? (
        <div className="col-start-2 col-end-6 row-start-3 min-w-0 sm:col-start-3 sm:row-start-2">{context}</div>
      ) : null}
    </div>
  )
}
