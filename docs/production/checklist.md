# Production Checklist

This checklist is organized by launch priority rather than implementation phase.

- `Blockers` means the app should not be considered production-ready until these are done.
- `Must-Have Before First Customers` means these should be completed before onboarding real merchants, but they are not hard technical launch blockers.
- `Can Ship Shortly After Launch` means useful follow-up work that can land once the core product is live.

Repo audit status as of April 21, 2026:

- `done` = clearly implemented in the repo
- `partial` = substantial repo support exists, but the item is not fully complete or still depends on external setup
- `missing` = not found in the repo
- `external/unverifiable` = cannot be confirmed from the repo because it depends on third-party or production actions

---

## Blockers

### Deployment & Runtime Reliability
- [ ] Verify the deployed gateway actually processes inbound jobs end-to-end after deploy: webhook accepted -> BullMQ job created -> worker processes -> dashboard reflects the result. [Repo audit: partial]
- [ ] Run `prisma migrate deploy` against the production Neon DB before first deploy. [Repo audit: partial]
- [ ] Deploy dashboard to Vercel. [Repo audit: partial]
- [ ] Deploy gateway to Railway with the corrected production start command. [Repo audit: partial]

### Configuration & Secrets
- [ ] Rotate `INTERNAL_API_SECRET` to a new production-only value and remove any dev/shared secret reuse. [Repo audit: partial]
- [x] Pin critical runtime dependencies instead of using `latest` for production deploys, especially `next`, `react`, `openai`, `@anthropic-ai/sdk`, `express`, `bullmq`, `ioredis`, `postmark`, and Sentry SDKs. [Repo audit: done]

### Observability, Health Checks & Abuse Protection
- [ ] Add alerting for stuck queues, repeated webhook signature failures, repeated provider send failures, and repeated agent execution/tool failures. See [`operational-guardrails.md`](operational-guardrails.md). [Repo audit: partial]
- [ ] Expand abuse protection beyond dashboard APIs: add replay/idempotency and rate limits around webhook ingress, internal endpoints, and other high-cost AI/action paths. [Repo audit: partial]

### Testing & CI
- [ ] Make `npm test` pass reliably in CI without external network/database fragility. [Repo audit: partial]
- [ ] Add a true end-to-end launch flow test: inbound message -> thread appears -> plan generated -> approval -> outbound reply sent. [Repo audit: partial]
- [ ] Unskip and finish the browser E2E for the main support flow, including Clerk auth setup and outbound provider interception. [Repo audit: partial]

### Billing & Core External Accounts
- [ ] Create a Stripe account and obtain a restricted production `STRIPE_SECRET_KEY`. [Repo audit: external/unverifiable]
- [ ] Create Stripe products and price IDs for Starter and Pro. [Repo audit: external/unverifiable]
- [ ] Add the Stripe webhook endpoint for `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, and `customer.subscription.trial_will_end`, and save the signing secret. [Repo audit: partial]
- [ ] Upgrade from Twilio trial to a paid account. [Repo audit: external/unverifiable]
- [ ] Switch from the WhatsApp Sandbox to a live WhatsApp Business number. [Repo audit: external/unverifiable]
- [ ] Record the production `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, and the E.164 `TWILIO_FROM_NUMBER` for OTP SMS. [Repo audit: external/unverifiable]

### Carrier APIs
- [ ] If USPS live tracking is part of launch scope, get the production USPS MID/app authorized for Tracking API access. As of April 1, 2026, production requests can return `403 The requested MID is not authorized to access /tracking/...` until USPS grants access. Contact USPS via `https://emailus.usps.com/s/usps-APIs` or call `1-877-672-0007`, option `6`, then option `2`. [Repo audit: external/unverifiable]

### Production Environment Variables

