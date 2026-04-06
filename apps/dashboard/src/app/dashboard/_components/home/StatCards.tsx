"use client"

import Link from "next/link"
import { Inbox, CheckCircle2, MessageSquare } from "lucide-react"
import { motion, useMotionValue, useTransform, animate } from "motion/react"
import { useEffect } from "react"
import { Card } from "@/components/ui/card"

const MotionLink = motion.create(Link)
const MotionCard = motion.create(Card)

function AnimatedNumber({ value, format }: { value: number; format?: (n: number) => string }) {
  const count = useMotionValue(0)
  const display = useTransform(count, (latest) => {
    const rounded = Math.round(latest)
    return format ? format(rounded) : String(rounded)
  })

  useEffect(() => {
    const controls = animate(count, value, { duration: 0.8, ease: [0.16, 1, 0.3, 1] })
    return () => controls.stop()
  }, [count, value])

  return <motion.span>{display}</motion.span>
}

interface Props {
  isLoading: boolean
  openCount: number
  resolvedCount: number
  totalMessageCount: number
}

export default function StatCards({ isLoading, openCount, resolvedCount, totalMessageCount }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3 shrink-0 items-start">
      
      {/* OPEN CARD */}
      <MotionLink
        href="/dashboard/tickets"
        whileHover={{ y: -2 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="group flex items-center justify-between px-4 py-4 rounded-md bg-card border border-border hover:border-white/[0.14] transition-colors"
      >
        <div>
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wide mb-1">Open</p>
          <p className="text-3xl font-extrabold text-white leading-none">
            {isLoading ? <span className="text-white/15">—</span> : <AnimatedNumber value={openCount} />}
          </p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center group-hover:bg-white/[0.08] transition-colors">
          <Inbox className="w-5 h-5 text-white/40" />
        </div>
      </MotionLink>

      {/* RESOLVED CARD */}
      <MotionCard
        whileHover={{ y: -2 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="flex-row items-center justify-between px-4 py-4 hover:border-white/[0.14] transition-colors"
      >
       <div>
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wide mb-1">Resolved</p>
          <p className="text-3xl font-extrabold text-white leading-none">
            <AnimatedNumber value={resolvedCount} />
          </p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center">
          <CheckCircle2 className="w-5 h-5 text-white/40" />
        </div>
      </MotionCard>

      {/* MESSAGES CARD */}
      <MotionCard
        whileHover={{ y: -2 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="flex-row items-center justify-between px-4 py-4 hover:border-white/[0.14] transition-colors"
      >
        <div>
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wide mb-1">Messages</p>
          <p className="text-3xl font-extrabold text-white leading-none">
            <AnimatedNumber value={totalMessageCount} format={(n) => n.toLocaleString()} />
          </p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center">
          <MessageSquare className="w-5 h-5 text-white/40" />
        </div>
      </MotionCard>

    </div>
  )
}