import type { Category } from "./index"

export const aiFeatures: Category = {
  id: "ai-features",
  title: "AI Features",
  description: "How Clerk uses AI to help you respond faster",
  icon: "✦",
  articles: [
    {
      id: "clerk-context",
      title: "How Clerk Context works",
      body: [
        {
          text: "Every open ticket has a Clerk Context panel on the right side of the conversation. This is an AI-generated summary of the conversation that gives you instant context without reading every message.",
        },
        {
          heading: "What it summarises",
          steps: [
            "The customer's core question or complaint.",
            "Key details mentioned (order numbers, product names, dates).",
            "The current state of the conversation — whether it's been responded to or is still pending.",
          ],
        },
        {
          heading: "Refreshing the summary",
          steps: [
            "Click the refresh icon (↺) next to the Clerk Context heading.",
            "Clerk will re-analyse the full conversation and update the summary.",
            "This is useful after you've sent a reply and the conversation has moved forward.",
          ],
        },
        {
          tips: [
            "Summaries are generated automatically when a new message arrives.",
            "Long conversations benefit most from refreshing — early summaries may not reflect recent messages.",
          ],
        },
      ],
    },
    {
      id: "draft-with-clerk",
      title: "Drafting replies with AI",
      body: [
        {
          text: "Draft with Clerk reads the full conversation and generates a suggested reply in your brand's voice. You can edit it before sending.",
        },
        {
          heading: "How to use it",
          steps: [
            "Open any ticket in the Open tab.",
            "Click Draft with Clerk in the bottom-left of the composer.",
            "Wait a moment while Clerk analyses the thread.",
            "The suggested reply appears in the text box — edit it as needed.",
            "Click Send when you're happy with it.",
          ],
        },
        {
          heading: "How to get better drafts",
          steps: [
            "Go to Settings and fill in the AI Context field with your brand name, what you sell, and any key policies (e.g. return window, shipping times).",
            "Set a Brand Voice to tell Clerk how to write — e.g. 'friendly and concise' or 'professional and formal'.",
            "The more context you provide, the more accurate and on-brand the drafts will be.",
          ],
        },
        {
          tips: [
            "Always review AI drafts before sending — they're a starting point, not a final answer.",
            "If a draft misses the point, try refreshing the Clerk Context summary first, then draft again.",
          ],
        },
      ],
    },
  ],
}