**Dashboard (Vercel)**
- [ ] `DATABASE_URL` [Repo audit: external/unverifiable]
- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` [Repo audit: external/unverifiable]
- [ ] `ANTHROPIC_API_KEY` [Repo audit: external/unverifiable]
- [ ] `OPENAI_API_KEY` [Repo audit: external/unverifiable]
- [ ] `INTERNAL_API_SECRET` [Repo audit: external/unverifiable]
- [ ] `POSTMARK_API_KEY` [Repo audit: external/unverifiable]
- [ ] `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID` [Repo audit: external/unverifiable]
- [ ] `APP_URL` [Repo audit: external/unverifiable]
- [ ] `NEXT_PUBLIC_APP_URL` if you intentionally expose the dashboard URL to client-side code; if set, keep it equal to `APP_URL` [Repo audit: external/unverifiable]
- [ ] `INBOUND_EMAIL_DOMAIN` [Repo audit: external/unverifiable]
- [ ] `GATEWAY_INTERNAL_URL` [Repo audit: external/unverifiable]
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_WEBHOOK_URL` [Repo audit: external/unverifiable]
- [ ] `SHOPIFY_APP_SECRET`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` [Repo audit: external/unverifiable]
- [ ] `USPS_CLIENT_ID`, `USPS_CLIENT_SECRET` if USPS live tracking is enabled [Repo audit: external/unverifiable]
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PRICE_ID_STARTER`, `PRICE_ID_PRO` [Repo audit: external/unverifiable]
- [ ] `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` [Repo audit: external/unverifiable]
- [ ] `SENTRY_DSN` if enabled [Repo audit: external/unverifiable]

**Gateway (Railway)**
- [ ] `DATABASE_URL` [Repo audit: external/unverifiable]
- [ ] `REDIS_URL` [Repo audit: external/unverifiable]
- [ ] `ANTHROPIC_API_KEY` [Repo audit: external/unverifiable]
- [ ] `INTERNAL_API_SECRET` [Repo audit: external/unverifiable]
- [ ] `DASHBOARD_URL` [Repo audit: external/unverifiable]
- [ ] `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN` [Repo audit: external/unverifiable]
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, `TWILIO_WEBHOOK_URL` [Repo audit: external/unverifiable]
- [ ] `SHOPIFY_APP_SECRET` [Repo audit: external/unverifiable]
- [ ] `SENTRY_DSN` if enabled [Repo audit: external/unverifiable]

### Webhook Wiring
- [ ] In the Meta developer console, set the webhook callback URL to `https://gateway.up.railway.app/webhooks/meta` and verify `META_VERIFY_TOKEN` matches. [Repo audit: external/unverifiable]
- [ ] In the Twilio console, point the WhatsApp Business webhook to `https://gateway.up.railway.app/webhooks/twilio`. [Repo audit: external/unverifiable]
- [ ] In Postmark, set the inbound webhook URL to `https://gateway.up.railway.app/webhooks/email/inbound` (point directly at the gateway — the dashboard email proxy is dev-only). [Repo audit: external/unverifiable]
- [ ] After connecting each merchant's Shopify store via OAuth, verify the 4 order webhooks (`orders/created`, `orders/fulfilled`, `orders/updated`, `orders/cancelled`) were auto-registered in the Shopify admin under Settings → Notifications → Webhooks. [Repo audit: partial]

---

## Must-Have Before First Customers

### Inbox & Team Workflow
- [ ] Add a `Needs My Reply` filter for threads where the last real message was from a customer. [Repo audit: missing]
- [ ] Add ticket assignment to team members with a simple `assigneeId` on `Thread` and an assign control in the ticket UI. [Repo audit: missing]
- [ ] Add draft auto-save in the ticket composer, keyed by `threadId`, so merchants do not lose partial replies when switching context. [Repo audit: missing]
- [ ] Add right-click, hover, or swipe quick actions on thread rows for common triage actions like close, tag, and assign. [Repo audit: missing]
- [ ] Add smart inbox auto-sort so urgent order-related threads rank above routine tickets. [Repo audit: missing]
- [ ] Add custom SLA targets in settings instead of relying on hard-coded thresholds. [Repo audit: missing]

### Customer Context
- [ ] Add customer profile notes with a `notes Text?` field on `Customer`, editable from the context panel and persisted through an API route. [Repo audit: missing]
- [ ] Add VIP / first-order / risk-style badges derived from existing customer/order data. [Repo audit: missing]
- [ ] Add a compact visual order timeline so agents can understand order state without reading multiple separate fields. [Repo audit: missing]

### Messaging & Support Quality
- [ ] Add outbound email signatures configurable in settings. [Repo audit: missing]
- [ ] Implement inbound email attachments: ingest provider attachment payloads, store them on messages, and display them in the conversation view. [Repo audit: partial]


