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
  return "Anything we can improve? (optional)"
}

const CATEGORIES = ["UI/UX", "AI quality", "Speed", "Integrations", "Pricing"]

export default function FeedbackSurvey() {
  const [visible, setVisible] = useState(false)
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [comment, setComment] = useState("")
  const [categories, setCategories] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true)
  }, [])

  function toggleCategory(cat: string) {
    setCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    )
  }

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
        body: JSON.stringify({ rating, comment: comment || null, categories }),
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
      <Card className="bg-card border-border rounded-md flex flex-col items-center justify-center gap-1 p-4 text-center">
        <p className="text-sm font-semibold text-white/70">Thanks for the feedback!</p>
        <p className="text-xs text-white/35">It helps us make Clerk better.</p>
      </Card>
    )
  }

  return (
    <Card className="bg-card border-border rounded-md flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <span className="text-xs text-white/40">Feedback</span>
        <button onClick={dismiss} className="text-[11px] text-white/25 hover:text-white/50 transition-colors">
          Skip
        </button>
      </div>

      <div className="flex flex-col gap-3 p-3 flex-1">
        {/* Label + stars on one row */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-white/60 leading-snug">How are you liking Clerk?</span>
          <div className="flex items-center gap-1 shrink-0">
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
                className="transition-transform hover:scale-110"
              >
                <Star className={`w-4 h-4 transition-colors ${
                  star <= activeRating ? "fill-amber-400 text-amber-400" : "text-white/20"
                }`} />
              </button>
            ))}
          </div>
        </div>

        {/* Rating label */}
        <span className={`text-[11px] font-medium transition-opacity duration-150 -mt-1 ${activeRating ? "text-amber-400 opacity-100" : "opacity-0"}`}>
          {RATING_LABELS[activeRating] ?? "\u00A0"}
        </span>

        {/* Category chips */}
        <div className={`flex flex-wrap gap-1.5 transition-all duration-200 ${
          rating > 0 ? "opacity-100 max-h-16" : "opacity-0 max-h-0 overflow-hidden pointer-events-none"
        }`}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                categories.includes(cat)
                  ? "bg-amber-400/10 text-amber-400 border-amber-400/20"
                  : "bg-white/[0.04] text-white/40 border-white/[0.08] hover:border-white/[0.15] hover:text-white/60"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Textarea */}
        <div className="relative">
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value.slice(0, MAX_COMMENT))}
            placeholder={getPlaceholder(rating)}
            rows={3}
            className="w-full h-16 bg-white/[0.04] border border-white/[0.08] rounded-md px-3 py-2 text-xs text-white/70 placeholder:text-white/25 resize-none focus:outline-none focus:border-white/20"
          />
          <span className="absolute bottom-2 right-3 text-[10px] text-white/20 select-none pointer-events-none">
            {comment.length}/{MAX_COMMENT}
          </span>
        </div>

        {/* Submit */}
        <button
          onClick={submit}
          disabled={rating === 0 || submitting}
          className="w-full py-1.5 rounded-lg bg-amber-400 text-black text-xs font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-amber-300 transition-colors shrink-0"
        >
          Send feedback
        </button>
      </div>
    </Card>
  )
}
