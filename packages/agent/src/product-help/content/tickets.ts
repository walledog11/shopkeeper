import type { Category } from "./index.js"

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
            "New messages appear in the queue automatically, grouped by what they need from you.",
            "Click any ticket row to open the conversation.",
          ],
        },
        {
          heading: "Replying to a customer",
          steps: [
            "Type your message in the composer at the bottom of the conversation.",
            "Or approve the draft {agent} has already written for you, if there is one.",
            "Review the message, edit if needed, then click Send.",
            "Your reply is delivered back to the customer on their original channel (email, Instagram, etc.).",
          ],
        },
        {
          heading: "Resolving a ticket",
          steps: [
            "Once the issue is handled, click Close Ticket in the top-right of the conversation.",
            "The ticket leaves your queue and moves into All conversations.",
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
          text: "The ticket is live. Open tickets that need something from you are what the Inbox badge counts — tickets {agent} is still working are not.",
        },
        {
          heading: "Closed",
          text: "The ticket is resolved. It leaves your queue and stays readable under All conversations; a new message from the same customer opens it again.",
        },
      ],
    },
    {
      id: "filtering-tickets",
      title: "Filtering and finding tickets",
      body: [
        {
          text: "The queue sorts itself by what each ticket needs from you, so most days you do not filter at all.",
        },
        {
          heading: "Sections",
          text: "Flagged for you is what {agent} handed over; Needs your answer is waiting on a question only you can answer; Needs review has a draft ready to approve; Agent working is still in progress.",
        },
        {
          heading: "Channel filter",
          text: "Filter the queue to one channel — Gmail, Instagram, and so on — when you only want to work through one inbox.",
        },
        {
          heading: "Deep-linking from home",
          text: "View Ticket on any card on the Home page opens that conversation directly — no need to find it in the queue.",
        },
        {
          tips: [
            "All conversations holds everything, including tickets that need nothing from you right now.",
            "Each ticket displays a #ID number — useful for referencing specific tickets.",
          ],
        },
      ],
    },
  ],
}
