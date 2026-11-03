"use client"

import { AGENT_DISPLAY_NAME } from "@shopkeeper/agent/settings"
import { MERCHANT_ANSWER_MAX_LENGTH, type MerchantAnswerSlot } from "@shopkeeper/agent/reply-placeholders"
import type { MerchantAnswerName, MerchantAnswers } from "@shopkeeper/agent/types"
import { Input } from "@/components/ui/input"

// A blank in the drafted reply, answered where the merchant approves it. The
// answer goes into the reply as typed and is saved to Memory.
export function BlankAnswerFields({
  answers,
  blanks,
  disabled,
  onChange,
}: {
  answers: MerchantAnswers
  blanks: readonly MerchantAnswerSlot[]
  disabled?: boolean
  onChange: (name: MerchantAnswerName, value: string) => void
}) {
  if (blanks.length === 0) return null
  return (
    <div className="flex flex-col gap-3">
      {blanks.map(blank => (
        <label key={blank.name} className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground/85">{blank.question}</span>
          <Input
            value={answers[blank.name] ?? ""}
            onChange={event => onChange(blank.name, event.target.value)}
            placeholder={`e.g. ${blank.example}`}
            maxLength={MERCHANT_ANSWER_MAX_LENGTH}
            disabled={disabled}
            className="rounded-xl bg-foreground/[0.03]"
          />
          <span className="text-xs text-muted-foreground">
            Fills in [{blank.label}] in the reply. {AGENT_DISPLAY_NAME} remembers it for next time.
          </span>
        </label>
      ))}
    </div>
  )
}
