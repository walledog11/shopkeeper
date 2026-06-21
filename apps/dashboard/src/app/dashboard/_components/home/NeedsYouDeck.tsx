"use client"

import { useState } from "react"
import { StackDeck } from "@/app/dashboard/_components/stack/StackDeck"
import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"
import { NeedsYouAllClear } from "./NeedsYouAllClear"
import { NeedsYouCard, NeedsYouCardPeek } from "./NeedsYouCards"

interface Props {
  items: HomeNeedsAttentionItem[]
  agentName: string
  onApproved: () => void
}

export function NeedsYouDeck({ items, agentName, onApproved }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const [currentId, setCurrentId] = useState<string | null>(null)
  const deck = items.filter(item => !dismissed.has(item.threadId))

  const dismiss = (
    threadId: string,
    activeIndex: number,
    flyOff: (sign: -1 | 1) => Promise<boolean>,
  ) => {
    const next = deck.length > 0 ? deck[(activeIndex + 1) % deck.length] : null
    void flyOff(-1).then(animated => {
      if (deck.length > 1 && !animated) return
      setDismissed(prev => new Set(prev).add(threadId))
      setCurrentId(next && next.threadId !== threadId ? next.threadId : null)
      onApproved()
    })
  }

  return (
    <section id="needs-you" className="mt-10 flex flex-col gap-2.5">
      <StackDeck
        items={deck}
        className="flex flex-col gap-3 w-full"
        getId={(item) => item.threadId}
        activeId={currentId}
        empty={<NeedsYouAllClear agentName={agentName} />}
        stackSingleItem
        isDraggable={(item) => item.kind !== "needs_merchant_input"}
        labels={{ previous: "Previous card", next: "Next card" }}
        controls="dots"
        peekShellClassName="h-full w-full rounded-3xl border border-border bg-card shadow-sm pointer-events-none box-border"
        onCurrentChange={(_, id) => setCurrentId(id)}
        renderCard={(item, context) => (
          <NeedsYouCard
            item={item}
            agentName={agentName}
            onSent={() => dismiss(item.threadId, context.activeIndex, context.flyOff)}
            onAnswered={onApproved}
          />
        )}
        renderPeekCard={(item, context) => (
          <NeedsYouCardPeek
            item={item}
            agentName={agentName}
            minHeight={context.frontHeight > 0 ? context.frontHeight : undefined}
          />
        )}
      />
    </section>
  )
}
