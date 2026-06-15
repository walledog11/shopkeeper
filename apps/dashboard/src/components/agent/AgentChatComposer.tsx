import { ArrowUp, Loader2 } from "lucide-react"
import type { CSSProperties, KeyboardEvent, RefObject } from "react"
import type { WalkthroughItem } from "@/lib/agent/panel"

export function AgentChatComposer({
  compact,
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
  currentWalkthroughItem: WalkthroughItem | null
  input: string
  isRunning: boolean
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onSend: () => void
  onStartFresh: () => void
  setInput: (value: string) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
}) {
  return (
    <div className="shrink-0 min-w-0 px-5 md:px-6 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:pb-4">
      <div className="min-w-0 w-full rounded-xl border border-border bg-card px-4 pt-3 pb-3 transition-all focus-within:border-green-400/50 focus-within:ring-1 focus-within:ring-violet-400/20">
        <textarea
          aria-label="Agent message"
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onComposerKeyDown}
          disabled={isRunning}
          placeholder={currentWalkthroughItem
            ? "Ask about this ticket\u2026"
            : compact
              ? "Check order #1042, draft a reply to Sarah\u2026"
              : "Ask about orders, draft replies, update customers\u2026"
          }
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
              className="flex items-center gap-1 text-xs font-medium bg-green-600 text-white rounded-lg px-3 py-1.5 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
