"use client"

import { useEffect } from "react"
import { ChevronLeft, Loader2 } from "lucide-react"
import { useComposerState } from "./composer-state"
import type { ComposerProps } from "./composer-types"

type Props = Pick<
  ComposerProps,
  | "customerName"
  | "channelType"
  | "shopifyCustomerId"
  | "customerPlatformId"
  | "lastCustomerMessageAt"
  | "value"
  | "isSending"
  | "error"
  | "onChange"
  | "onSend"
> & {
  focusOnMount?: boolean
  onBackToPlan: () => void
}

export default function MobileFloatingReplyComposer({
  focusOnMount = true,
  customerName,
  channelType,
  shopifyCustomerId,
  customerPlatformId,
  lastCustomerMessageAt,
  value,
  isSending,
  error,
  onChange,
  onSend,
  onBackToPlan,
}: Props) {
  const { sendDisabled, placeholder, textareaRef } = useComposerState({
    customerName,
    channelType,
    shopifyCustomerId,
    customerPlatformId,
    lastCustomerMessageAt,
    value,
    isSending,
    error,
    onChange,
    onSend,
    viewTab: "chat",
    noteCount: 0,
    onViewTabChange: () => {},
    isAgentMode: false,
  })

  useEffect(() => {
    if (!focusOnMount) return
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [focusOnMount, textareaRef])

  return (
    <div
      data-testid="mobile-floating-reply-composer"
      className="w-full rounded-2xl bg-card border border-border shadow-sm overflow-hidden"
    >
      <div className="flex h-11 items-center gap-2 px-3 sm:px-4 shrink-0">
        <button
          type="button"
          data-testid="mobile-edit-back-to-plan"
          onClick={onBackToPlan}
          disabled={isSending}
          className="inline-flex min-w-0 items-center gap-0.5 rounded-lg py-1 pr-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-strong disabled:opacity-40"
        >
          <ChevronLeft className="size-4 shrink-0" />
          Back to plan
        </button>
        <p className="flex-1 min-w-0 truncate text-right text-sm font-medium text-strong">
          Edit reply
        </p>
      </div>

      <div className="px-4 sm:px-5 pb-4">
        <textarea
          aria-label="Reply composer"
          data-testid="reply-composer-textarea"
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              if (!sendDisabled) onSend(false)
            }
          }}
          disabled={isSending}
          rows={5}
          className="w-full min-h-[120px] max-h-[32vh] overflow-y-auto resize-none rounded-2xl border border-border bg-foreground/[0.04] px-4 py-3 text-base leading-relaxed text-strong outline-none placeholder:text-faint disabled:opacity-50"
          placeholder={placeholder}
        />

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            data-testid="reply-composer-send"
            disabled={sendDisabled}
            onClick={() => onSend(false)}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-emerald-500 px-4 text-sm font-semibold text-[#ffffff] transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <span className="text-sm leading-none">↑</span>
                Send
              </>
            )}
          </button>
        </div>

        {error && (
          <p className="mt-2 text-xs font-medium text-red-400">{error}</p>
        )}
      </div>
    </div>
  )
}
