"use client"

import { Calendar } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

type Preset = '7d' | '30d' | '90d' | 'all' | 'custom'

interface DateRangeSelectorProps {
  preset: Preset
  setPreset: (p: Preset) => void
  customFrom: string
  setCustomFrom: (v: string) => void
  customTo: string
  setCustomTo: (v: string) => void
  today: string
}

const PRESETS: { value: Preset; label: string }[] = [
  { value: '7d',     label: 'Last 7 days'  },
  { value: '30d',    label: 'Last 30 days' },
  { value: '90d',    label: 'Last 90 days' },
  { value: 'all',    label: 'All time'     },
  { value: 'custom', label: 'Custom'       },
]

export function DateRangeSelector({
  preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, today
}: DateRangeSelectorProps) {
  return (
    <Card>
      <CardContent className="py-3 px-3.5 flex flex-wrap items-center gap-2">
        <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <div className="flex items-center gap-1 flex-wrap">
          {PRESETS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setPreset(value)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                preset === value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground border border-transparent hover:border-border'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-2 pl-1 border-l border-border ml-1">
            <input
              type="date"
              value={customFrom}
              max={customTo}
              onChange={e => setCustomFrom(e.target.value)}
              className="text-xs border border-border rounded-md px-2 py-1 text-foreground bg-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            />
            <span className="text-[10px] text-muted-foreground font-medium">to</span>
            <input
              type="date"
              value={customTo}
              min={customFrom}
              max={today}
              onChange={e => setCustomTo(e.target.value)}
              className="text-xs border border-border rounded-md px-2 py-1 text-foreground bg-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
