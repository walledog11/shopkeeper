"use client"

import Link from "next/link"
import { useState } from "react"
import { Check, ChevronDown, ChevronRight, X } from "lucide-react"
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react"
import {
  writeWorkflowBannerDismissedCookie,
  writeWorkflowBannerExpandedCookie,
} from "@/lib/dashboard-dismissals"
import { boardCardShadowClassName } from "@/lib/ui/board-card-styles"
import { cn } from "@/lib/ui/cn"

const bannerShellClassName = cn(
  "shrink-0 overflow-hidden rounded-2xl border border-border bg-white",
  boardCardShadowClassName("briefing"),
)

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
  optional?: boolean
}

interface Props {
  steps: Step[]
  /** Step status is derived from the home summary; suppress the banner until it lands. */
  pending?: boolean
  initialDismissed?: boolean
  initialExpanded?: boolean
}

function getStepKey(step: Step) {
  return `${step.label}:${step.href}`
}

export default function WorkflowSetupBanner({
  steps,
  pending = false,
  initialDismissed = false,
  initialExpanded = false,
}: Props) {
  const [dismissed, setDismissed] = useState(initialDismissed)
  const [expanded, setExpanded] = useState(initialExpanded)

  const trackedSteps = steps.filter(step => !step.optional)
  const trackedDoneCount = trackedSteps.filter(step => step.status === "done").length
  const totalCount = trackedSteps.length

  const isVisible = pending === false && dismissed === false && trackedDoneCount < totalCount

  function dismiss() {
    writeWorkflowBannerDismissedCookie()
    setDismissed(true)
  }

  function toggle() {
    const next = !expanded
    setExpanded(next)
    writeWorkflowBannerExpandedCookie(next)
  }

  return (
    <LazyMotion features={domAnimation}>
    {/* `initial={false}` so the banner is already at full height on the first
        paint — animating in from height 0 pushed the whole page down on load. */}
    <AnimatePresence initial={false}>
      {isVisible && (
        <m.div
          key="workflow-setup-banner"
          initial={{ opacity: 0, height: 0, y: -6 }}
          animate={{ opacity: 1, height: "auto", y: 0 }}
          exit={{ opacity: 0, height: 0, y: -6 }}
          transition={bannerTransition}
          className={bannerShellClassName}
        >
          <div className="flex items-center gap-2 px-4 py-3 sm:px-5">
            <button
              type="button"
              onClick={toggle}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              aria-expanded={expanded}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-strong">
                  Workflow setup
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {trackedDoneCount} of {totalCount} complete
                </p>
              </div>
              <m.div
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={{ duration: 0.18, ease: "easeInOut" }}
                className="shrink-0"
              >
                <ChevronDown className="size-4 text-faint" />
              </m.div>
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="flex size-8 shrink-0 items-center justify-center rounded-xl text-faint transition-colors hover:bg-foreground/[0.04] hover:text-strong"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
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
                <ul className="border-t border-border/60 px-2 py-2 sm:px-3">
                  {steps.map((step) => {
                    const isDone = step.status === "done"
                    const stepKey = getStepKey(step)
                    if (isDone) {
                      return (
                        <m.li
                          key={stepKey}
                          variants={stepItemVariants}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                        >
                          <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                            <Check className="size-3" />
                          </span>
                          <span className="flex-1 truncate text-sm text-muted-foreground line-through">
                            {step.label}
                          </span>
                        </m.li>
                      )
                    }
                    return (
                      <m.li key={stepKey} variants={stepItemVariants}>
                        <Link
                          href={step.href}
                          className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-foreground/[0.04]"
                        >
                          <span className="size-5 shrink-0 rounded-full border-2 border-foreground/15" />
                          <span className="flex-1 truncate text-sm text-strong group-hover:text-foreground">
                            {step.label}
                            {step.optional ? <span className="text-faint"> · optional</span> : null}
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-faint transition-colors group-hover:text-muted-foreground" />
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
