import { formatMoney } from "@shopkeeper/agent/money"

export interface LlmSpendSnapshot {
  day: string
  defaultCapUsd: number
  spentUsd: number | null
  resetAt: string
}

export interface LlmSpendPresentation {
  summary: string
  detail: string
  state: "available" | "warning" | "paused" | "unavailable"
}

function dollars(value: number): string {
  return formatMoney(value, "USD", { exact: true })
}

export function presentLlmSpend(snapshot: LlmSpendSnapshot, capUsd: number): LlmSpendPresentation {
  if (snapshot.spentUsd === null) {
    return {
      summary: "Usage temporarily unavailable",
      detail: "New AI work pauses when usage cannot be read. Manual handling remains available.",
      state: "unavailable",
    }
  }

  const remaining = Math.max(0, capUsd - snapshot.spentUsd)
  const ratio = capUsd > 0 ? snapshot.spentUsd / capUsd : 1
  const reset = new Date(snapshot.resetAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })

  return {
    summary: `${dollars(snapshot.spentUsd)} used of ${dollars(capUsd)} today`,
    detail: ratio >= 1
      ? `AI work is paused until the limit resets at ${reset} or the limit is raised.`
      : `${dollars(remaining)} remaining · resets ${reset}`,
    state: ratio >= 1 ? "paused" : ratio >= 0.8 ? "warning" : "available",
  }
}