### Customer Satisfaction & Automation
- [ ] Add a CSAT survey triggered after ticket close, with results flowing into analytics. [Repo audit: missing]
- [ ] Add the `no_customer_response` playbook trigger for stale-ticket auto-close. [Repo audit: missing]
- [ ] Add more playbook trigger types such as `order_fulfilled` and `first_order_customer`. [Repo audit: missing]

### Knowledge Base & Analytics
- [ ] Add KB article bulk import from CSV or pasted structured text. [Repo audit: missing]
- [ ] Add KB article usage stats so merchants can see which content the agent is actually retrieving. [Repo audit: missing]
- [ ] Add period-over-period trend arrows to analytics KPIs. [Repo audit: missing]
- [ ] Add an agent savings estimate to make ROI legible for merchants. [Repo audit: missing]

### Operational UX
- [ ] Replace the current 3-second polling on `/api/threads` with SSE or another push model if early merchant usage shows polling lag or scalability issues. [Repo audit: missing]

---

## Can Ship Shortly After Launch

### TikTok

**External Approval**
- [ ] Register a TikTok for Business API app at `business-api.tiktok.com/portal` using a TikTok Business Account. [Repo audit: external/unverifiable]
- [ ] Apply for Business Messaging API Open Beta access. [Repo audit: external/unverifiable]
- [ ] Add OAuth callback URL `{APP_URL}/api/integrations/tiktok/callback` in the TikTok portal. [Repo audit: external/unverifiable]
- [ ] Register gateway webhook URL `{GATEWAY_URL}/webhooks/tiktok` and subscribe to `direct_message` events. [Repo audit: external/unverifiable]
- [ ] Collect credentials: `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`, `TIKTOK_WEBHOOK_SECRET`. [Repo audit: external/unverifiable]

**Implementation**
- [ ] Add `TIKTOK: 'tiktok'` to gateway channel constants and add the queue job constant for TikTok DM processing. [Repo audit: missing]
- [ ] Create `apps/dashboard/src/app/api/integrations/tiktok/auth/route.ts` for TikTok OAuth initiation with CSRF state. [Repo audit: missing]
- [ ] Create `apps/dashboard/src/app/api/integrations/tiktok/callback/route.ts` to validate state, exchange `auth_code`, fetch account details, subscribe to webhooks, and upsert the integration. [Repo audit: missing]
- [ ] Add `GET /webhooks/tiktok` for challenge verification in the gateway. [Repo audit: missing]
- [ ] Add `POST /webhooks/tiktok` for TikTok webhook signature verification and queueing. [Repo audit: missing]
- [ ] Add the TikTok branch in the worker to transform inbound payloads and call the shared inbound message processor. [Repo audit: missing]
- [ ] Add TikTok outbound sending in `apps/dashboard/src/app/api/messages/route.ts`. [Repo audit: missing]
- [ ] Add TikTok connect UI in the integrations screens. [Repo audit: missing]
- [ ] Add TikTok token health monitoring if refresh tokens are available. [Repo audit: missing]

> Confirm exact OAuth parameter names and DM payload fields against the live TikTok Business Messaging API once access is granted.

### Additional Channels
- [ ] Add Facebook Messenger support if a customer requires it. [Repo audit: missing]
- [ ] Build a Shopify live chat widget as a separate follow-on project if realtime storefront support becomes a priority. [Repo audit: missing]

### Additional UX & Polish
- [ ] Add typing indicators in the composer. [Repo audit: missing]
- [ ] Add suggested prompts / shortcuts in Concierge chat. [Repo audit: missing]

---

## Notes

- Repo-side deploy support now exists for env/config validation and production smoke checks via `scripts/check-production-env.mjs`, `scripts/verify-production.mjs`, and [`runbook.md`](runbook.md), but those changes do not by themselves complete the live deployment, migration, webhook-console, or provider-account checklist items.
- The app is already feature-rich enough to be a real product. The biggest remaining work is production hardening, operational visibility, test reliability, and a few high-frequency inbox workflows.
- The launch decision should be gated primarily on queue processing reliability, deterministic CI, env/config validation, billing readiness, and the ability for a merchant to triage and collaborate inside the inbox without friction.
