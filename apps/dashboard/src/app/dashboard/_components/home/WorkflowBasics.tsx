import Image from "next/image"
import Link from "next/link"
import { CheckCircle2, ArrowRight } from "lucide-react"

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
  return (
    <div className="bg-gradient-to-br from-teal-50 to-slate-50 rounded-md shadow-md overflow-hidden">
      <div className="relative px-4 pt-4 pb-3 border-b border-slate-200/70">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold text-teal-600 uppercase tracking-widest mb-0.5">Setup guide</p>
            <h2 className="text-base font-bold text-slate-900 leading-tight">Workflow<br />basics</h2>
          </div>
          <div className="shrink-0 w-20 h-14 overflow-hidden rounded-md">
            <Image
              src="/illustrations/workflow-basics.svg"
              alt="Workflow basics"
              width={160}
              height={90}
              className="w-full h-full object-cover object-left"
            />
          </div>
        </div>
        <div className="mt-2.5">
          <span className="text-[10px] text-slate-500">{workflowDoneCount} of {workflowSteps.length} complete</span>
          <div className="h-1 bg-slate-200 rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-teal-600 rounded-full transition-all duration-500"
              style={{ width: `${(workflowDoneCount / workflowSteps.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="px-4 py-3 space-y-2.5">
        {workflowSteps.map((step) => (
          <div key={step.label} className="flex items-center gap-2.5">
            {step.status === "done" ? (
              <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-2.5 h-2.5 text-white" />
              </div>
            ) : (
              <div className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />
            )}
            <span className={`flex-1 text-xs font-medium ${step.status === "done" ? "text-slate-400 line-through" : "text-slate-700"}`}>
              {step.label}
            </span>
            <Link
              href={step.href}
              className={`text-xs font-semibold shrink-0 transition-colors ${
                step.status === "done"
                  ? "text-slate-400 hover:text-slate-600"
                  : "text-teal-700 hover:text-teal-900"
              }`}
            >
              {step.status === "done" ? "View" : "Start"}
            </Link>
          </div>
        ))}
      </div>

      <div className="px-4 py-3 border-t border-slate-200/70">
        <Link
          href="/dashboard/integrations"
          className="flex items-center justify-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
        >
          View all setup guides <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  )
}
