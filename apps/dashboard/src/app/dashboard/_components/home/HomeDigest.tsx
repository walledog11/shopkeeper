function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    const whole = Math.floor(minutes)
    const secs = Math.round((minutes - whole) * 60)
    return secs > 0 ? `${whole}m ${secs}s` : `${whole}m`
  }
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

interface Props {
  isLoading: boolean
  openCount: number
  openDelta: number
  firstReplyMinutes: number | null
  autoResolvedPct: number | null
  weeklyVolume: number
}

export default function HomeDigest({ isLoading, openCount, openDelta, firstReplyMinutes, autoResolvedPct, weeklyVolume }: Props) {
  if (isLoading) return null

  const parts = [
    `${openCount} open${openDelta !== 0 ? ` (${openDelta > 0 ? "+" : ""}${openDelta} vs yesterday)` : ""}`,
    `${weeklyVolume.toLocaleString()} ticket${weeklyVolume === 1 ? "" : "s"} this week`,
  ]
  if (firstReplyMinutes != null) parts.push(`first reply ${formatMinutes(firstReplyMinutes)}`)
  if (autoResolvedPct != null) parts.push(`${autoResolvedPct}% handled with your OK`)

  return <p className="px-1 text-xs text-white/40 tabular-nums">{parts.join(" · ")}</p>
}
