import Link from "next/link"
import { CheckCircle2, ArrowRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

interface WorkflowStep {
  label: string
  href: string
  status: 'done' | 'pending'
}

interface Props {
  workflowSteps: WorkflowStep[]
  workflowDoneCount: number
}

export default function WorkflowBasics({ workflowSteps, workflowDoneCount }: Props) {
  const pct = Math.round((workflowDoneCount / workflowSteps.length) * 100)

  return (
    <Card className="bg-card border-border rounded-md overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-0.5">Setup guide</p>
        <h2 className="text-base font-bold text-white/80 leading-tight">Workflow basics</h2>
        <div className="mt-2.5">
          <span className="text-[10px] text-white/30">{workflowDoneCount} of {workflowSteps.length} complete</span>
          <Progress value={pct} className="mt-1 h-1 bg-white/[0.07]" />
        </div>
      </div>

      <div className="px-4 py-3 space-y-2.5">
        {workflowSteps.map((step) => (
          <div key={step.label} className="flex items-center gap-2.5">
            {step.status === "done" ? (
              <div className="w-4 h-4 rounded-full bg-green-500/80 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-2.5 h-2.5 text-white" />
              </div>
            ) : (
              <div className="w-4 h-4 rounded-full border-2 border-white/[0.20] shrink-0" />
            )}
            <span className={`flex-1 text-xs font-medium ${
              step.status === "done" ? "text-white/25 line-through" : "text-white/70"
            }`}>
              {step.label}
            </span>
            <Link
              href={step.href}
              className={`text-xs font-semibold shrink-0 transition-colors ${
                step.status === "done"
                  ? "text-white/25 hover:text-white/50"
                  : "text-white/60 hover:text-white"
              }`}
            >
              {step.status === "done" ? "View" : "Start"}
            </Link>
          </div>
        ))}
      </div>

      <div className="px-4 py-3 border-t border-border">
        <Link
          href="/dashboard/integrations"
          className="flex items-center justify-center gap-1 text-xs font-medium text-white/30 hover:text-white/70 transition-colors"
        >
          View all setup guides <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </Card>
  )
}
