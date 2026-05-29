"use client"

import { BarChart2, CheckCircle, AlertTriangle } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

type KpiStatus = 'excellent' | 'good' | 'needs_work' | 'no_data'

export interface KpiCard {
  label: string
  value: string
  sub: string
  icon: React.ReactNode
  status: KpiStatus
  statusLabel: string
  barPct: number
  benchmarkLabel: string
}

interface Tip {
  text: string
  ok: boolean
  benchmark: string
}

interface AuditSectionProps {
  auditLabel: string
  badgeLabel: string
  isLoading: boolean
  auditScore: number | null
  auditGrade: string
  auditIssues: number
  totalThreads: number
  kpiCards: KpiCard[]
  visibleTips: Tip[]
}

const STATUS_COLORS: Record<KpiStatus, { bg: string; border: string; badge: string; bar: string; icon: string }> = {
  excellent: { bg: 'bg-emerald-950/40', border: 'border-emerald-800/50', badge: 'bg-emerald-900/60 text-emerald-400', bar: 'bg-emerald-500', icon: 'bg-emerald-900/60 text-emerald-400' },
  good:      { bg: 'bg-blue-950/40',    border: 'border-blue-800/50',    badge: 'bg-blue-900/60 text-blue-400',       bar: 'bg-blue-500',    icon: 'bg-blue-900/60 text-blue-400'    },
  needs_work:{ bg: 'bg-amber-950/40',   border: 'border-amber-800/50',   badge: 'bg-amber-900/60 text-amber-400',     bar: 'bg-amber-500',   icon: 'bg-amber-900/60 text-amber-400'  },
  no_data:   { bg: 'bg-muted',          border: 'border-border',         badge: 'bg-muted text-muted-foreground',     bar: 'bg-border',      icon: 'bg-muted text-muted-foreground'  },
}

function gradeColors(score: number | null): { container: string; text: string } {
  if (score === null)  return { container: 'bg-muted border-border',                   text: 'text-muted-foreground' }
  if (score >= 75)     return { container: 'bg-emerald-950/40 border-emerald-800/50',  text: 'text-emerald-400' }
  if (score >= 55)     return { container: 'bg-blue-950/40 border-blue-800/50',        text: 'text-blue-400' }
  if (score >= 40)     return { container: 'bg-amber-950/40 border-amber-800/50',      text: 'text-amber-400' }
  return                      { container: 'bg-red-950/40 border-red-800/50',          text: 'text-red-400' }
}

export function AuditSection({
  auditLabel, badgeLabel, isLoading, auditScore, auditGrade,
  auditIssues, totalThreads, kpiCards, visibleTips,
}: AuditSectionProps) {
  const grade = gradeColors(auditScore)

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart2 className="size-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm">{auditLabel} Performance Audit</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">KPI health check for your support operation</p>
            </div>
          </div>
          <span className="text-xs font-semibold text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full uppercase tracking-wide">
            {badgeLabel}
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-5">
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            <div className="flex gap-3">
              <div className="w-24 h-32 rounded-xl bg-muted shrink-0" />
              <div className="flex-1 grid grid-cols-2 gap-2.5">
                {["one", "two", "three", "four"].map((key) => <div key={key} className="h-[68px] bg-muted rounded-xl" />)}
              </div>
            </div>
            <div className="h-16 bg-muted rounded-xl" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-3 items-start">
              {/* Grade card */}
              <div className={`shrink-0 self-start w-24 rounded-xl border px-3 py-3.5 flex flex-col items-center gap-1 text-center ${grade.container}`}>
                <span className={`text-5xl font-black leading-none ${grade.text}`}>{auditGrade}</span>
                <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Overall</span>
                {auditScore !== null && (
                  <span className={`text-xs font-bold ${grade.text}`}>{auditScore}/100</span>
                )}
                <div className="pt-1.5 border-t border-border/60 w-full text-center space-y-0.5 mt-0.5">
                  <p className="text-[9px] text-muted-foreground">{totalThreads} ticket{totalThreads !== 1 ? 's' : ''}</p>
                  {auditIssues > 0 && (
                    <p className="text-[9px] font-semibold text-amber-400">{auditIssues} issue{auditIssues !== 1 ? 's' : ''}</p>
                  )}
                </div>
              </div>

              {/* KPI 2×2 */}
              <div className="flex-1 grid grid-cols-2 gap-2.5">
                {kpiCards.map(kpi => {
                  const colors = STATUS_COLORS[kpi.status]
                  return (
                    <div key={kpi.label} className={`rounded-xl border px-3 py-2.5 ${colors.bg} ${colors.border}`}>
                      <div className="flex items-center justify-between mb-1.5 gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className={`size-4 rounded flex items-center justify-center shrink-0 ${colors.icon}`}>
                            {kpi.icon}
                          </div>
                          <span className="text-xs font-semibold text-muted-foreground truncate">{kpi.label}</span>
                        </div>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0 ${colors.badge}`}>
                          {kpi.statusLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl font-black text-foreground leading-none shrink-0 min-w-[2rem]">{kpi.value}</span>
                        <div className="flex-1 h-2 rounded-full bg-white/[0.07] overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-700 ${colors.bar}`} style={{ width: `${kpi.barPct}%` }} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[9px] text-muted-foreground truncate pr-2">{kpi.sub}</span>
                        <span className="text-[9px] text-muted-foreground shrink-0">{kpi.benchmarkLabel}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Recommendations */}
            {visibleTips.length > 0 && (
              <div className="rounded-xl border border-border bg-muted/50 px-4 py-3.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">
                  {visibleTips.every(t => t.ok) ? 'All systems healthy' : `${auditIssues} recommendation${auditIssues !== 1 ? 's' : ''}`}
                </p>
                <div className="space-y-1.5">
                  {visibleTips.map((tip) => (
                    <div key={tip.text} className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-xs ${
                      tip.ok
                        ? 'bg-emerald-950/40 border border-emerald-800/50 text-emerald-400'
                        : 'bg-card border border-border text-foreground'
                    }`}>
                      {tip.ok
                        ? <CheckCircle className="size-3.5 shrink-0 text-emerald-400 mt-0.5" />
                        : <AlertTriangle className="size-3.5 shrink-0 text-amber-400 mt-0.5" />
                      }
                      <span className="leading-relaxed">{tip.text}</span>
                      {tip.benchmark && (
                        <span className="ml-auto shrink-0 text-[9px] text-muted-foreground font-medium pl-3 mt-0.5 text-right leading-tight">{tip.benchmark}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
