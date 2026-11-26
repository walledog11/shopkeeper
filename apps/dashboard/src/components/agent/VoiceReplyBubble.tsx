import { Loader2 } from "lucide-react"
import type { VoiceReply } from "@/lib/agent/voice-requests"

/** A sample customer's message, as the agent's sample reply answers it. */
export function CustomerBubble({ name, message }: { name: string; message: string }) {
  return (
    <div className="max-w-[85%] self-start break-words rounded-2xl rounded-tl-sm bg-foreground/[0.05] px-3 py-2 text-sm text-foreground">
      <div className="mb-0.5 text-xs font-medium text-muted-foreground">{name}</div>
      {message}
    </div>
  )
}

export function VoiceReplyBubble({ reply, onRetry }: { reply: VoiceReply; onRetry?: () => void }) {
  if (reply.status === "loading") {
    return (
      <div className="flex items-center gap-2 self-end rounded-2xl rounded-tr-sm bg-foreground/[0.03] px-3 py-2 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Writing a reply…
      </div>
    )
  }
  if (reply.status === "error") {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 self-end text-sm text-destructive">
        {reply.message}
        {onRetry ? <button type="button" onClick={onRetry} className="underline underline-offset-4">Try again</button> : null}
      </div>
    )
  }
  return (
    <div className="max-w-[90%] self-end whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-foreground px-3 py-2 text-sm text-background">
      {reply.text}
    </div>
  )
}
