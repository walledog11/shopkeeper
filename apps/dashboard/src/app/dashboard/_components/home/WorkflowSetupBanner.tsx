"use client"

import Link from "next/link"
import { useState } from "react"
import { Check, ChevronDown, ChevronRight, X } from "lucide-react"
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react"

const DISMISS_KEY = 'workflowSetupBannerDismissed'
const EXPAND_KEY = 'workflowSetupBannerExpanded'
const PROGRESS_RING_RADIUS = 8
const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RING_RADIUS

function readStoredBoolean(key: string) {
  try {
    return localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

function writeStoredBoolean(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? 'true' : 'false')
  } catch {
    // Storage can be unavailable in private browsing or restricted contexts.
  }
}

const bannerTransition = {
  type: "spring" as const,
  stiffness: 520,
  damping: 38,
}

const stepsListVariants = {
  collapsed: {
    height: 0,
    opacity: 0,
    transition: {
      height: { duration: 0.12, ease: "easeInOut" as const },
      opacity: { duration: 0.06 },
      staggerChildren: 0.01,
      staggerDirection: -1 as const,
    },
  },
  open: {
    height: "auto",
    opacity: 1,
    transition: {
      height: { duration: 0.16, ease: "easeOut" as const },
      opacity: { duration: 0.08 },
      staggerChildren: 0.018,
    },
  },
}

const stepItemVariants = {
  collapsed: {
    opacity: 0,
    y: -2,
    transition: { duration: 0.06 },
  },
  open: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.1, ease: "easeOut" as const },
  },
}

interface Step {
  label: string
  href: string
  status: "done" | "pending"
}

interface Props {
  steps: Step[]
  doneCount: number
}

function getStepKey(step: Step) {
  return `${step.label}:${step.href}`
}

export default function WorkflowSetupBanner({ steps, doneCount }: Props) {
  const [dismissed, setDismissed] = useState(() => readStoredBoolean(DISMISS_KEY))
  const [expanded, setExpanded] = useState(() => readStoredBoolean(EXPAND_KEY))

  const totalCount = steps.length

  const isVisible = dismissed === false && doneCount < totalCount

  const remaining = Math.max(totalCount - doneCount, 0)
  const progress = totalCount > 0 ? Math.min(Math.max(doneCount / totalCount, 0), 1) : 0
  const progressOffset = PROGRESS_RING_CIRCUMFERENCE * (1 - progress)
  const summary = `${remaining} left to finish setup`

  function dismiss() {
    writeStoredBoolean(DISMISS_KEY, true)
    setDismissed(true)
  }

  function toggle() {
    const next = !expanded
    setExpanded(next)
    writeStoredBoolean(EXPAND_KEY, next)
  }

  return (
    <LazyMotion features={domAnimation}>
    <AnimatePresence>
      {isVisible && (
        <m.div
          key="workflow-setup-banner"
          initial={{ opacity: 0, height: 0, y: -6 }}
          animate={{ opacity: 1, height: "auto", y: 0 }}
          exit={{ opacity: 0, height: 0, y: -6 }}
          transition={bannerTransition}
          className="rounded-md border border-foreground/[0.07] bg-foreground/[0.02] shrink-0 overflow-hidden"
        >
          <div className="flex items-center gap-3 px-4 py-2.5">
            <button
              type="button"
              onClick={toggle}
              className="flex items-center gap-3 min-w-0 flex-1 text-left"
              aria-expanded={expanded}
            >
              <m.div
                aria-hidden="true"
                whileHover={{ scale: 1.08 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="size-5 shrink-0"
              >
                <svg viewBox="0 0 20 20" className="size-5">
                  <circle
                    cx="10"
                    cy="10"
                    r={PROGRESS_RING_RADIUS}
                    fill="none"
                    strokeWidth="2"
                    className="stroke-green-400/15"
                  />
                  <m.circle
                    cx="10"
                    cy="10"
                    r={PROGRESS_RING_RADIUS}
                    fill="none"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="stroke-green-400"
                    strokeDasharray={PROGRESS_RING_CIRCUMFERENCE}
                    initial={false}
                    animate={{ strokeDashoffset: progressOffset }}
                    transition={{ duration: 0.28, ease: "easeOut" }}
                    transform="rotate(-90 10 10)"
                  />
                </svg>
              </m.div>
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className="text-xs font-semibold text-foreground/80 shrink-0">
                  Workflow setup · {doneCount} of {totalCount}
                </span>
                <span className="text-foreground/15">—</span>
                <span className="text-xs text-foreground/45 truncate">{summary}</span>
              </div>
              <m.div
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={{ duration: 0.18, ease: "easeInOut" }}
                className="shrink-0"
              >
                <ChevronDown className="size-3.5 text-foreground/40" />
              </m.div>
            </button>
            <m.button
              type="button"
              onClick={dismiss}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              className="size-6 rounded flex items-center justify-center text-foreground/30 hover:text-foreground/70 hover:bg-foreground/[0.04] transition-colors shrink-0"
              aria-label="Dismiss"
            >
              <X className="size-3.5" />
            </m.button>
          </div>

          <AnimatePresence initial={false}>
            {expanded && (
              <m.div
                key="workflow-setup-steps"
                variants={stepsListVariants}
                initial="collapsed"
                animate="open"
                exit="collapsed"
                className="overflow-hidden"
              >
                <ul className="border-t border-foreground/[0.06] px-2 py-1.5">
                  {steps.map((step) => {
                    const isDone = step.status === "done"
                    const stepKey = getStepKey(step)
                    if (isDone) {
                      return (
                        <m.li
                          key={stepKey}
                          variants={stepItemVariants}
                          className="flex items-center gap-3 px-2.5 py-2 rounded-md"
                        >
                          <span className="size-4 rounded-full bg-green-400/15 border border-green-400/40 flex items-center justify-center shrink-0">
                            <Check className="size-2.5 text-green-400" />
                          </span>
                          <span className="text-xs text-foreground/40 line-through truncate flex-1">
                            {step.label}
                          </span>
                        </m.li>
                      )
                    }
                    return (
                      <m.li key={stepKey} variants={stepItemVariants}>
                        <Link
                          href={step.href}
                          className="group flex items-center gap-3 px-2.5 py-2 rounded-md hover:bg-foreground/[0.03] transition-colors"
                        >
                          <span className="size-4 rounded-full border border-foreground/25 shrink-0" />
                          <span className="text-xs text-foreground/80 group-hover:text-white truncate flex-1">
                            {step.label}
                          </span>
                          <ChevronRight className="size-3.5 text-foreground/30 group-hover:text-foreground/60 shrink-0 transition-colors" />
                        </Link>
                      </m.li>
                    )
                  })}
                </ul>
              </m.div>
            )}
          </AnimatePresence>
        </m.div>
      )}
    </AnimatePresence>
    </LazyMotion>
  )
}
