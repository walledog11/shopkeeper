"use client"

import { MoneyInput, NumberInput } from "./settings-form-fields"
import { SectionCard } from "./shared"
import type { AgentTabController } from "./useAgentTabState"

export function AgentGuardrailsSection({ controller }: { controller: AgentTabController }) {
  const {
    dailyRefundCapInput,
    setDailyRefundCapInput,
    dailyLLMSpendCapInput,
    setDailyLLMSpendCapInput,
    maxIterationsInput,
    setMaxIterationsInput,
  } = controller

  return (
    <SectionCard title="Guardrails" description="Hard limits that the agent will never exceed.">
      <div className="space-y-5">
        <MoneyInput
          label="Daily refund cap"
          hint="leave blank for no limit"
          aria-label="Daily refund cap"
          value={dailyRefundCapInput}
          onValueChange={setDailyRefundCapInput}
          placeholder="e.g. 200"
          description="Total refunds the agent can issue per day across all orders. Resets at UTC midnight."
        />
        <MoneyInput
          label="Daily AI spend limit"
          hint="leave blank for $20 default"
          aria-label="Daily AI spend limit"
          value={dailyLLMSpendCapInput}
          onValueChange={setDailyLLMSpendCapInput}
          placeholder="20"
          description="Backstop on AI provider spend per UTC day. When reached, the agent pauses until midnight UTC."
        />
        <NumberInput
          label="Max iterations"
          hint="default 10"
          aria-label="Max iterations"
          value={maxIterationsInput}
          onValueChange={setMaxIterationsInput}
          placeholder="10"
          description="Maximum number of tool-calling steps per agent run."
        />
      </div>
    </SectionCard>
  )
}
