import type { Category } from "./index"

export const settings: Category = {
  id: "settings",
  title: "Account & agent settings",
  description: "Account, billing, workspace admin, and how your AI agent works",
  icon: "⚙️",
  articles: [
    {
      id: "business-name",
      title: "Updating your business name",
      body: [
        {
          text: "Your business name is shown as the sender name in support emails and is used by Shopkeeper's AI when drafting replies. You usually set it during onboarding.",
        },
        {
          heading: "How to update it",
          steps: [
            "Open Agent → Settings in the top navigation.",
            "Find the business name field under Your store.",
            "Save your changes.",
          ],
        },
      ],
    },
    {
      id: "ai-context",
      title: "Store context and brand voice",
      body: [
        {
          text: "Agent → Settings is where you configure how Shopkeeper represents your store and writes replies.",
        },
        {
          heading: "Where to find them",
          steps: [
            "Open Agent → Settings in the top navigation.",
            "Under Your store, set your business name, about-your-store details, and brand voice.",
            "Choose a trust level and whether plans generate automatically when you open tickets.",
            "Expand Advanced for sample replies, reply language, and refund limit overrides.",
          ],
        },
        {
          heading: "About your store",
          text: "Optional details Shopkeeper reads before every draft. Include what you sell, your return / refund policy, typical shipping times, and any information customers frequently ask about. You do not need to repeat your business name here.",
        },
        {
          heading: "Example",
          text: "\"We sell premium phone cases. We ship within 2–3 business days. Returns are accepted within 30 days for unused items. We do not offer exchanges, only refunds.\"",
        },
        {
          heading: "Brand Voice",
          text: "A short instruction on tone. This is appended to every AI draft prompt.",
        },
        {
          heading: "Example Brand Voices",
          steps: [
            "Friendly and conversational — use casual language, avoid jargon.",
            "Professional and concise — keep replies brief and formal.",
            "Warm and empathetic — acknowledge the customer's frustration before solving.",
          ],
        },
        {
          tips: [
            "Even a single sentence of store context makes a big difference to draft quality.",
            "Update your store context whenever your policies change.",
          ],
        },
      ],
    },
    {
      id: "account-admin",
      title: "Settings",
      body: [
        {
          text: "Settings holds your personal account, billing, data exports, and workspace admin actions.",
        },
        {
          heading: "What lives there",
          steps: [
            "Open Settings under Workspace in the top navigation.",
            "Account settings are at the top — billing follows below.",
            "Expand Data & privacy for backups or GDPR exports.",
            "Use the danger zone at the bottom to clear ticket history or delete the workspace.",
          ],
        },
      ],
    },
  ],
}
