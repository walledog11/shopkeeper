import { ArrowUp, Loader2 } from "lucide-react"
import type { CSSProperties, KeyboardEvent, RefObject } from "react"
import type { WalkthroughItem } from "@/lib/agent/panel"

export function AgentChatComposer({
  compact,
  tight,
  pill,
  currentWalkthroughItem,
  input,
  isRunning,
  onComposerKeyDown,
  onSend,
  onStartFresh,
  setInput,
  textareaRef,
}: {
  compact?: boolean
  tight?: boolean
  pill?: boolean
  currentWalkthroughItem: WalkthroughItem | null
  input: string
  isRunning: boolean
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onSend: () => void
  onStartFresh: () => void
  setInput: (value: string) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
}) {
  const placeholder = currentWalkthroughItem
    ? "Ask about this ticket\u2026"
    : compact
      ? "Check order #1042, draft a reply to Sarah\u2026"
      : "Ask about orders, draft replies, update customers\u2026"

  if (pill) {
    return (
      <div className="shrink-0 border-t border-border/50 bg-sidebar px-4 py-3">
        <div className="flex min-h-11 items-center gap-2 rounded-xl border border-border/80 bg-background px-3 py-1.5">
          <textarea
            aria-label="Agent message"
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onComposerKeyDown}
            disabled={isRunning}
            placeholder="write a message..."
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none leading-5 min-h-[24px] max-h-20"
            style={{ fieldSizing: "content" } as CSSProperties}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!input.trim() || isRunning}
            aria-label="Send"
            className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-foreground text-background transition-colors hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isRunning
              ? <Loader2 className="size-3.5 animate-spin" />
              : <ArrowUp className="size-3.5" />
            }
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={tight
      ? "shrink-0 min-w-0 px-5 pt-3 pb-4"
      : "shrink-0 min-w-0 px-5 md:px-6 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:pb-4"
    }>
      <div className="min-w-0 w-full rounded-xl border border-border bg-card px-4 pt-3 pb-3 transition-all focus-within:border-green-600/50 focus-within:ring-1 focus-within:ring-violet-600/20">
        <textarea
          aria-label="Agent message"
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onComposerKeyDown}
          disabled={isRunning}
          placeholder={placeholder}
          className="w-full min-w-0 max-w-full bg-transparent text-base md:text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none min-h-[40px] max-h-50"
          style={{ fieldSizing: "content" } as CSSProperties}
        />
        <div className={`flex min-w-0 items-center mt-2.5 gap-2 ${compact ? "justify-between" : "justify-end"}`}>
          {compact && (
            <button
              type="button"
              onClick={onStartFresh}
              disabled={isRunning}
              className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Start fresh
            </button>
          )}
          <div className="flex shrink-0 items-center gap-2">
            {!compact && (
              <span className="hidden md:block text-xs text-muted-foreground whitespace-nowrap">
                Shift + {"\u21b5"} for new line
              </span>
            )}
            <button
              type="button"
              onClick={onSend}
              disabled={!input.trim() || isRunning}
              className="flex items-center gap-1 text-xs font-medium bg-green-600 text-foreground rounded-lg px-3 py-1.5 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isRunning
                ? <Loader2 className="size-3.5 animate-spin" />
                : <ArrowUp className="size-3.5" />
              }
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
