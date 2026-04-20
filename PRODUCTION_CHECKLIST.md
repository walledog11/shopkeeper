# Production Checklist

This checklist is organized by launch priority rather than implementation phase.

- `Blockers` means the app should not be considered production-ready until these are done.
- `Must-Have Before First Customers` means these should be completed before onboarding real merchants, but they are not hard technical launch blockers.
- `Can Ship Shortly After Launch` means useful follow-up work that can land once the core product is live.

---

## Blockers

### Deployment & Runtime Reliability
- [x] Fix the Railway gateway start command so production runs both the HTTP server and the BullMQ worker. The root `railway.json` currently starts only `apps/gateway/dist/index.js`, while the gateway package expects `npm run start` to run both server and worker.
- [ ] Verify the deployed gateway actually processes inbound jobs end-to-end after deploy: webhook accepted -> BullMQ job created -> worker processes -> dashboard reflects the result.
- [ ] Add a worker readiness check to the operational runbook so queue consumption failures are caught immediately after deploy.
- [ ] Create an Upstash Redis database in the same region as Vercel/Railway and confirm TLS is enabled with the `rediss://` URL. Do not rely on the free 500k-command tier for an always-on BullMQ worker.
- [ ] Confirm `DATABASE_URL` points to the production Neon PostgreSQL instance, not a dev branch, and includes `?pgbouncer=true&connection_limit=1`.
- [ ] Run `prisma migrate deploy` against the production Neon DB before first deploy.
- [ ] Deploy dashboard to Vercel.
- [ ] Deploy gateway to Railway with the corrected production start command.

### Configuration & Secrets
- [x] Replace partial env checks with a typed env validation layer per app so both dashboard and gateway fail startup consistently when critical config is missing.
- [x] Ensure Redis env vars are treated as required at startup, not via non-null assertions that fail later on first request.
- [ ] Rotate `INTERNAL_API_SECRET` to a new production-only value and remove any dev/shared secret reuse.
- [x] Set `DASHBOARD_URL` in production for gateway -> dashboard internal API calls, and keep `DASHBOARD_INTERNAL_URL` reserved for local callback forwarding only.
- [ ] Pin critical runtime dependencies instead of using `latest` for production deploys, especially `next`, `react`, `openai`, `@anthropic-ai/sdk`, `express`, `bullmq`, `ioredis`, `postmark`, and Sentry SDKs.

### Observability, Health Checks & Abuse Protection
- [x] Extend the gateway deep health check to verify Redis and queue readiness, not just Postgres connectivity.
- [ ] Add alerting for stuck queues, repeated webhook signature failures, repeated provider send failures, and repeated agent execution/tool failures.
- [ ] Add visibility into queue backlog, failed jobs, and retry counts so operational issues are diagnosable without reading raw logs.
- [ ] Expand abuse protection beyond dashboard APIs: add replay/idempotency and rate limits around webhook ingress, internal endpoints, and other high-cost AI/action paths.
- [ ] Verify Sentry is wired in both apps for production and that critical failures include enough org/thread/job context to debug incidents.

### Testing & CI
- [x] Stop relying on a live shared Neon database for automated tests. Provision an isolated test database per CI run or switch the test strategy so CI is deterministic.
- [ ] Make `npm test` pass reliably in CI without external network/database fragility.
- [x] Add proper setup/teardown for test data so cleanup does not fail when test fixtures were never created.
- [ ] Add a true end-to-end launch flow test: inbound message -> thread appears -> plan generated -> approval -> outbound reply sent.
- [ ] Unskip and finish the browser E2E for the main support flow, including Clerk auth setup and outbound provider interception.
- [x] Keep the webhook ingest E2E, but make it safe and deterministic for CI by isolating its database and environment dependencies.

### Billing & Core External Accounts
- [ ] Create a Stripe account and obtain a restricted production `STRIPE_SECRET_KEY`.
- [ ] Create Stripe products and price IDs for Starter and Pro.
- [ ] Add the Stripe webhook endpoint for `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, and `customer.subscription.trial_will_end`, and save the signing secret.
- [ ] Upgrade from Twilio trial to a paid account.
- [ ] Switch from the WhatsApp Sandbox to a live WhatsApp Business number.
- [ ] Record the production `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, and the E.164 `TWILIO_FROM_NUMBER` for OTP SMS.

### Production Environment Variables

**Dashboard (Vercel)**
- [ ] `DATABASE_URL`
- [ ] `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- [ ] `ANTHROPIC_API_KEY`
- [ ] `OPENAI_API_KEY`
- [ ] `INTERNAL_API_SECRET`
- [ ] `POSTMARK_API_KEY`
- [ ] `META_APP_ID`, `META_APP_SECRET`
- [ ] `APP_URL`
- [ ] `INBOUND_EMAIL_DOMAIN`
- [ ] `GATEWAY_INTERNAL_URL`
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_WEBHOOK_URL`
- [ ] `SHOPIFY_APP_SECRET`
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PRICE_ID_STARTER`, `PRICE_ID_PRO`
- [ ] `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- [ ] `SENTRY_DSN` if enabled

