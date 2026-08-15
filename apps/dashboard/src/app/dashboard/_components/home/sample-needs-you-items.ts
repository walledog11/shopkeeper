import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"

export const SAMPLE_NEEDS_YOU_ITEMS: HomeNeedsAttentionItem[] = [
  {
    threadId: "sample-return-policy",
    kind: "quick_reply",
    customerName: "Maya Chen",
    customerMessage: "Hi! I ordered the linen throw last week — what's your return window if the color doesn't work in my living room?",
    channelName: "Email",
    timeAgo: "12m ago",
    lastMessageAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    headline: "Return policy question",
    contextLine: "Customer asking about return window for a recent linen throw order.",
    proposalSummary: "",
    actionText: null,
    replyText:
      "Hi Maya — thanks for reaching out! You have 30 days from delivery to return unworn items in original packaging. I can send a prepaid label if you'd like to swap for another color.",
    question: null,
    orderRef: "#1042",
    tag: "returns",
    isVip: false,
  },
  {
    threadId: "sample-refund-review",
    kind: "needs_review",
    customerName: "Jordan Ellis",
    customerMessage: "The ceramic mug arrived cracked. I'd like a refund instead of a replacement if that's okay.",
    channelName: "Instagram",
    timeAgo: "34m ago",
    lastMessageAt: new Date(Date.now() - 34 * 60_000).toISOString(),
    headline: "Damaged item refund",
    contextLine: "Customer received a cracked mug and requested a refund.",
    proposalSummary: "",
    actionText: "Issue a $28.00 refund on order #1038 for the cracked Ceramic Mug.",
    replyText:
      "So sorry about the mug, Jordan — that's not the unboxing experience we want for you. I've processed a full refund; you should see it back on your card in 3–5 business days.",
    question: null,
    orderRef: "#1038",
    tag: "damaged",
    isVip: true,
  },
]

export function isSampleNeedsYouItem(threadId: string): boolean {
  return threadId.startsWith("sample-")
}
