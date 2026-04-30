"use client"

import { useState, useEffect, useRef } from "react"
import { Star } from "lucide-react"
import { Card } from "@/components/ui/card"

const STORAGE_KEY = "clerk_platform_feedback_v1"
const MAX_COMMENT = 280

const RATING_LABELS: Record<number, string> = {
  1: "Terrible",
  2: "Bad",
  3: "Okay",
  4: "Good",
  5: "Amazing",
}

function getPlaceholder(r: number) {
  if (r >= 4) return "What do you love most? (optional)"
  if (r === 3) return "Any suggestions? (optional)"
  if (r >= 1) return "What went wrong? (optional)"
  return "Leave a comment… (optional)"
}

export default function FeedbackSurvey() {
  const [visible, setVisible] = useState(false)
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [comment, setComment] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true)
  }, [])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "skipped")
    setVisible(false)
  }

  async function submit() {
    setSubmitting(true)
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment: comment || null, categories: [] }),
      })
    } catch {}
    localStorage.setItem(STORAGE_KEY, "submitted")
    setSubmitted(true)
    setTimeout(() => setVisible(false), 2500)
  }

  if (!visible) return null

  const activeRating = hovered || rating

  if (submitted) {
    return (
      <Card className="bg-card border-border rounded-md flex items-center justify-center gap-1.5 px-4 py-3">
        <p className="text-xs font-semibold text-white/60">Thanks for the feedback!</p>
        <p className="text-xs text-white/30">It helps us make Clerk better.</p>
      </Card>
    )
  }

  return (
    <Card className="bg-card border-border rounded-md">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 px-4 py-3">
        {/* Row 1 (mobile) / inline (desktop): label + stars + rating label */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xs text-white/40 shrink-0">How are you liking Clerk?</span>

          {/* Stars */}
          <div className="flex items-center gap-0.5 shrink-0">
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                onMouseEnter={() => {
                  if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
                  setHovered(star)
                }}
                onMouseLeave={() => {
                  hoverTimeout.current = setTimeout(() => setHovered(0), 80)
                }}
                onClick={() => setRating(star)}
                className="transition-transform hover:scale-110 p-0.5"
              >
                <Star className={`w-4 h-4 transition-colors ${
                  star <= activeRating ? "fill-amber-400 text-amber-400" : "text-white/20"
                }`} />
              </button>
            ))}
          </div>

          {/* Rating label */}
          <span className={`text-[11px] font-medium w-12 shrink-0 transition-opacity duration-150 ${activeRating ? "text-amber-400 opacity-100" : "opacity-0"}`}>
            {RATING_LABELS[activeRating] ?? ""}
          </span>
        </div>

        {/* Row 2 (mobile) / inline (desktop): input + submit + skip */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {/* Comment input */}
          <input
            type="text"
            value={comment}
            onChange={e => setComment(e.target.value.slice(0, MAX_COMMENT))}
            placeholder={getPlaceholder(rating)}
            className="flex-1 min-w-0 bg-white/[0.04] border border-white/[0.08] rounded-md px-3 py-1.5 text-xs text-white/70 placeholder:text-white/25 focus:outline-none focus:border-white/20"
          />

          {/* Submit */}
          <button
            onClick={submit}
            disabled={rating === 0 || submitting}
            className="shrink-0 px-3 py-1.5 rounded-md bg-amber-400 text-black text-xs font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-amber-300 transition-colors"
          >
            Send
          </button>

          {/* Skip */}
          <button
            onClick={dismiss}
            className="shrink-0 text-[11px] text-white/25 hover:text-white/50 transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </Card>
  )
}
