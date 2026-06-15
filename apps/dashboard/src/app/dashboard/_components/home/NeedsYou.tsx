"use client"

import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"
import { NeedsYouAllClear } from "./NeedsYouAllClear"
import { NeedsYouDeck } from "./NeedsYouDeck"

interface Props {
  items: HomeNeedsAttentionItem[]
  agentName: string
  onApproved: () => void
}

export default function NeedsYou({ items, agentName, onApproved }: Props) {
  if (items.length === 0) return <NeedsYouAllClear agentName={agentName} />

  return <NeedsYouDeck items={items} agentName={agentName} onApproved={onApproved} />
}
