# Shopkeeper Product Truth

Shopkeeper is a social-first AI operator for Shopify merchants, not a traditional email-first helpdesk.

The product is built around four layers.

## 1. Customer-Origin Channels

Where customers ask for help:

- Instagram DMs/comments: core V1 social support channel.
- TikTok/TikTok Shop: strategically important, but API feasibility must be verified.
- Gmail: simple customer email fallback.
- Postmark/email forwarding: advanced fallback for custom-domain support teams.

## 2. Merchant-Control Channels

Where the merchant talks to the AI agent:

- iMessage: merchant approval/control channel.
- WhatsApp: merchant approval/control channel.
- Telegram: beta/internal merchant approval/control channel.

These are not customer support inboxes. They are where the merchant approves actions, asks questions, gives instructions, and receives summaries.

## 3. System-of-Action Integrations

Where Shopkeeper reads business context and executes approved work:

- Shopify: core system of record and action layer.

Shopify is where customer, order, fulfillment, product, refund, and store context should come from. Any customer-facing or store-mutating action must be explicit, auditable, and gated by the configured approval policy.

## 4. Admin/Review Surfaces

Where the merchant configures, reviews, and audits the system:

- Dashboard: setup, review, logs, fallback/manual control.

The dashboard should not be positioned as the primary day-to-day inbox. It is the control room for setup, review queues, audit logs, manual fallback, and debugging.

## Product Guardrails

- Do not treat this app as a traditional Zendesk/Gorgias clone.
- Do not assume email is the primary support channel.
- Do not assume Postmark/domain forwarding is the default onboarding flow.
- Do not treat WhatsApp/iMessage as customer-origin channels.
- Do not hide or deprioritize Instagram merely because it is technically incomplete; Instagram is strategically core.
- Do not treat TikTok generic DMs and TikTok Shop buyer messages as the same thing.

## Intended Product Experience

The magical product experience is:

Customer messages from social/email -> AI understands Shopify context -> merchant approves from phone/dashboard -> Shopify action/customer reply is executed safely.

That means the product should optimize for:

- Customer intake from Instagram first, with Gmail as the simple fallback.
- Fast merchant control from phone-native channels, especially iMessage and WhatsApp.
- Shopify-backed action plans, not generic chatbot replies.
- Clear approval, execution, and audit trails.
- A dashboard that supports setup and trust, without making the product feel like another helpdesk queue.
