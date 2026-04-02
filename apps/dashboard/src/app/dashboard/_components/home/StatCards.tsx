"use client"

import Link from "next/link"
import { Inbox, CheckCircle2, MessageSquare } from "lucide-react"
import { motion, useMotionValue, useTransform, animate } from "motion/react"
import { useEffect } from "react"

const MotionLink = motion.create(Link)

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
    <div className="grid grid-cols-3 gap-3 shrink-0">
      <MotionLink
        href="/dashboard/tickets"
        whileHover={{ y: -3 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="group block bg-white border border-slate-200 hover:border-orange-200 rounded-md px-4 py-4 flex items-center justify-between shadow-md hover:shadow-lg transition-colors"
      >
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Open</p>
          <p className="text-3xl font-extrabold text-teal-700 leading-none">
            {isLoading ? <span className="text-slate-200">—</span> : <AnimatedNumber value={openCount} />}
          </p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-50 to-amber-100 flex items-center justify-center group-hover:from-orange-100 group-hover:to-amber-200 transition-all">
          <Inbox className="w-5 h-5 text-orange-500" />
        </div>
      </MotionLink>

      <motion.div
        whileHover={{ y: -3 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="bg-white border border-slate-200 hover:border-green-200 rounded-md px-4 py-4 flex items-center justify-between shadow-md hover:shadow-lg transition-colors"
      >
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Resolved</p>
          <p className="text-3xl font-extrabold text-slate-800 leading-none">
            <AnimatedNumber value={resolvedCount} />
          </p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
          <CheckCircle2 className="w-5 h-5 text-green-500" />
        </div>
      </motion.div>

      <motion.div
        whileHover={{ y: -3 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="bg-white border border-slate-200 hover:border-blue-200 rounded-md px-4 py-4 flex items-center justify-between shadow-md hover:shadow-lg transition-colors"
      >
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Messages</p>
          <p className="text-3xl font-extrabold text-slate-800 leading-none">
            <AnimatedNumber value={totalMessageCount} format={(n) => n.toLocaleString()} />
          </p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-sky-100 flex items-center justify-center">
          <MessageSquare className="w-5 h-5 text-blue-500" />
        </div>
      </motion.div>
    </div>
  )
}
