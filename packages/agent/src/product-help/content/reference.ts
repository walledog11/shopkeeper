import type { Category } from "./index.js"

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
          text: "Every ticket in Shopkeeper has a #ID number displayed in the bottom-right corner of each ticket row. These are sequential within your organisation.",
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
          text: "Shopkeeper stores the minimum data needed to operate your helpdesk.",
        },
        {
          heading: "What Shopkeeper stores",
          steps: [
            "Customer platform IDs and names (from the connected channel).",
            "Message content — the text of each message in a thread.",
            "Ticket summaries — the one-line summary {agent} writes for each thread.",
            "Integration tokens — encrypted access credentials for connected channels.",
          ],
        },
        {
          heading: "What Shopkeeper does not store",
          steps: [
            "Customer payment information.",
            "Passwords or authentication credentials of your customers.",
            "Data from channels you have not connected.",
          ],
        },
        {
          heading: "{agent} and your data",
          text: "When {agent} drafts a reply, summarises a ticket, or answers a question you ask it, the conversation content is sent to an AI model to generate that response. It is used solely to produce the reply or summary — it is not used to train models.",
        },
      ],
    },
    {
      id: "channel-types",
      title: "Supported channel types",
      body: [
        {
          text: "Shopkeeper currently supports the following channels for receiving customer messages.",
        },
        {
          heading: "Gmail / Email",
          text: "Inbound emails forwarded to your Shopkeeper address become tickets. Replies are sent back via your configured sender address.",
        },
        {
          heading: "Instagram DMs",
          text: "Direct Messages sent to your Instagram Professional account appear as tickets. Replies are delivered back as Instagram DMs within Instagram's 24-hour reply window.",
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
