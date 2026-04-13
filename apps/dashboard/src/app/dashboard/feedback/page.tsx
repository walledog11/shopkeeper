"use client"

import { useState, useRef } from "react"
import { Star, Send } from "lucide-react"
import { Card } from "@/components/ui/card"

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

export default function FeedbackPage() {
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function submit() {
    if (rating === 0) return
    setSubmitting(true)
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment: comment || null, categories: [] }),
      })
      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  const activeRating = hovered || rating

  return (
    <div className="p-5 md:p-6 ">
      <div className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Feedback</h1>
        <p className="text-sm text-muted-foreground mt-1">Share your thoughts to help us improve Clerk.</p>
      </div>

      <Card className="bg-card border-border rounded-md p-6">
        {submitted ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm font-semibold text-white/70">Thanks for the feedback!</p>
            <p className="text-xs text-white/35">It helps us make Clerk better.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-medium text-white/70 mb-3">How are you liking Clerk?</p>
              <div className="flex items-center gap-1">
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
                    className="transition-transform hover:scale-110 p-1"
                  >
                    <Star className={`w-6 h-6 transition-colors ${
                      star <= activeRating ? "fill-amber-400 text-amber-400" : "text-white/20"
                    }`} />
                  </button>
                ))}
                {activeRating > 0 && (
                  <span className="ml-2 text-sm font-medium text-amber-400">
                    {RATING_LABELS[activeRating]}
                  </span>
                )}
              </div>
            </div>

            <div>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value.slice(0, 280))}
                placeholder={getPlaceholder(rating)}
                rows={4}
                className="w-full text-sm text-white/70 bg-white/[0.06] border border-white/[0.12] rounded-md px-3 py-2 focus:outline-none focus:border-white/[0.25] placeholder:text-white/25 resize-none"
              />
              <p className="text-xs text-white/25 mt-1 text-right">{comment.length}/280</p>
            </div>

            <div className="flex justify-end">
              <button
                onClick={submit}
                disabled={rating === 0 || submitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-amber-400 text-black text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-amber-300 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                Send feedback
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
