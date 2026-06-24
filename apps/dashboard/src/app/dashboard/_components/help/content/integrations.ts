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
          text: "Connect a business iMessage line so you can run your store by texting the agent from your iPhone — order lookups, daily digests, and one-tap approvals. iMessage is an operator channel like Telegram; customers never text this line. It runs through a Photon Spectrum project, which provides the line and the credentials you'll paste in.",
        },
        {
          heading: "What you'll need",
          steps: [
            "A Photon Spectrum project with a provisioned iMessage line.",
            "Your Spectrum project ID, project secret, and webhook secret (found in your Spectrum project settings).",
          ],
        },
        {
          heading: "How to connect",
          steps: [
            "Go to the Integrations page.",
            "Click Connect on the iMessage card.",
            "Paste your Spectrum project ID, project secret, and webhook secret.",
            "Click Connect — a webhook URL will appear.",
            "Copy that webhook URL into your Spectrum project's webhook settings so inbound iMessages reach Shopkeeper.",
            "On the iMessage card, click Link your iPhone to get a connect code, then text that code from your iPhone to the line. That links your handle so the agent recognizes you.",
          ],
        },
        {
          tips: [
            "Only handles you link can text the line — customers never reach this number. Texting a fresh connect code re-links it to whoever minted it.",
            "A dedicated Business line is recommended so your number stays consistent.",
            "To change credentials later, disconnect and reconnect the iMessage card — there is no OAuth reconnect for this channel.",
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
