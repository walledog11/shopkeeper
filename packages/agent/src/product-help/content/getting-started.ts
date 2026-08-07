import type { Category } from "./index.js"

export const gettingStarted: Category = {
  id: "getting-started",
  title: "Getting Started",
  description: "Connect Shopify, set up email forwarding, and receive your first ticket",
  icon: "🚀",
  articles: [
    {
      id: "quick-start",
      title: "Quick start guide",
      body: [
        {
          text: "Get Shopkeeper up and running in three steps. Connect Shopify, forward your support inbox, and you'll be receiving and replying to customer messages in minutes.",
        },
        {
          heading: "Step 1 — Connect Shopify and set up email forwarding",
          steps: [
            "Go to the Integrations page from the sidebar.",
            "Connect Shopify with your store domain.",
            "Open the Email card and choose Set up forwarding.",
            "Copy your Shopkeeper inbound address (orgId@inbound.shopkeeper.app) and add it as a forwarding destination in Gmail, cPanel, or Cloudflare.",
            "Save your support address (for example support@yourstore.com) so replies go out under the right name.",
            "Send a test email to your support address — it should appear in your inbox within a minute once forwarding is working.",
          ],
        },
        {
          heading: "Step 2 — Receive your first ticket",
          steps: [
            "Ask someone to send a message to your support address, or send yourself a test email.",
            "Within a minute, a new ticket should appear in the Inbox.",
            "A badge on the sidebar icon shows the number of open tickets.",
          ],
        },
        {
          heading: "Step 3 — Reply and resolve",
          steps: [
            "Click a ticket to open the conversation.",
            "Approve the draft {agent} wrote, or type your own reply in the composer at the bottom.",
            "Hit Send to deliver your message back to the customer.",
            "When the issue is resolved, click Close Ticket in the top-right of the conversation.",
          ],
        },
      ],
    },
    {
      id: "platform-overview",
      title: "Platform overview",
      body: [
        {
          text: "Shopkeeper is a unified helpdesk that pulls customer messages from multiple channels into one inbox. Here's a quick map of the interface.",
        },
        {
          heading: "Sidebar",
          text: "The dark sidebar on the left holds your main navigation. Use the collapse toggle on its edge to save space. Hover any icon for a tooltip label.",
        },
        {
          heading: "Home",
          text: "Home opens with what {agent} did overnight and what is left for you. Tickets with a ready draft are stacked under the greeting — approve them one at a time without leaving the page.",
        },
        {
          heading: "Inbox",
          text: "The Inbox is your main workspace. It groups open tickets by what they need from you — flagged for you, needs your answer, needs review — with everything else behind All conversations. Open a ticket and the bar above the conversation carries the customer and order context {agent} used.",
        },
        {
          heading: "Integrations",
          text: "Connect and manage your channels here. Each card shows connection status and lets you add or remove accounts.",
        },
        {
          heading: "Settings",
          text: "Settings holds your account, billing, and workspace admin. Agent settings live under Agent → Settings in the top navigation.",
        },
      ],
    },
  ],
}
