import type { Category } from "./index"

export const reference: Category = {
  id: "reference",
  title: "Reference",
  description: "Ticket IDs, data handling, and how things work under the hood",
  icon: "📖",
  articles: [
    {
      id: "ticket-ids",
      title: "How ticket IDs work",
      body: [
        {
          text: "Every ticket in Clerk has a #ID number displayed in the bottom-right corner of each ticket row. These are sequential within your organisation.",
        },
        {
          heading: "What IDs are used for",
          steps: [
            "Referencing a specific conversation when talking to your team.",
            "Identifying tickets in order (lower number = older ticket).",
            "IDs are assigned at the time the ticket is created and never change.",
          ],
        },
        {
          tips: [
            "IDs are scoped to your organisation — #1 in your account is not the same as #1 in another account.",
          ],
        },
      ],
    },
    {
      id: "data-privacy",
      title: "Data and privacy",
      body: [
        {
          text: "Clerk stores the minimum data needed to operate your helpdesk.",
        },
        {
          heading: "What Clerk stores",
          steps: [
            "Customer platform IDs and names (from the connected channel).",
            "Message content — the text of each message in a thread.",
            "AI summaries — generated and stored per thread.",
            "Integration tokens — encrypted access credentials for connected channels.",
          ],
        },
        {
          heading: "What Clerk does not store",
          steps: [
            "Customer payment information.",
            "Passwords or authentication credentials of your customers.",
            "Data from channels you have not connected.",
          ],
        },
        {
          heading: "AI and your data",
          text: "When you use Draft with Clerk or refresh a Clerk Context summary, the conversation content is sent to an AI model to generate a response. This is used solely to produce the summary or draft — it is not used to train models.",
        },
      ],
    },
    {
      id: "channel-types",
      title: "Supported channel types",
      body: [
        {
          text: "Clerk currently supports the following channels for receiving customer messages.",
        },
        {
          heading: "Gmail / Email",
          text: "Inbound emails forwarded to your Clerk address become tickets. Replies are sent back via your configured sender address.",
        },
        {
          heading: "Instagram DMs",
          text: "Direct Messages sent to your Instagram Business account appear as tickets. Replies are delivered back as Instagram DMs.",
        },
        {
          heading: "Coming soon",
          steps: [
            "TikTok — Shop messages and video comments.",
            "Shopify — Order and Inbox messages.",
          ],
        },
      ],
    },
  ],
}
