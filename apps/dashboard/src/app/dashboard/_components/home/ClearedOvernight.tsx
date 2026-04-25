import { Card } from "@/components/ui/card"

interface ClearedTopic {
  tag: string
  count: number
  subtitle: string
}

interface Props {
  agentName: string
  totalCount: number
  topics: ClearedTopic[]
  timeSavedHours: number
  repliesSent: number
}

const TOPIC_COLORS: Record<string, { bar: string; text: string; bg: string }> = {
  Shipping:          { bar: 'border-l-blue-400/70',   text: 'text-blue-400',    bg: 'bg-blue-400/10' },
  Returns:           { bar: 'border-l-amber-400/70',  text: 'text-amber-400',   bg: 'bg-amber-400/10' },
  "Order Status":    { bar: 'border-l-emerald-400/70', text: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  "Product Inquiry": { bar: 'border-l-violet-400/70', text: 'text-violet-400',  bg: 'bg-violet-400/10' },
  General:           { bar: 'border-l-slate-400/70',  text: 'text-slate-300',   bg: 'bg-slate-400/10' },
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`
  return `${hours.toFixed(1)} hours`
}

export default function ClearedOvernight({ agentName, totalCount, topics, timeSavedHours, repliesSent }: Props) {
  if (totalCount === 0) return null

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="text-sm font-bold text-white/85">{agentName} cleared overnight</h2>
        <span className="text-[11px] text-white/35 tabular-nums">{totalCount}</span>
        <span className="text-[11px] text-white/35">
          · Saved you ~{formatHours(timeSavedHours)} · {repliesSent} repl{repliesSent === 1 ? 'y' : 'ies'} sent
        </span>
      </div>

      <div className="grid grid-cols-2 @min-[800px]:grid-cols-4 gap-2">
        {topics.map(t => {
          const color = TOPIC_COLORS[t.tag] ?? TOPIC_COLORS.General
          return (
            <Card key={t.tag} className={`bg-card border-border rounded-md px-3 py-3 border-l-2 ${color.bar}`}>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${color.text} ${color.bg} mb-2`}>
                {t.tag}
              </span>
              <p className="text-2xl font-bold tabular-nums text-white leading-none">{t.count}</p>
              <p className="text-[11px] text-white/40 mt-1.5 leading-snug">{t.subtitle}</p>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
