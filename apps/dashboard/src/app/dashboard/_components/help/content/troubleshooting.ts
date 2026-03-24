import type { Category } from "./index"

export const troubleshooting: Category = {
  id: "troubleshooting",
  title: "Troubleshooting",
  description: "Fixes for common issues with tickets and channels",
  icon: "🔧",
  articles: [
    {
      id: "tickets-not-appearing",
      title: "Tickets not appearing",
      body: [
        {
          text: "If messages aren't showing up as tickets, work through these checks in order.",
        },
        {
          heading: "1. Check your integration is connected",
          steps: [
            "Go to the Integrations page.",
            "Confirm the relevant channel shows a green Connected status.",
            "If it shows disconnected, click Reconnect and complete the flow.",
          ],
        },
        {
          heading: "2. Check email forwarding (for Gmail)",
          steps: [
            "In Gmail, go to Settings → Forwarding and POP/IMAP.",
            "Confirm forwarding is enabled and pointing to your Clerk inbound address.",
            "Send a test email to your support address and wait 30 seconds.",
          ],
        },
        {
          heading: "3. Check the correct tab",
          steps: [
            "In the tickets page, make sure you're on the Open tab, not Closed.",
            "Clear any channel filters by clicking All.",
          ],
        },
        {
          tips: [
            "Tickets arrive in real-time — if you're connected and the email was forwarded correctly, it should appear within a few seconds.",
            "Spam filters in Gmail can sometimes block forwarding. Check your spam folder.",
          ],
        },
      ],
    },
    {
      id: "instagram-issues",
      title: "Instagram connection issues",
      body: [
        {
          heading: "'No Instagram Business account found' error",
          steps: [
            "Make sure your Instagram account is set to Business mode (Instagram Settings → Account → Switch to Professional Account → Business).",
            "Confirm your Instagram Business account is linked to a Facebook Page (not just a Business Portfolio).",
            "Ensure you have classic Page admin access on that Facebook Page.",
            "Try disconnecting and reconnecting from the Integrations page.",
          ],
        },
        {
          heading: "DMs are connected but not appearing",
          steps: [
            "Instagram only forwards new DMs after the connection is made — historical messages will not appear.",
            "Make sure the customer messaged your connected Instagram account directly (not a comment).",
            "Try reconnecting the integration — the token may have expired.",
          ],
        },
      ],
    },
    {
      id: "email-not-routing",
      title: "Email not routing correctly",
      body: [
        {
          heading: "Emails arriving in Gmail but not in Clerk",
          steps: [
            "Confirm forwarding is set up correctly in Gmail Settings → Forwarding and POP/IMAP.",
            "Check that the forwarding address matches your Clerk inbound address exactly.",
            "Make sure Gmail hasn't paused forwarding — this can happen after a password change.",
          ],
        },
        {
          heading: "Duplicate tickets appearing",
          steps: [
            "If you have multiple forwarding rules pointing to Clerk, each will create a ticket.",
            "Go to Integrations and remove any duplicate email connections.",
            "In Gmail, ensure only one forwarding rule is active for your support address.",
          ],
        },
        {
          tips: [
            "Send a test email from an external account (not the same Gmail) to verify the full routing chain works end-to-end.",
          ],
        },
      ],
    },
  ],
}
