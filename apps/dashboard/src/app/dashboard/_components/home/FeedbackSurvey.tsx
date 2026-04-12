"use client"

import { useState, useEffect, useRef } from "react"
import { Star } from "lucide-react"
import { Card } from "@/components/ui/card"

const STORAGE_KEY = "clerk_platform_feedback_v1"

export default function FeedbackSurvey() {
  const [visible, setVisible] = useState(false)
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [comment, setComment] = useState("")
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true)
  }, [])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "skipped")
    setVisible(false)
  }

  async function submit() {
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, comment }),
    }).catch(() => {})
    localStorage.setItem(STORAGE_KEY, "submitted")
    setSubmitted(true)
    setTimeout(() => setVisible(false), 2500)
  }

  if (!visible) return null

  if (submitted) {
    return (
      <Card className="bg-card border-border rounded-md p-5 text-center">
        <p className="text-sm font-semibold text-white/70">Thanks for your feedback!</p>
        <p className="text-xs text-white/35 mt-1">It helps us make Clerk better.</p>
      </Card>
    )
  }

  return (
    <Card className="bg-card border-border rounded-md p-5 flex flex-col items-center text-center">
      <p className="text-sm font-semibold text-white/70 mb-0.5">How are you liking Clerk so far?</p>
      <p className="text-xs text-white/35 mb-4">Your feedback helps us improve the platform.</p>

      <div className="flex items-center gap-2 mb-4">
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
            <Star
              className={`w-7 h-7 transition-colors ${
                star <= (hovered || rating)
                  ? "fill-green-400 text-green-400"
                  : "text-white/20"
              }`}
            />
          </button>
        ))}
      </div>

      <textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        placeholder="Anything we can improve? (optional)"
        rows={4}
        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-4 py-3 text-sm text-white/70 placeholder:text-white/25 resize-none focus:outline-none focus:border-white/20 mb-4"
      />

      <button
        onClick={submit}
        disabled={rating === 0}
        className="w-full py-2.5 rounded-full bg-green-400 text-black text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-green-300 transition-colors mb-3"
      >
        Send feedback
      </button>
      <button
        onClick={dismiss}
        className="text-sm text-white/25 hover:text-white/50 transition-colors"
      >
        Skip for now
      </button>
    </Card>
  )
}
