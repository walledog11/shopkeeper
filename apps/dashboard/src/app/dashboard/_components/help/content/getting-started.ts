import type { Category } from "./index"

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
            "Type a reply in the composer at the bottom, or use Draft with Shopkeeper to generate an AI reply.",
            "Hit Send to deliver your message back to the customer.",
            "When the issue is resolved, click the Resolve button in the top-right of the conversation.",
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
          text: "Your home page shows open ticket count, total resolved, and messages handled at a glance. Recent Activity shows the latest tickets across all channels. Needs Attention surfaces the most active open tickets.",
        },
        {
          heading: "Inbox",
          text: "The Inbox is your main workspace. The left panel lists all tickets — filter by Open or Closed, and by channel using the icon chips. Click any ticket to open the conversation. The right panel shows customer info and the AI-generated context summary.",
        },
        {
          heading: "Integrations",
          text: "Connect and manage your channels here. Each card shows connection status and lets you add or remove accounts.",
        },
        {
          heading: "Settings",
          text: "Workspace settings cover billing and workspace administration. Agent configuration lives under Agent → Configure in the top navigation. Personal account settings are in the avatar menu.",
        },
      ],
    },
  ],
}
