"use client"

import Link from "next/link"
import { useState, useEffect } from "react"
import { Clock } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { Card } from "@/components/ui/card"

export default function AgentBanner() {
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('agentBannerDismissed') === 'true') setDismissed(true)
  }, [])

  function dismiss() {
    localStorage.setItem('agentBannerDismissed', 'true')
    setDismissed(true)
  }

  return (
    <AnimatePresence initial={false}>
      {!dismissed && (
        <motion.div
          key="agent-banner"
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 1, 1] }}
          className="overflow-hidden shrink-0"
        >
          <Card className="bg-card border-border rounded-md overflow-hidden">
            <div className="flex items-center gap-6 px-6 py-5">
              {/* Illustration — hidden on mobile */}
              <div className="hidden sm:block relative shrink-0" style={{ width: '180px', height: '112px' }}>
                {/* Back card */}
                <div className="absolute left-0 top-0 bg-[#1a1a1a] rounded-md border border-white/[0.08] overflow-hidden" style={{ width: '108px', height: '100px', zIndex: 1 }}>
                  <div className="bg-white/[0.06] px-2.5 py-1.5">
                    <span className="text-[7px] font-bold text-white/50 tracking-wide">AI agent persona</span>
                  </div>
                  <div className="p-1.5 space-y-1">
                    {[false, true, false].map((active, i) => (
                      <div key={i} className={`flex items-center gap-1.5 px-1.5 py-1 rounded border ${active ? 'border-white/[0.20] bg-white/[0.08]' : 'border-white/[0.06] bg-transparent'}`}>
                        <svg className={`w-3.5 h-3.5 ${active ? 'text-white/60' : 'text-white/25'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <circle cx="12" cy="12" r="10" />
                          {active
                            ? <path d="M8 13s1.5 3 4 3 4-3 4-3" strokeLinecap="round" />
                            : <line x1="9" y1="15" x2="15" y2="15" strokeLinecap="round" />
                          }
                          <circle cx="9" cy="9.5" r="0.8" fill="currentColor" stroke="none" />
                          <circle cx="15" cy="9.5" r="0.8" fill="currentColor" stroke="none" />
                        </svg>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Front card */}
                <div className="absolute right-0 bottom-0 flex rounded-md border border-white/[0.08] bg-[#141414] overflow-hidden" style={{ width: '128px', height: '96px', zIndex: 2 }}>
                  <div className="shrink-0 bg-white/[0.05] flex flex-col items-center pt-2" style={{ width: '22px' }}>
                    <svg className="w-3 h-3 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 7l10 7 10-7" />
                    </svg>
                  </div>
                  <div className="flex-1 px-2 py-2 space-y-2">
                    <div className="h-1.5 bg-white/[0.08] rounded-full w-3/4" />
                    <div className="flex items-start gap-1.5">
                      <div className="w-4 h-4 rounded-full bg-yellow-400/80 shrink-0 mt-0.5" />
                      <div className="flex-1 space-y-1 pt-0.5">
                        <div className="h-1.5 bg-white/[0.20] rounded-full w-2/3" />
                        <div className="h-1 bg-white/[0.07] rounded-full w-3/4" />
                      </div>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <div className="w-4 h-4 rounded bg-white/[0.10] shrink-0 mt-0.5 flex items-center justify-center gap-0.5">
                        <div className="w-0.5 h-0.5 rounded-full bg-white/50" />
                        <div className="w-0.5 h-0.5 rounded-full bg-white/50" />
                      </div>
                      <div className="flex-1 space-y-1 pt-0.5">
                        <div className="h-1.5 bg-white/[0.20] rounded-full w-1/2" />
                        <div className="h-1 bg-white/[0.07] rounded-full w-full" />
                        <div className="h-1 bg-white/[0.07] rounded-full w-2/3" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-6">
                <div className="flex-1 min-w-0">
                  <div className="mb-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-black bg-yellow-400 px-2.5 py-1 rounded-full">
                      <Clock className="w-3 h-3" /> 3-min setup
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-white leading-tight">Set up your AI agent</h2>
                  <p className="text-sm text-white/40 mt-1">
                    Automatically resolve the most common questions from your customers.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mt-4 sm:mt-0 shrink-0">
                  <Link
                    href="/dashboard/settings?tab=agent"
                    className="w-full sm:w-auto text-center bg-yellow-400 hover:bg-yellow-300 text-black text-sm font-semibold px-5 py-2.5 rounded-md transition-colors"
                  >
                    Start
                  </Link>
                  <button
                    onClick={dismiss}
                    className="text-sm font-medium text-white/25 hover:text-white/60 transition-colors text-center sm:text-left"
                  >
                    Maybe later
                  </button>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
