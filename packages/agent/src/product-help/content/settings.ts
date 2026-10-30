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
            "Open Settings → General.",
            "Change the business name.",
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
          text: "Memory is where you set how {agent} represents your store and writes replies.",
        },
        {
          heading: "Where to find them",
          steps: [
            "Settings → General: your business name and store timezone.",
            "Memory → Store profile, Tone & voice and Preferences: about-your-store details, brand voice, and how you like things handled.",
            "Settings → Approvals & limits: your trust level and compensation limits. {agent} never issues more than them, even with your approval; anything larger comes to you.",
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
          text: "Your personal login lives under Settings → Account. Billing lives under Usage & billing, and exports and workspace admin under Data & privacy.",
        },
        {
          heading: "What lives where",
          steps: [
            "Click your avatar to open Account and update your profile, sign-in methods, or log out.",
            "Open Settings → Usage & billing for your plan, payment method and invoices.",
            "Open Settings → Data & privacy for data exports and customer data requests.",
            "Use the danger zone at the bottom of Data & privacy to archive every ticket or delete the workspace. Archiving deletes nothing; deleting the workspace erases its data.",
          ],
        },
      ],
    },
    {
      id: "briefing",
      title: "Changing your briefing",
      body: [
        {
          text: "{agent} texts a briefing to your linked iPhone with what needs you. It turns on when you link your first phone.",
        },
        {
          heading: "How to change it",
          steps: [
            "Open Settings → Phone & briefing.",
            "Switch it off, or choose once or twice a day, the time, and every day or weekdays only.",
            "Times follow the store timezone, set in Settings → General.",
            "Save your changes.",
          ],
        },
        {
          tips: [
            "Text SUMMARY anytime for a briefing on demand.",
          ],
        },
      ],
    },
  ],
}
