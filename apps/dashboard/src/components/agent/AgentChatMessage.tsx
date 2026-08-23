import { AlertCircle, Check, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import AgentAvatar from "@/components/agent/AgentAvatar"
import { formatClockTime } from "@/lib/format/date"
import { AGENT_DISPLAY_NAME } from "@shopkeeper/agent/settings"
import { AgentMessageMarkdown } from "@/components/agent/AgentMessageMarkdown"
import {
  getToolChipLabel,
  getToolChipVariant,
  TOOL_CHIP_CLASS,
} from "@/lib/agent/tool-action-display"
import { CONCIERGE_BUBBLE } from "@/app/dashboard/_components/home/needs-you-card-styles"
import { cn } from "@/lib/ui/cn"
import type { ChatMessage } from "./agent-chat-session"

function getToolResultHint(tool: string, result: string): string | null {
  if (result.startsWith("Error")) return null
  const countMatch = result.match(/\b(\d+)\b/)
  if (!countMatch) return null
  const n = countMatch[1]
  const hints: Record<string, (n: string) => string> = {
    find_customer: (n) => `${n} customer${n === "1" ? "" : "s"}`,
    search_shopify_customers: (n) => `${n} customer${n === "1" ? "" : "s"}`,
    search_shopify_products: (n) => `${n} product${n === "1" ? "" : "s"}`,
    get_shopify_orders: (n) => `${n} order${n === "1" ? "" : "s"}`,
    search_kb: (n) => `from ${n} KB article${n === "1" ? "" : "s"}`,
  }
  return hints[tool]?.(n) ?? null
}

export function AgentChatMessage({
  message,
  onApprove,
  onDismiss,
  isRunning,
  hideAvatar,
}: {
  message: Extract<ChatMessage, { role: "agent" }>
  onApprove: () => void
  onDismiss: () => void
  isRunning: boolean
  hideAvatar?: boolean
}) {
  const visibleActions = message.actions.filter(a =>
    a.tool !== "send_reply"
    && a.tool !== "add_internal_note"
    && a.tool !== "navigate_dashboard",
  )
  const awaitingApproval = message.awaitingApproval === true

  return (
    <div className={hideAvatar ? "flex justify-start" : "flex items-start gap-3"}>
      {!hideAvatar && <AgentAvatar size="md" className="mt-0.5" />}
      <div className={hideAvatar ? "min-w-0 max-w-[88%]" : "flex-1 min-w-0 max-w-[75%]"}>
        {!hideAvatar && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-foreground">{AGENT_DISPLAY_NAME}</span>
            <span className="text-xs text-muted-foreground">{formatClockTime(message.timestamp)}</span>
          </div>
        )}
        {visibleActions.length > 0 && (
          <div className={`flex flex-wrap gap-1.5 ${hideAvatar ? "mb-1.5" : "mb-2.5"}`}>
            {visibleActions.map((action) => {
              const variant = getToolChipVariant(action)
              const hint = variant !== "error" ? getToolResultHint(action.tool, action.result) : null
              return (
                <span
                  key={`${action.tool}-${action.result}`}
                  className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${TOOL_CHIP_CLASS[variant]}`}
                >
                  {variant === "error" && <AlertCircle className="size-3 shrink-0" />}
                  {variant === "executed" && <Check className="size-3 shrink-0" />}
                  {variant === "read" && <Search className="size-3 shrink-0 opacity-70" />}
                  {variant === "pending" && <AlertCircle className="size-3 shrink-0" />}
                  {getToolChipLabel(action)}
                  {hint && <span className="opacity-70">{"\u00b7"} {hint}</span>}
                </span>
              )
            })}
          </div>
        )}
        <div className={cn(
          "break-words",
          hideAvatar
            ? cn(
                "px-3.5 py-2.5",
                awaitingApproval ? CONCIERGE_BUBBLE.agentFlag.shell : CONCIERGE_BUBBLE.agent.shell,
                awaitingApproval ? CONCIERGE_BUBBLE.agentFlag.text : CONCIERGE_BUBBLE.agent.text,
              )
            : awaitingApproval
              ? "bg-amber-600/[0.07] border border-amber-600/25 text-foreground text-sm rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm"
              : "bg-green-600/20 border border-border text-foreground text-sm rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm",
        )}>
          <AgentMessageMarkdown
            text={message.summary}
            inverted={hideAvatar && !awaitingApproval}
          />
        </div>
        {awaitingApproval && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isRunning}
              onClick={onApprove}
              className="rounded-full bg-green-600 hover:bg-green-700 text-primary-foreground"
            >
              Send as-is
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isRunning}
              onClick={onDismiss}
              className="rounded-full"
            >
              Not now
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
