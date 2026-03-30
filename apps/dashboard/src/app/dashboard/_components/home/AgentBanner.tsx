"use client"

import Link from "next/link"
import { useState, useEffect } from "react"
import { Clock } from "lucide-react"

export default function AgentBanner() {
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setDismissed(localStorage.getItem('agentBannerDismissed') === 'true')
  }, [])

  function dismiss() {
    localStorage.setItem('agentBannerDismissed', 'true')
    setDismissed(true)
  }

  if (dismissed) return null

  return (
    <div className="shrink-0 bg-white rounded-md shadow-md overflow-hidden">
      <div className="flex items-center gap-6 px-6 py-5">
        {/* Illustration — hidden on mobile */}
        <div className="hidden sm:block relative shrink-0" style={{ width: '180px', height: '112px' }}>

          {/* Back card: AI agent persona selector */}
          <div className="absolute left-0 top-0 bg-white rounded-md shadow-md border border-slate-200 overflow-hidden" style={{ width: '108px', height: '100px', zIndex: 1 }}>
            <div className="bg-[#1c3b38] px-2.5 py-1.5">
              <span className="text-[7px] font-bold text-white tracking-wide">AI agent persona</span>
            </div>
            <div className="p-1.5 space-y-1">
              <div className="flex items-center gap-1.5 px-1.5 py-1 rounded border border-slate-100 bg-white">
                <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" /><circle cx="9" cy="10" r="0.8" fill="currentColor" stroke="none" /><circle cx="15" cy="10" r="0.8" fill="currentColor" stroke="none" /><path d="M8.5 15a4 4 0 007 0" strokeLinecap="round" />
                </svg>
              </div>
              <div className="flex items-center gap-1.5 px-1.5 py-1 rounded border border-[#1c3b38] bg-teal-50">
                <svg className="w-3.5 h-3.5 text-[#1c3b38]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" /><path d="M8 13s1.5 3 4 3 4-3 4-3" strokeLinecap="round" /><circle cx="9" cy="9.5" r="0.8" fill="currentColor" stroke="none" /><circle cx="15" cy="9.5" r="0.8" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <div className="flex items-center gap-1.5 px-1.5 py-1 rounded border border-slate-100 bg-white">
                <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" /><circle cx="9" cy="10" r="0.8" fill="currentColor" stroke="none" /><circle cx="15" cy="10" r="0.8" fill="currentColor" stroke="none" /><line x1="9" y1="15" x2="15" y2="15" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          </div>

          {/* Front card: conversation panel */}
          <div className="absolute right-0 bottom-0 flex rounded-md shadow-md border border-slate-200 bg-white overflow-hidden" style={{ width: '128px', height: '96px', zIndex: 2 }}>
            <div className="shrink-0 bg-slate-900 flex flex-col items-center pt-2" style={{ width: '22px' }}>
              <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 7l10 7 10-7" />
              </svg>
            </div>
            <div className="flex-1 px-2 py-2 space-y-2">
              <div className="h-1.5 bg-slate-200 rounded-full w-3/4" />
              <div className="flex items-start gap-1.5">
                <div className="w-4 h-4 rounded-full bg-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1 pt-0.5">
                  <div className="h-1.5 bg-slate-700 rounded-full w-2/3" />
                  <div className="h-1 bg-slate-200 rounded-full w-3/4" />
                </div>
              </div>
              <div className="flex items-start gap-1.5">
                <div className="w-4 h-4 rounded bg-slate-800 shrink-0 mt-0.5 flex items-center justify-center gap-0.5">
                  <div className="w-0.5 h-0.5 rounded-full bg-white" />
                  <div className="w-0.5 h-0.5 rounded-full bg-white" />
                </div>
                <div className="flex-1 space-y-1 pt-0.5">
                  <div className="h-1.5 bg-slate-700 rounded-full w-1/2" />
                  <div className="h-1 bg-slate-200 rounded-full w-full" />
                  <div className="h-1 bg-slate-200 rounded-full w-2/3" />
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Content + actions — stack vertically on mobile, row on desktop */}
        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-6">
          <div className="flex-1 min-w-0">
            <div className="mb-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-teal-700 px-2.5 py-1 rounded-full">
                <Clock className="w-3 h-3" /> 3-min setup
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">Set up your AI agent</h2>
            <p className="text-sm text-slate-500 mt-1">
              Automatically resolve the most common questions from your customers.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mt-4 sm:mt-0 shrink-0">
            <Link
              href="/dashboard/settings"
              className="w-full sm:w-auto text-center bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold px-5 py-2.5 rounded-md transition-colors"
            >
              Start
            </Link>
            <button
              onClick={dismiss}
              className="text-sm font-medium text-slate-400 hover:text-slate-700 transition-colors text-center sm:text-left"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
