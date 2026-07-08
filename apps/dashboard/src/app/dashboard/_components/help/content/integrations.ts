import type { Category } from "./index"

export const integrations: Category = {
  id: "integrations",
  title: "Channels & Integrations",
  description: "Connecting Gmail, Instagram, and other channels",
  icon: "🔗",
  articles: [
    {
      id: "connect-gmail",
      title: "Connecting Gmail / Email",
      body: [
        {
          text: "Email is the most common support channel. Connecting it routes messages sent to your support address directly into Shopkeeper as tickets.",
        },
        {
          heading: "How to connect",
          steps: [
            "Go to the Integrations page.",
            "Click Connect on the Gmail / Email card.",
            "Enter your support email address (e.g. support@yourstore.com).",
            "Click Save.",
            "Set up email forwarding from that address to the inbound address shown in Shopkeeper.",
          ],
        },
        {
          heading: "Setting up forwarding in Gmail",
          steps: [
            "In Gmail, go to Settings → See all settings → Forwarding and POP/IMAP.",
            "Click Add a forwarding address and paste your Shopkeeper inbound address.",
            "Confirm the verification email that Gmail sends.",
            "Set 'Forward a copy of incoming mail' to your Shopkeeper address.",
          ],
        },
        {
          tips: [
            "Only new emails received after forwarding is set up will appear as tickets.",
            "You can connect multiple email addresses — each appears as a separate integration.",
          ],
        },
      ],
    },
    {
      id: "connect-instagram",
      title: "Connecting Instagram DMs",
      body: [
        {
          text: "Connect your Instagram Business account to receive Direct Messages as tickets in Shopkeeper.",
        },
        {
          heading: "Requirements",
          steps: [
            "An Instagram Business account (not a personal account).",
            "The Instagram account must be linked to a Facebook Page.",
            "You must be an admin of that Facebook Page.",
          ],
        },
        {
          heading: "How to connect",
          steps: [
            "Go to the Integrations page.",
            "Click Connect on the Instagram card.",
            "You'll be redirected to Facebook to authorise Shopkeeper.",
            "Select the Facebook Page linked to your Instagram account.",
            "Grant the requested permissions and confirm.",
            "You'll be redirected back to Shopkeeper — a green Connected badge will appear.",
          ],
        },
        {
          tips: [
            "If you see a 'No Instagram Business account found' error, make sure your Instagram account is set to Business (not Creator or Personal) and is linked to your Facebook Page.",
            "Classic Page admin access is required — Business Portfolio access alone is not sufficient.",
          ],
        },
      ],
    },
    {
      id: "connect-imessage",
      title: "Connecting iMessage",
      body: [
        {
          text: "Link your iPhone to run your store by texting the Shopkeeper operator line — order lookups, daily digests, and one-tap plan approvals. iMessage is an operator channel like Telegram; customers never text this line. Shopkeeper provides the line; you do not need any Photon or Spectrum credentials.",
        },
        {
          heading: "What you'll need",
          steps: [
            "An iPhone with iMessage enabled.",
            "Access to your Shopkeeper dashboard (Integrations page).",
          ],
        },
        {
          heading: "How to connect",
          steps: [
            "Go to Integrations → iMessage.",
            "Click Link your iPhone — a QR code and connect code appear.",
            "Scan the QR with your iPhone camera (or tap the text link) and send the prefilled message.",
            "You'll receive a welcome text within about 30 seconds when the link succeeds.",
            "Integrations shows your linked handle; you can link additional iPhones from the same page.",
          ],
        },
        {
          heading: "Troubleshooting",
          steps: [
            "Connect codes expire after 24 hours — click Link your iPhone again to mint a fresh code.",
            "If the line doesn't recognize you, go to Integrations → iMessage → Unlink, then link again with a new code.",
            "Only handles you link can use the operator line — texting a fresh code re-links that iPhone to whoever minted it.",
          ],
        },
        {
          tips: [
            "Reply yes to approve a plan, no to dismiss, or skip 1 to skip the first step on multi-step plans.",
            "Text SUMMARY anytime for an open-ticket digest.",
            "Tap the Open link in plan notifications to review or edit the ticket in the dashboard.",
          ],
        },
      ],
    },
    {
      id: "channel-disconnected",
      title: "What to do if a channel disconnects",
      body: [
        {
          text: "Channels can occasionally disconnect due to expired tokens or permission changes. Here's how to fix it.",
        },
        {
          heading: "Signs a channel has disconnected",
          steps: [
            "No new tickets are arriving from a channel you expect messages from.",
            "The integration card on the Integrations page may show a warning.",
          ],
        },
        {
          heading: "How to reconnect",
          steps: [
            "Go to the Integrations page.",
            "Find the affected channel and click Reconnect.",
            "Complete the authorisation flow again.",
            "New messages will resume appearing as tickets.",
          ],
        },
        {
          tips: [
            "Instagram tokens can expire if you change your Facebook password or revoke app permissions. Reconnecting always fixes this.",
            "For email, check that your forwarding rule is still active in Gmail settings.",
          ],
        },
      ],
    },
  ],
}
