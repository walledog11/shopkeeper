# Production Checklist

Organized by launch priority. Audit refreshed **May 6, 2026**.

- **Blockers** — must be done before the app is production-ready.
- **Before first customers** — should be done before onboarding real merchants, but not hard launch blockers.
- **Post-launch** — useful follow-ups after the core product is live.

Status legend: `[x]` done, `[ ]` pending, `(external)` depends on third-party setup we can't verify from the repo.

---

## Blockers

### Deployment

- [ ] Run `prisma migrate deploy` against the production Neon DB before first deploy.
- [ ] Deploy dashboard to Vercel.
- [ ] Deploy gateway to Railway with the corrected production start command.
- [ ] Verify end-to-end after deploy: webhook → BullMQ job → worker → dashboard reflects the result.

### Configuration & secrets

- [ ] Rotate `INTERNAL_API_SECRET` to a new production-only value; remove any dev/shared reuse.
- [x] Pin critical runtime deps (`next`, `react`, `openai`, `@anthropic-ai/sdk`, `express`, `bullmq`, `ioredis`, `postmark`, Sentry SDKs) instead of `latest`.

### Observability & abuse protection

- [x] Alerting for stuck queues, repeated webhook signature failures, repeated provider send failures, and repeated agent/tool failures. See [`operational-guardrails.md`](operational-guardrails.md).
- [x] Stripe webhook idempotency (dedupe by Stripe `event.id` via Upstash Redis with 7-day TTL). Other webhook ingress (Postmark/Meta/Twilio/Shopify) already dedupes by `externalMessageId` and is per-org rate limited.

### Testing & CI

- [x] `npm test` passes reliably (42 unit + 175 dashboard integration + 100 gateway integration; verified across 3 consecutive force-fresh runs). Test-only `ioredis` mock gap that was silently swallowing alert-path TypeErrors is fixed.
- [x] True end-to-end launch flow test: inbound message → thread → plan → approval → outbound reply (`e2e/core-agent-flow.spec.ts`).
- [x] Browser E2E for the main support flow with Clerk auth and outbound provider interception.

### Billing & external accounts (external)

- [ ] Stripe: production account, restricted `STRIPE_SECRET_KEY`, Starter + Pro products/prices.
- [x] Stripe webhook endpoint for `customer.subscription.created|updated|deleted|trial_will_end`, signing secret stored.
- [ ] Twilio: upgrade from trial to paid; switch from WhatsApp Sandbox to a live WhatsApp Business number.
- [ ] Record production `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, `TWILIO_FROM_NUMBER` (E.164).
- [ ] If USPS live tracking is in scope: get the production USPS MID/app authorized for Tracking API access (production may return `403 The requested MID is not authorized to access /tracking/...` until USPS grants access — contact USPS at `https://emailus.usps.com/s/usps-APIs` or `1-877-672-0007` opt 6 → 2).

### Webhook wiring (external console steps)

- [ ] Meta: set webhook callback URL to `https://gateway.up.railway.app/webhooks/meta` and confirm `META_VERIFY_TOKEN` matches.
- [ ] Twilio: point the WhatsApp Business webhook to `https://gateway.up.railway.app/webhooks/twilio`.
- [ ] Postmark: set inbound webhook to `https://gateway.up.railway.app/webhooks/email/inbound` (point directly at the gateway — the dashboard email proxy is dev-only).
- [x] Shopify: 4 order webhooks (`orders/created|fulfilled|updated|cancelled`) auto-register on OAuth callback. After each merchant connect, sanity-check Settings → Notifications → Webhooks in Shopify admin.

### Production environment variables (external)

**Dashboard (Vercel)**
`DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `INTERNAL_API_SECRET`, `POSTMARK_API_KEY`, `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`, `APP_URL`, `INBOUND_EMAIL_DOMAIN`, `GATEWAY_INTERNAL_URL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_WEBHOOK_URL`, `SHOPIFY_APP_SECRET`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PRICE_ID_STARTER`, `PRICE_ID_PRO`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Optional: `NEXT_PUBLIC_APP_URL` (must equal `APP_URL` if set), `USPS_CLIENT_ID` / `USPS_CLIENT_SECRET` (USPS tracking), `SENTRY_DSN`.

**Gateway (Railway)**
`DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`, `INTERNAL_API_SECRET`, `DASHBOARD_URL`, `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, `TWILIO_WEBHOOK_URL`, `SHOPIFY_APP_SECRET`. Optional: `SENTRY_DSN`.

---

## Before first customers

Small, high-leverage gaps in the inbox and outbound experience.

- [ ] **"Needs My Reply" filter** — threads where the last real message is from a customer. Data is already there (`Message.senderType`); just needs a filter chip and query.
- [ ] **Ticket assignment** — `assigneeId` on `Thread` plus an assign control in the ticket UI. Required for any team larger than one.
- [ ] **Customer notes** — `notes Text?` on `Customer`, editable from the context panel.
- [ ] **Outbound email signatures** — configurable per-org in settings. Table stakes for professional outbound email.
- [x] **Inbound email attachments** — Postmark `Attachments` ingested end-to-end via Vercel Blob (10 MB cap, executable extension blocklist). Requires `BLOB_READ_WRITE_TOKEN` in gateway env.

---

## Post-launch

### TikTok DMs

External setup (external):
- [ ] Register a TikTok for Business API app at `business-api.tiktok.com/portal`.
- [ ] Apply for Business Messaging API Open Beta access.
- [ ] Add OAuth callback `{APP_URL}/api/integrations/tiktok/callback` and webhook `{GATEWAY_URL}/webhooks/tiktok` (subscribe to `direct_message`).
- [ ] Collect `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`, `TIKTOK_WEBHOOK_SECRET`.

Implementation:
- [ ] Add `TIKTOK: 'tiktok'` to gateway channel constants and the queue job constant.
- [ ] `apps/dashboard/src/app/api/integrations/tiktok/auth/route.ts` — OAuth initiation with CSRF state.
- [ ] `apps/dashboard/src/app/api/integrations/tiktok/callback/route.ts` — validate state, exchange `auth_code`, fetch account, subscribe to webhooks, upsert integration.
- [ ] `GET /webhooks/tiktok` (challenge) and `POST /webhooks/tiktok` (signature verify + queue) in gateway.
- [ ] TikTok branch in worker → shared inbound message processor.
- [ ] TikTok outbound sending in `apps/dashboard/src/app/api/messages/route.ts`.
- [ ] TikTok connect UI in integrations screens.
- [ ] Token health monitoring if refresh tokens are available.

> Confirm exact OAuth parameter names and DM payload fields against the live TikTok API once access is granted.

### Other channels (only if a customer asks)

- [ ] Facebook Messenger.
- [ ] Shopify storefront live chat widget.

---

## Notes

- Repo-side deploy support exists via `scripts/check-production-env.mjs`, `scripts/verify-production.mjs`, and [`runbook.md`](runbook.md), but those scripts don't substitute for the live deployment, migration, webhook console, or provider account steps.
- Launch is gated on: queue processing reliability, deterministic CI, env/config validation, billing readiness, and the small set of inbox/outbound gaps under "Before first customers."