**Gateway (Railway)**
- [ ] `DATABASE_URL`
- [ ] `REDIS_URL`
- [ ] `ANTHROPIC_API_KEY`
- [ ] `INTERNAL_API_SECRET`
- [ ] `DASHBOARD_URL`
- [ ] `META_APP_SECRET`, `META_VERIFY_TOKEN`
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, `TWILIO_WEBHOOK_URL`
- [ ] `SHOPIFY_APP_SECRET`
- [ ] `SENTRY_DSN` if enabled

### Webhook Wiring
- [ ] In the Meta developer console, set the webhook callback URL to `https://gateway.up.railway.app/webhooks/meta` and verify `META_VERIFY_TOKEN` matches.
- [ ] In the Twilio console, point the WhatsApp Business webhook to `https://gateway.up.railway.app/webhooks/twilio`.

---

## Must-Have Before First Customers

### Inbox & Team Workflow
- [ ] Add a `Needs My Reply` filter for threads where the last real message was from a customer.
- [ ] Add ticket assignment to team members with a simple `assigneeId` on `Thread` and an assign control in the ticket UI.
- [ ] Add draft auto-save in the ticket composer, keyed by `threadId`, so merchants do not lose partial replies when switching context.
- [ ] Add right-click, hover, or swipe quick actions on thread rows for common triage actions like close, tag, and assign.
- [ ] Add smart inbox auto-sort so urgent order-related threads rank above routine tickets.
- [ ] Add custom SLA targets in settings instead of relying on hard-coded thresholds.

### Customer Context
- [ ] Add customer profile notes with a `notes Text?` field on `Customer`, editable from the context panel and persisted through an API route.
- [ ] Add VIP / first-order / risk-style badges derived from existing customer/order data.
- [ ] Add a compact visual order timeline so agents can understand order state without reading multiple separate fields.

### Messaging & Support Quality
- [ ] Add outbound email signatures configurable in settings.
- [ ] Implement inbound email attachments: ingest provider attachment payloads, store them on messages, and display them in the conversation view.
- [ ] Add in-app integration health alerts so broken or expiring integrations are visible outside the settings page.
- [ ] Add browser notifications or another high-visibility new-ticket alerting path if polling remains the default for launch.

### Customer Satisfaction & Automation
- [ ] Add a CSAT survey triggered after ticket close, with results flowing into analytics.
- [ ] Add the `no_customer_response` playbook trigger for stale-ticket auto-close.
- [ ] Add more playbook trigger types such as `order_fulfilled` and `first_order_customer`.

### Knowledge Base & Analytics
- [ ] Add KB article bulk import from CSV or pasted structured text.
- [ ] Add KB article usage stats so merchants can see which content the agent is actually retrieving.
- [ ] Add period-over-period trend arrows to analytics KPIs.
- [ ] Add an agent savings estimate to make ROI legible for merchants.

### Operational UX
- [ ] Replace the current 3-second polling on `/api/threads` with SSE or another push model if early merchant usage shows polling lag or scalability issues.

---

## Can Ship Shortly After Launch

### TikTok

**External Approval**
- [ ] Register a TikTok for Business API app at `business-api.tiktok.com/portal` using a TikTok Business Account.
- [ ] Apply for Business Messaging API Open Beta access.
- [ ] Add OAuth callback URL `{APP_URL}/api/integrations/tiktok/callback` in the TikTok portal.
- [ ] Register gateway webhook URL `{GATEWAY_URL}/webhooks/tiktok` and subscribe to `direct_message` events.
- [ ] Collect credentials: `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`, `TIKTOK_WEBHOOK_SECRET`.

**Implementation**
- [ ] Add `TIKTOK: 'tiktok'` to gateway channel constants and add the queue job constant for TikTok DM processing.
- [ ] Create `apps/dashboard/src/app/api/integrations/tiktok/auth/route.ts` for TikTok OAuth initiation with CSRF state.
- [ ] Create `apps/dashboard/src/app/api/integrations/tiktok/callback/route.ts` to validate state, exchange `auth_code`, fetch account details, subscribe to webhooks, and upsert the integration.
- [ ] Add `GET /webhooks/tiktok` for challenge verification in the gateway.
- [ ] Add `POST /webhooks/tiktok` for TikTok webhook signature verification and queueing.
- [ ] Add the TikTok branch in the worker to transform inbound payloads and call the shared inbound message processor.
- [ ] Add TikTok outbound sending in `apps/dashboard/src/app/api/messages/route.ts`.
- [ ] Add TikTok connect UI in the integrations screens.
- [ ] Add TikTok token health monitoring if refresh tokens are available.

> Confirm exact OAuth parameter names and DM payload fields against the live TikTok Business Messaging API once access is granted.

### Additional Channels
- [ ] Add Facebook Messenger support if a customer requires it.
- [ ] Build a Shopify live chat widget as a separate follow-on project if realtime storefront support becomes a priority.

### Additional UX & Polish
- [ ] Add typing indicators in the composer.
- [ ] Add suggested prompts / shortcuts in Concierge chat.

---

## Notes

- The app is already feature-rich enough to be a real product. The biggest remaining work is production hardening, operational visibility, test reliability, and a few high-frequency inbox workflows.
- The launch decision should be gated primarily on queue processing reliability, deterministic CI, env/config validation, billing readiness, and the ability for a merchant to triage and collaborate inside the inbox without friction.
