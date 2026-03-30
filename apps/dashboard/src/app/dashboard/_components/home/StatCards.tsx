import Link from "next/link"
import { Inbox, CheckCircle2, MessageSquare } from "lucide-react"

interface Props {
  isLoading: boolean
  openCount: number
  resolvedCount: number
  totalMessageCount: number
}

export default function StatCards({ isLoading, openCount, resolvedCount, totalMessageCount }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3 shrink-0">
      <Link
        href="/dashboard/tickets"
        className="group block bg-white border border-slate-200 hover:border-orange-200 rounded-md px-4 py-4 flex items-center justify-between shadow-md hover:shadow-lg hover:-translate-y-px transition-all"
      >
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Open</p>
          <p className="text-3xl font-extrabold text-teal-700 leading-none">
            {isLoading ? <span className="text-slate-200">—</span> : openCount}
          </p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-50 to-amber-100 flex items-center justify-center group-hover:from-orange-100 group-hover:to-amber-200 transition-all">
          <Inbox className="w-5 h-5 text-orange-500" />
        </div>
      </Link>

      <div className="bg-white border border-slate-200 hover:border-green-200 rounded-md px-4 py-4 flex items-center justify-between shadow-md hover:shadow-lg hover:-translate-y-px transition-all">
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Resolved</p>
          <p className="text-3xl font-extrabold text-slate-800 leading-none">
            {resolvedCount}
          </p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
          <CheckCircle2 className="w-5 h-5 text-green-500" />
        </div>
      </div>

      <div className="bg-white border border-slate-200 hover:border-blue-200 rounded-md px-4 py-4 flex items-center justify-between shadow-md hover:shadow-lg hover:-translate-y-px transition-all">
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Messages</p>
          <p className="text-3xl font-extrabold text-slate-800 leading-none">
            {totalMessageCount.toLocaleString()}
          </p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-sky-100 flex items-center justify-center">
          <MessageSquare className="w-5 h-5 text-blue-500" />
        </div>
      </div>
    </div>
  )
}
