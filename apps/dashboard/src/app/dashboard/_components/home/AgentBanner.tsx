"use client"

import Link from "next/link"
import Image from "next/image"
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
          <div className="relative sm:pt-[40px]">
          <Card className="relative border border-white/[0.06] rounded-2xl overflow-visible" style={{ background: "linear-gradient(135deg, #141414 0%, #0a0a0a 60%, #0d0b0a 100%)" }}>
            {/* Ambient glow — emanates from illustration area */}
            <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
              <div className="absolute -left-8 top-1/2 -translate-y-1/2 w-[320px] h-[200px] rounded-full opacity-[0.07]" style={{ background: "radial-gradient(ellipse at center, #ffffff 0%, transparent 70%)" }} />
              {/* Subtle dot grid texture */}
              <div
                className="absolute inset-0 opacity-[0.06]"
                style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "20px 20px", backgroundPosition: "0px 0px", animation: "dot-drift 4s linear infinite" }}
              />
              {/* Top edge inner highlight */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
            <div className="flex items-stretch justify-left pl-4 sm:min-h-[150px]">
              {/* Illustration — overflows above the card */}
              <div className="hidden sm:block relative w-[220px] shrink-0">
                <div className="absolute bottom-[-10px] left-0 pointer-events-none">
                  <Image src="/illustrations/set-up-agent.png" alt="Set up AI agent" width={220} height={180} className="object-contain object-bottom drop-shadow-[0_8px_24px_rgba(255,255,255,0.06)]" />
                </div>
              </div>

              {/* Content */}
                <div className="flex-1 min-w-0 flex flex-col lg:flex-row lg:items-center lg:gap-6 px-4 py-4 lg:py-3">
                <div className="flex-1 min-w-0 ml-4">
                  <div className="mb-1">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-black bg-amber-400 px-2.5 py-1 rounded-full">
                      <Clock className="w-3 h-3" /> 3-min setup
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-white leading-tight">Set up your AI agent</h2>
                  <p className="text-sm text-white/40 mt-0.5">
                    Automatically resolve the most common questions from your customers.
                  </p>
                </div>

                  <div className="flex flex-row lg:flex-col gap-2 mt-3 lg:mt-0 shrink-0">
                  <Link
                    href="/dashboard/settings?tab=agent"
                    className="flex-1 lg:flex-none text-center bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-black text-sm font-semibold px-5 py-1.5 lg:px-10 lg:py-2 rounded-lg shadow-[0_0_16px_rgba(251,191,36,0.25)] hover:shadow-[0_0_20px_rgba(251,191,36,0.40)] transition-all duration-150 select-none"
                  >
                    Start
                  </Link>
                  <button
                    onClick={dismiss}
                    className="flex-1 lg:flex-none bg-black text-sm font-medium text-white/40 hover:text-white/70 border border-white/10 hover:border-white/20 px-5 py-1.5 lg:px-10 lg:py-2 rounded-lg transition-all duration-150"
                  >
                    Maybe later
                  </button>
                </div>
              </div>
            </div>
          </Card>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
