"use client"

import { useState } from "react"
import type { MerchantAnswerName, MerchantAnswers } from "@shopkeeper/agent/types"
import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"
import { isSampleNeedsYouItem } from "./sample-needs-you-items"

type Pending = "approve" | "close" | null

async function send(url: string, method: "POST" | "PATCH", body: unknown): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (response.ok) return null
    const data = await response.json().catch(() => null) as { error?: string } | null
    return data?.error ?? "Could not complete this action."
  } catch {
    return "Network error. Try again."
  }
}

// Approve (with a confirm step for consequential plans) and close-without-reply
// for one NeedsYou item. Shared by the home deck card and the walkthrough card.
export function useNeedsYouActions(
  item: Pick<HomeNeedsAttentionItem, "threadId" | "planId" | "kind" | "blanks">,
  { onApproved, onClosed }: { onApproved: () => void; onClosed: () => void },
) {
  const [pending, setPending] = useState<Pending>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  // A blank in the reply is answered as part of approving it.
  const blanks = item.blanks ?? []
  const [answers, setAnswers] = useState<MerchantAnswers>({})
  const answersMissing = blanks.some(blank => !answers[blank.name]?.trim())

  const run = async (action: Exclude<Pending, null>, request: () => Promise<string | null>, onDone: () => void) => {
    if (pending) return
    setPending(action)
    setError(null)
    const failure = isSampleNeedsYouItem(item.threadId) ? null : await request()
    setPending(null)
    setConfirming(false)
    if (failure) setError(failure)
    else onDone()
  }

  const approve = () => {
    if (answersMissing) return
    if (item.kind === "needs_review" && !confirming) {
      setConfirming(true)
      return
    }
    void run(
      "approve",
      () => send("/api/agent/quick-approve", "POST", {
        threadId: item.threadId,
        planId: item.planId,
        ...(blanks.length > 0 ? { merchantAnswers: answers } : {}),
      }),
      onApproved,
    )
  }

  const close = () => {
    void run(
      "close",
      () => send(`/api/threads/${item.threadId}`, "PATCH", { status: "closed" }),
      onClosed,
    )
  }

  return {
    answers,
    answersMissing,
    blanks,
    setAnswer: (name: MerchantAnswerName, value: string) => setAnswers(current => ({ ...current, [name]: value })),
    approve,
    close,
    cancelConfirm: () => setConfirming(false),
    confirming,
    pending,
    error,
  }
}
