import type { Category } from "./index"

export const tickets: Category = {
  id: "tickets",
  title: "Tickets",
  description: "How to manage, reply to, and resolve customer tickets",
  icon: "🎫",
  articles: [
    {
      id: "open-reply-resolve",
      title: "Opening, replying, and resolving tickets",
      body: [
        {
          text: "Every inbound customer message becomes a ticket in Shopkeeper. Here's the full lifecycle.",
        },
        {
          heading: "Opening a ticket",
          steps: [
            "Open the Inbox from the sidebar.",
            "New messages appear automatically in the Open tab.",
            "Click any ticket row to open the conversation on the right.",
          ],
        },
        {
          heading: "Replying to a customer",
          steps: [
            "Type your message in the composer at the bottom of the conversation.",
            "Alternatively, click Draft with Shopkeeper to generate an AI-assisted reply.",
            "Review the message, edit if needed, then click Send.",
            "Your reply is delivered back to the customer on their original channel (email, Instagram, etc.).",
          ],
        },
        {
          heading: "Resolving a ticket",
          steps: [
            "Once the issue is handled, click the Resolve button in the top-right of the conversation.",
            "The ticket moves to the Closed tab.",
            "Closed tickets are read-only — you can view the full history but cannot reply.",
          ],
        },
      ],
    },
    {
      id: "ticket-statuses",
      title: "Ticket statuses explained",
      body: [
        {
          text: "Each ticket has a status that tells you where it is in the support workflow.",
        },
        {
          heading: "Open",
          text: "The ticket is active and awaiting a reply or resolution. Open tickets appear in the Open tab and count toward the badge on the sidebar icon.",
        },
        {
          heading: "Closed",
          text: "The ticket has been resolved. It moves to the Closed tab and is no longer counted as active. You can reopen a closed ticket by switching to the Closed tab and viewing the thread.",
        },
      ],
    },
    {
      id: "filtering-tickets",
      title: "Filtering and finding tickets",
      body: [
        {
          text: "Use the filter controls at the top of the ticket list to narrow down what you see.",
        },
        {
          heading: "Open / Closed tab",
          text: "Switch between active and resolved tickets with the tab selector at the top of the list.",
        },
        {
          heading: "Channel filter",
          text: "Click any channel icon chip (Gmail, Instagram, etc.) to show only tickets from that source. Click All to clear the filter.",
        },
        {
          heading: "Deep-linking from home",
          text: "Clicking a ticket in Recent Activity or Needs Attention on the Home page will take you directly to that conversation — no need to search manually.",
        },
        {
          tips: [
            "The ticket count shown above the list updates as you apply filters.",
            "Each ticket displays a #ID number — useful for referencing specific tickets.",
          ],
        },
      ],
    },
  ],
}
