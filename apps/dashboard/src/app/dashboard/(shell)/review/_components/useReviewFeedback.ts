"use client"

import { useCallback, useState } from "react"
import type { ActionLogEntry } from "@/types"

export type ReviewFeedback = ActionLogEntry["feedback"]

export function useReviewFeedback() {
  const [overrides, setOverrides] = useState<Record<string, ReviewFeedback | undefined>>({})

  const feedbackFor = useCallback(
    (entry: ActionLogEntry): ReviewFeedback => {
      const override = overrides[entry.id]
      return override === undefined ? (entry.feedback ?? null) : override
    },
    [overrides],
  )

  const changeFeedback = useCallback((entry: ActionLogEntry, next: ReviewFeedback) => {
    const previous = feedbackFor(entry)
    setOverrides(current => ({ ...current, [entry.id]: next }))

    void fetch("/api/agent/actions/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnId: entry.id, feedback: next }),
    }).then(response => {
      if (!response.ok) throw new Error("feedback failed")
    }).catch(() => {
      setOverrides(current => ({ ...current, [entry.id]: previous }))
    })
  }, [feedbackFor])

  return { changeFeedback, feedbackFor }
}
