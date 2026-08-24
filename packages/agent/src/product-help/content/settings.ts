import type { Category } from "./index.js"

export const settings: Category = {
  id: "settings",
  title: "Account, workspace, and agent",
  description: "Your login, workspace admin, and how {agent} works",
  icon: "⚙️",
  articles: [
    {
      id: "business-name",
      title: "Updating your business name",
      body: [
        {
          text: "Your business name is shown as the sender name in support emails and is the name {agent} signs replies with. You usually set it during onboarding.",
        },
        {
          heading: "How to update it",
          steps: [
            "Open Agent → Configure in the top navigation.",
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
          text: "Agent → Configure is where you set how {agent} represents your store and writes replies.",
        },
        {
          heading: "Where to find them",
          steps: [
            "Open Agent → Configure in the top navigation.",
            "Under Your store, set your business name, about-your-store details, and brand voice.",
            "Choose a trust level.",
            "Expand Advanced for sample replies, reply language, and refund limit overrides.",
          ],
        },
        {
          heading: "About your store",
          text: "Optional details {agent} reads before every draft. Include what you sell, your return / refund policy, typical shipping times, and any information customers frequently ask about. You do not need to repeat your business name here.",
        },
        {
          heading: "Example",
          text: "\"We sell premium phone cases. We ship within 2–3 business days. Returns are accepted within 30 days for unused items. We do not offer exchanges, only refunds.\"",
        },
        {
          heading: "Brand Voice",
          text: "A short instruction on tone. {agent} follows it in every reply it writes.",
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
      title: "Account and workspace settings",
      body: [
        {
          text: "Your personal login lives under Account. Billing, data exports, and workspace admin live under Workspace → Settings.",
        },
        {
          heading: "What lives where",
          steps: [
            "Click your avatar to open Account and update your profile, sign-in methods, or log out.",
            "Open Workspace → Settings for billing, data exports, and GDPR requests.",
            "Use the danger zone at the bottom of Workspace → Settings to clear ticket history or delete the workspace.",
          ],
        },
      ],
    },
  ],
}
