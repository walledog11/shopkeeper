import type { Category } from "./index"

export const aiFeatures: Category = {
  id: "ai-features",
  title: "AI Features",
  description: "How Shopkeeper uses AI to help you respond faster",
  icon: "✦",
  articles: [
    {
      id: "shopkeeper-context",
      title: "How Shopkeeper Context works",
      body: [
        {
          text: "Every open ticket has a Shopkeeper Context panel on the right side of the conversation. This is an AI-generated summary of the conversation that gives you instant context without reading every message.",
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
            "Click the refresh icon (↺) next to the Shopkeeper Context heading.",
            "Shopkeeper will re-analyse the full conversation and update the summary.",
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
      id: "draft-with-shopkeeper",
      title: "Drafting replies with AI",
      body: [
        {
          text: "Draft with Shopkeeper reads the full conversation and generates a suggested reply in your brand's voice. You can edit it before sending.",
        },
        {
          heading: "How to use it",
          steps: [
            "Open any ticket in the Open tab.",
            "Click Draft with Shopkeeper in the bottom-left of the composer.",
            "Wait a moment while Shopkeeper analyses the thread.",
            "The suggested reply appears in the text box — edit it as needed.",
            "Click Send when you're happy with it.",
          ],
        },
        {
          heading: "How to get better drafts",
          steps: [
            "Go to Agent → Settings and fill in About your store with what you sell and any key policies (e.g. return window, shipping times). Your business name is on the same page.",
            "Set a Brand Voice to tell Shopkeeper how to write — e.g. 'friendly and concise' or 'professional and formal'.",
            "The more context you provide, the more accurate and on-brand the drafts will be.",
          ],
        },
        {
          tips: [
            "Always review AI drafts before sending — they're a starting point, not a final answer.",
            "If a draft misses the point, try refreshing the Shopkeeper Context summary first, then draft again.",
          ],
        },
      ],
    },
  ],
}
