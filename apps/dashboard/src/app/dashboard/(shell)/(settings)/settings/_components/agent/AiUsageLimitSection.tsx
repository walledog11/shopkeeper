"use client"

import { MAX_DAILY_LLM_SPEND_CAP_USD } from "@shopkeeper/agent/settings"
import { MoneyInput } from "@/components/settings-form/fields"
import { SettingsTile } from "@/app/dashboard/(shell)/(settings)/settings/_components/SettingsTile"
import type { AgentTabController } from "./useAgentTabState"
import {
  DAILY_LIMIT_OVER_MAX,
  isOverDailyLimitMax,
  presentLlmSpend,
  type LlmSpendSnapshot,
} from "./llm-spend-presentation"

export function AiUsageLimitSection({
  controller,
  llmSpend,
}: {
  controller: AgentTabController
  llmSpend: LlmSpendSnapshot
}) {
  const { rawInputs, setRawInput } = controller
  const parsedCap = Number(rawInputs.dailyLLMSpendCap)
  const capUsd = rawInputs.dailyLLMSpendCap.trim() && Number.isFinite(parsedCap) ? parsedCap : llmSpend.defaultCapUsd
  const overMax = isOverDailyLimitMax(capUsd)
  const spend = presentLlmSpend(llmSpend, Math.min(capUsd, MAX_DAILY_LLM_SPEND_CAP_USD))

  return (
    <SettingsTile
      label="Daily AI limit"
      description="Not a charge. If AI use reaches it, Shopkeeper pauses new work until the limit resets."
    >
      <div className="space-y-3">
        <MoneyInput
          label="Daily limit"
          hint={`up to $${MAX_DAILY_LLM_SPEND_CAP_USD}`}
          aria-label="Daily AI limit"
          aria-invalid={overMax || undefined}
          max={MAX_DAILY_LLM_SPEND_CAP_USD}
          value={rawInputs.dailyLLMSpendCap}
          onValueChange={value => setRawInput("dailyLLMSpendCap", value)}
          placeholder={String(llmSpend.defaultCapUsd)}
        />
        {overMax && <p role="alert" className="text-xs text-red-700">{DAILY_LIMIT_OVER_MAX}</p>}
        <div
          role="status"
          className={spend.state === "paused" || spend.state === "unavailable"
            ? "rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-700"
            : spend.state === "warning"
              ? "rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700"
              : "rounded-md bg-foreground/[0.04] px-3 py-2 text-xs text-muted-foreground"}
        >
          <p className="font-semibold">{spend.summary}</p>
          <p className="mt-0.5">{spend.detail}</p>
        </div>
      </div>
    </SettingsTile>
  )
}
