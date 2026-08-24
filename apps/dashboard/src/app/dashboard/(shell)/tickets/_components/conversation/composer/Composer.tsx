"use client"

import { ArrowUp, Bot, Loader2 } from "lucide-react"
import { AGENT_DISPLAY_NAME } from "@shopkeeper/agent/settings"
import { NeedsYouCardFooter } from "@/app/dashboard/_components/home/needs-you-card-ui"
import { useComposerState } from "./composer-state"
import type { ComposerProps } from "./composer-types"

export default function Composer(props: ComposerProps) {
  const {
    error,
    isAgentMode = false,
    isSending,
    onClearAgentMode,
    onSend,
    value,
  } = props
  const {
    igWindowExpired,
    isEmailLike,
    onChange,
    placeholder,
    senderEmail,
    sendDisabled,
    textareaRef,
  } = useComposerState(props)

  return (
    <NeedsYouCardFooter className="pointer-events-auto shrink-0 p-0">
      <div className="px-4 py-3 sm:px-6 sm:py-4">
        {igWindowExpired && (
          <div className="mb-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700">
            Instagram only allows replies within 24 hours of the customer&apos;s last message. Wait
            for them to message again before you can reply here.
          </div>
        )}

        <div className="flex min-w-0 items-end gap-1.5 rounded-[24px] border border-border bg-card px-1.5 py-1.5 shadow-sm transition-colors focus-within:border-foreground/30 sm:gap-2 sm:px-2">
          {isAgentMode ? (
            <span className="mb-1 inline-flex shrink-0 items-center gap-1 self-center rounded-full bg-foreground/[0.07] px-2.5 py-[5px] text-xs font-semibold text-strong">
              <Bot className="size-3" />
              @{AGENT_DISPLAY_NAME.toLowerCase()}
            </span>
          ) : null}

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
                return
              }
              if (e.key === "Backspace" && value === "" && isAgentMode && onClearAgentMode) {
                e.preventDefault()
                onClearAgentMode()
              }
            }}
            disabled={isSending}
            rows={1}
            className="custom-scrollbar w-0 min-h-[36px] max-h-[40vh] flex-1 resize-none overflow-y-auto bg-transparent py-1.5 text-base leading-relaxed text-strong outline-none placeholder:text-faint disabled:opacity-50 md:text-sm"
            placeholder={placeholder}
          />

          <button
            type="button"
            data-testid="reply-composer-send"
            disabled={sendDisabled}
            onClick={() => onSend(false)}
            aria-label={isAgentMode ? `Ask ${AGENT_DISPLAY_NAME}` : "Send reply"}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
          </button>
        </div>

        <div className="flex min-h-[16px] items-center px-3 pt-1">
          <span className="min-w-0 truncate text-[11px] text-faint">
            {error ? (
              <span className="font-medium text-red-500">{error}</span>
            ) : isAgentMode ? (
              `${AGENT_DISPLAY_NAME} replies here — only you see this`
            ) : isEmailLike && senderEmail ? (
              <>Replies as <span className="font-semibold text-muted-foreground">{senderEmail}</span></>
            ) : null}
          </span>
        </div>
      </div>
    </NeedsYouCardFooter>
  )
}
