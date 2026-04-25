interface WeekDay {
  label: string
  auto: number
  manual: number
}

interface Props {
  data: WeekDay[]
}

export default function WeekChart({ data }: Props) {
  const max = Math.max(1, ...data.map(d => d.auto + d.manual))
  const total = data.reduce((s, d) => s + d.auto + d.manual, 0)
  const today = data.length - 1

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-white/40">Your week</p>
      <div className="rounded-md bg-card border border-border px-3 pt-3 pb-2.5">
        <div className="grid grid-cols-7 gap-1.5 items-end h-[88px]">
          {data.map((d, i) => {
            const isToday = i === today
            const totalH = ((d.auto + d.manual) / max) * 100
            const autoH = (d.auto + d.manual) > 0 ? (d.auto / (d.auto + d.manual)) * 100 : 0
            return (
              <div key={d.label + i} className="flex flex-col items-center justify-end gap-1.5">
                <div className="w-full flex flex-col justify-end" style={{ height: `${Math.max(totalH, 2)}%` }}>
                  <div
                    className={`w-full rounded-t ${isToday ? 'bg-green-400' : 'bg-white/45'}`}
                    style={{ height: `${100 - autoH}%`, minHeight: d.manual > 0 ? '2px' : '0' }}
                  />
                  <div
                    className={`w-full rounded-b ${isToday ? 'bg-green-500/40' : 'bg-white/15'}`}
                    style={{ height: `${autoH}%`, minHeight: d.auto > 0 ? '2px' : '0' }}
                  />
                </div>
                <span className={`text-[9px] tabular-nums ${isToday ? 'text-green-400 font-semibold' : 'text-white/35'}`}>
                  {d.label}
                </span>
              </div>
            )
          })}
        </div>
        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-[9px] text-white/40">
              <span className="block w-2 h-2 rounded-sm bg-white/45" /> you
            </span>
            <span className="inline-flex items-center gap-1 text-[9px] text-white/40">
              <span className="block w-2 h-2 rounded-sm bg-white/15" /> auto
            </span>
          </div>
          <span className="text-[10px] text-white/40 tabular-nums">{total} total</span>
        </div>
      </div>
    </div>
  )
}
