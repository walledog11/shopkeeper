import type { Category } from "./index.js"

export const aiFeatures: Category = {
  id: "ai-features",
  title: "Working with {agent}",
  description: "How {agent} drafts, acts, and asks before doing anything risky",
  icon: "✦",
  articles: [
    {
      id: "plans-and-approvals",
      title: "Plans and approvals",
      body: [
        {
          text: "When a customer message arrives, {agent} reads the thread, checks your store and your saved notes, and writes a plan: the reply it wants to send, plus any store actions it wants to take. Nothing leaves your store until the plan is approved.",
        },
        {
          heading: "Approving a plan",
          steps: [
            "Open the dashboard home — tickets with a ready draft are in the deck under the greeting.",
            "Read the draft reply and the actions listed with it.",
            "Approve & send to run the plan as written, or Edit & send myself to write your own reply instead.",
            "Approvals also arrive on your phone if you have linked Telegram or iMessage.",
          ],
        },
        {
          heading: "When {agent} asks instead",
          steps: [
            "If the answer is not in your store or your notes, {agent} parks the ticket and asks you the question rather than guessing.",
            "Answer it once and {agent} remembers it — the same question will not come back.",
            "If a ticket is beyond what {agent} should handle, it hands the ticket to you and says so in the thread.",
          ],
        },
        {
          tips: [
            "Edits you make to a draft teach {agent} your voice — it is not wasted work.",
            "A plan that is waiting on you never expires; nothing is sent behind your back.",
          ],
        },
      ],
    },
    {
      id: "asking-your-agent",
      title: "Asking {agent} directly",
      body: [
        {
          text: "You can talk to {agent} inside any ticket, without sending anything to the customer.",
        },
        {
          heading: "How to use it",
          steps: [
            "Open a ticket and type @{agent} at the start of a message in the composer.",
            "Ask a question — where an order is, what your policy says, what it would reply.",
            "The answer stays internal. Nothing is sent to the customer until you send it.",
          ],
        },
        {
          tips: [
            "This is read-only: asking {agent} a question can never issue a refund or edit an order.",
            "The Concierge on the Agent page does the same thing across your whole store, not one ticket.",
          ],
        },
      ],
    },
    {
      id: "better-drafts",
      title: "Getting better drafts",
      body: [
        {
          text: "{agent} writes from what it knows about your store. The more of that you fill in, the less it has to ask you.",
        },
        {
          heading: "Where to set it",
          steps: [
            "Agent → Configure → Your store: your business name, and About your store — what you sell, your return window, typical shipping times.",
            "Brand voice: a short instruction on tone, for example 'friendly and direct, never over-apologise'.",
            "Memory: notes, policies, and anything synced from Shopify. {agent} reads these before every draft.",
          ],
        },
        {
          heading: "Trust level",
          steps: [
            "Agent → Configure → Trust level controls how much {agent} does without asking.",
            "At the lowest level it drafts and waits for you on everything.",
            "Higher levels let it send routine replies on its own, still inside the refund and discount caps you set.",
          ],
        },
        {
          tips: [
            "Review page shows everything {agent} has done, so you can raise the trust level on evidence rather than hope.",
          ],
        },
      ],
    },
  ],
}
