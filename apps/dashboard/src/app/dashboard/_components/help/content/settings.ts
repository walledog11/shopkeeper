import type { Category } from "./index"

export const settings: Category = {
  id: "settings",
  title: "Settings",
  description: "Configure your business name, AI context, and brand voice",
  icon: "⚙️",
  articles: [
    {
      id: "business-name",
      title: "Updating your business name",
      body: [
        {
          text: "Your business name appears in the top header bar and is used by Clerk's AI when drafting replies.",
        },
        {
          heading: "How to update it",
          steps: [
            "Click Settings in the sidebar.",
            "Find the Business Name field at the top of the page.",
            "Type your new name and click Save.",
            "The name in the header bar will update immediately.",
          ],
        },
      ],
    },
    {
      id: "ai-context",
      title: "AI context and brand voice",
      body: [
        {
          text: "These two settings are the most important for getting high-quality AI drafts. They tell Clerk who you are and how you communicate.",
        },
        {
          heading: "AI Context",
          text: "This is a short description of your business that Clerk reads before every draft. Include: what you sell, your return / refund policy, typical shipping times, and any information customers frequently ask about.",
        },
        {
          heading: "Example AI Context",
          text: "\"We are The Case Market, a phone case brand. We ship within 2–3 business days. Returns are accepted within 30 days for unused items. We do not offer exchanges, only refunds.\"",
        },
        {
          heading: "Brand Voice",
          text: "A short instruction on tone. This is appended to every AI draft prompt.",
        },
        {
          heading: "Example Brand Voices",
          steps: [
            "Friendly and conversational , use casual language, avoid jargon.",
            "Professional and concise , keep replies brief and formal.",
            "Warm and empathetic , acknowledge the customer's frustration before solving.",
          ],
        },
        {
          tips: [
            "Even a single sentence of AI context makes a big difference to draft quality.",
            "Update your AI context whenever your policies change.",
          ],
        },
      ],
    },
  ],
}
