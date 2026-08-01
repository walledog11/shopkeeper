import Link from "next/link"
import type { HomeClearedTopic } from "@/lib/home/summary-contract"

interface Props {
  agentName: string
  totalCount: number
  topics: HomeClearedTopic[]
}

const TOPIC_PROSE: Record<string, string> = {
  General: "other",
  needs_human: "handed to you",
}

function topicPhrase(tag: string): string {
  return TOPIC_PROSE[tag] ?? tag.toLowerCase()
}

function breakdownOf(totalCount: number, topics: HomeClearedTopic[]): string {
  const listed = topics.reduce((sum, topic) => sum + topic.count, 0)
  const parts = topics.map(topic => ({ phrase: topicPhrase(topic.tag), count: topic.count }))
  const remainder = totalCount - listed

  if (remainder > 0) {
    const other = parts.find(part => part.phrase === "other")
    if (other) other.count += remainder
    else parts.push({ phrase: "other", count: remainder })
  }

  return parts.map(part => `${part.count} ${part.phrase}`).join(", ")
}

export default function ClearedOvernight({ agentName, totalCount, topics }: Props) {
  if (totalCount === 0) return null

  const breakdown = breakdownOf(totalCount, topics)

  return (
    <section className="flex items-baseline gap-3 flex-wrap">
      <h2 className="text-sm font-bold text-strong">
        {agentName} cleared {totalCount} overnight{breakdown ? ` — ${breakdown}` : ""}
      </h2>
      <Link
        href="/dashboard/review"
        className="text-xs font-semibold text-muted-foreground hover:text-strong transition-colors"
      >
        See what was sent
      </Link>
    </section>
  )
}
