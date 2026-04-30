import { Card } from "@/components/ui/card"
import type { Thread } from "@/types"

interface Props {
  openThreads: Thread[]
  closedThreads: Thread[]
}

function formatAge(ms: number): string {
  const h = ms / (1000 * 60 * 60)
  if (h < 1) return `${Math.round(ms / (1000 * 60))}m`
  if (h < 24) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

export default function InsightsCard({ openThreads, closedThreads }: Props) {
  const total = openThreads.length + closedThreads.length
  if (total === 0) return null

  const resolutionRate = Math.round((closedThreads.length / total) * 100)

  const aiHandled = closedThreads.filter(t => t.messages[0]?.senderType === "ai").length
  const aiRate = closedThreads.length > 0 ? Math.round((aiHandled / closedThreads.length) * 100) : null

  const avgAge = openThreads.length > 0
    ? openThreads.reduce((sum, t) => sum + (Date.now() - new Date(t.createdAt).getTime()), 0) / openThreads.length
    : null

  const tagCounts: Record<string, number> = {}
  ;[...openThreads, ...closedThreads].forEach(t => {
    if (t.tag) tagCounts[t.tag] = (tagCounts[t.tag] || 0) + 1
  })
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 4)
  const maxCount = topTags[0]?.[1] ?? 1

  return (
    <Card className="bg-card border-border rounded-md overflow-hidden shrink-0 noise-texture">
      <div className="grid grid-cols-3 divide-x divide-border">
        <div className="px-3 py-3">
          <p className="text-xs text-white/40 mb-1">Resolution</p>
          <p className="text-xl font-bold text-white tabular-nums">{resolutionRate}%</p>
        </div>
        <div className="px-3 py-3">
          <p className="text-xs text-white/40 mb-1">AI handled</p>
          <p className="text-xl font-bold text-white tabular-nums">
            {aiRate !== null ? `${aiRate}%` : "—"}
          </p>
        </div>
        <div className="px-3 py-3">
          <p className="text-xs text-white/40 mb-1">Avg age</p>
          <p className="text-xl font-bold text-white tabular-nums">
            {avgAge !== null ? formatAge(avgAge) : "—"}
          </p>
        </div>
      </div>

      {topTags.length > 0 && (
        <div className="border-t border-border px-3 pt-2.5 pb-3 space-y-2">
          <p className="text-xs text-white/40">Top topics</p>
          {topTags.map(([tag, count]) => (
            <div key={tag} className="flex items-center gap-2">
              <span className="text-xs text-white/60 truncate flex-1 min-w-0">{tag}</span>
              <div className="w-16 h-1.5 bg-white/[0.07] rounded-full overflow-hidden shrink-0">
                <div
                  className="h-full bg-amber-400/60 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                />
              </div>
              <span className="text-[11px] text-white/35 w-4 text-right shrink-0">{count}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
