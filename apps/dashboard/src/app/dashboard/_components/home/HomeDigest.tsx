function formatReplyTime(minutes: number): string {
  if (minutes < 1) return "under a minute"
  if (minutes < 60) return `about ${Math.round(minutes)} minute${Math.round(minutes) === 1 ? "" : "s"}`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (m === 0) return `about ${h} hour${h === 1 ? "" : "s"}`
  return `about ${h}h ${m}m`
}

function joinClauses(clauses: string[]): string {
  if (clauses.length <= 1) return clauses[0] ?? ""
  if (clauses.length === 2) return `${clauses[0]} and ${clauses[1]}`
  return `${clauses.slice(0, -1).join(", ")}, and ${clauses[clauses.length - 1]}`
}

interface Props {
  isLoading: boolean
  openCount: number
  openDelta: number
  firstReplyMinutes: number | null
  autoResolvedPct: number | null
  weeklyVolume: number
  agentName: string
}

export default function HomeDigest({ isLoading, openCount, openDelta, firstReplyMinutes, autoResolvedPct, weeklyVolume, agentName }: Props) {
  if (isLoading) return null

  let sentence = openCount === 0
    ? "No tickets open right now"
    : `${openCount} ticket${openCount === 1 ? "" : "s"} open`
  if (openCount > 0 && openDelta !== 0) {
    sentence += openDelta > 0
      ? ` (${openDelta} more than yesterday)`
      : ` (${-openDelta} fewer than yesterday)`
  }

  const clauses: string[] = []
  if (weeklyVolume > 0) clauses.push(`${weeklyVolume.toLocaleString()} came in this week`)
  if (firstReplyMinutes != null) clauses.push(`replies go out in ${formatReplyTime(firstReplyMinutes)}`)
  if (autoResolvedPct != null && autoResolvedPct > 0) clauses.push(`${agentName} handled ${autoResolvedPct}% with just your OK`)
  if (clauses.length > 0) sentence += ` — ${joinClauses(clauses)}`

  return <p className="px-1 text-xs text-foreground/45">{sentence}.</p>
}
