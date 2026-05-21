# Punch List

What still needs to be done before a real production launch. Stale items, already-completed work, scale-only improvements, and parked roadmap ideas have been removed.

ICP: solo Shopify merchant or 2-3 person team. Email is primary, Shopify is the core data source, and the merchant talks to their own agent over Telegram.

---

## 1. Production Setup

External/provider setup and live smoke evidence. These are launch work, not product features.

- [ ] Rotate `INTERNAL_API_SECRET` to a new production-only value; remove any dev/shared reuse.
- [ ] Confirm Vercel and Railway env vars are scoped to production only, with no preview/dev reuse.
- [ ] Confirm no real secrets are committed to the repo.
- [ ] Confirm Neon production PITR is enabled; record the retention window in `docs/production/runbook.md`.
- [ ] Stripe: production account, restricted `STRIPE_SECRET_KEY`, Starter + Pro products/prices.
- [ ] Run a failed-payment smoke: Stripe failed invoice event -> app reflects `past_due` -> dashboard banner appears -> write-gating blocks customer-visible writes.
- [ ] Configure DNS for `INBOUND_EMAIL_DOMAIN`: SPF, DKIM, DMARC, and MX to Postmark. Record the verified production values.
- [ ] Confirm `GATEWAY_RUNTIME_ROLE` is unset/`all`, or that a split Railway deploy includes a `worker` process.
- [ ] Configure Sentry alert rules for `queue_health`, `webhook_signature`, `provider_send`, and `agent_failure`; run the controlled-alert validation in `runbook.md`.
- [ ] Configure Better Stack checks for dashboard health, gateway deep health, and gateway queue health; record first passing checks.
- [ ] Confirm Vercel Blob retention/loss expectations for inbound attachments and document the operator response.
- [ ] Complete one live production support-path smoke: inbound email accepted -> queue job processed -> dashboard thread visible -> plan generated -> outbound reply delivered.

---

## 2. Security Hardening

These are the remaining repo-side items that materially reduce launch risk.

- [x] **Encrypt integration tokens at rest.** AES-256-GCM with a single `TOKEN_ENCRYPTION_KEY` (`packages/db/crypto.ts`); applied transparently via a Prisma `$extends` query extension on `Integration`. Set `TOKEN_ENCRYPTION_KEY` (32 raw bytes, hex64, or base64) in dashboard + gateway prod env; required in production by `validateDashboardEnv` / `validateGatewayEnv`. Run `node --import tsx packages/db/scripts/encrypt-integration-tokens.ts` against prod once to backfill existing rows (idempotent).
- [x] **Add a Content-Security-Policy header.** `apps/dashboard/next.config.js` ships a `Content-Security-Policy-Report-Only` header covering script/style/img/font/connect/frame/worker/object/base/form-action/frame-ancestors, with allowances for Clerk (`*.clerk.com`, `*.clerk.accounts.dev`, Cloudflare Turnstile) and Sentry (`*.sentry.io`, `*.ingest.sentry.io`). Monitor browser console + Sentry for violations before promoting to enforcing.
- [ ] **Upload Sentry source maps.** `beforeSend` PII scrubber is wired up (see below); source-map upload to Sentry is still pending.
- [x] **Add a Sentry `beforeSend` PII scrubber.** `sentryBeforeSend` in `apps/dashboard/src/lib/observability/redaction.ts` and `apps/gateway/src/observability/redaction.ts` strips request bodies/cookies, redacts auth headers and known sensitive keys (token/secret/password/cookie/email/message/body), and scrubs emails from messages, breadcrumbs, and exception values. Wired into all three Sentry inits (`instrumentation.ts`, `gateway/src/index.ts`, `gateway/src/worker.ts`) with `sendDefaultPii: false`.
- [x] **Add Pino logger redaction.** `PINO_REDACT_PATHS` in `apps/dashboard/src/lib/observability/redaction.ts` and `apps/gateway/src/observability/redaction.ts` applied to all three Pino instances (`apps/gateway/src/logger.ts`, `apps/dashboard/src/lib/logger.ts`, `apps/dashboard/src/lib/server/logger.ts`). Covers tokens, auth headers, cookies, passwords, emails, and response/raw bodies.
- [x] **Add an AI spend backstop.** Per-org daily LLM spend cap in Redis (key `llm:spend:{orgId}:{YYYY-MM-DD}`, nano-dollar accounting). `packages/db/llm-spend.ts` holds pricing for `claude-haiku-4-5-20251001` + `SpendCapError`; `apps/dashboard/src/lib/agent/spend.ts` (Upstash REST) and `apps/gateway/src/llm-spend.ts` (ioredis) share the namespace and are wired into every Anthropic call site (`run.ts`, `planner.ts`, `lib/ai/index.ts`, gateway `classifyAndSummarizeNewEmail` + `generateThreadIntelligence`). Settable per-org via `OrgSettings.dailyLLMSpendCapUsd` (UI field on the Agent settings tab, blank = $20 default). On cap hit, dashboard API routes return 429 with `code: 'spend_cap_reached'`; gateway paths fail open without crashing inbound. Runbook notes that dashboard Upstash and gateway `REDIS_URL` must target the same database.
- [ ] **Finish dashboard noindex coverage.** `apps/dashboard/public/robots.txt` blocks `/dashboard/` and `/api/`, but auth, onboarding, and callback routes should also get `noindex`/`X-Robots-Tag`.
- [ ] **Add Telegram per-`chatId` flood limiting.** The webhook validates the secret but does not rate-limit a bound operator chat.

---

## 3. Billing And Queue Hardening

Small code changes that close real silent-failure modes.

- [x] **Handle `invoice.payment_failed` explicitly in the Stripe webhook.** `apps/dashboard/src/app/api/billing/webhook/route.ts` now sets `stripeStatus: 'past_due'` directly on the invoice event (skipping orgs already `canceled`), independent of the `customer.subscription.updated` path.
- [x] **Set BullMQ retention/defaults for production queues.** `PROCESSING_QUEUE_DEFAULTS` in `apps/gateway/src/constants.ts` (attempts 3, exponential backoff, 1d/1k completed, 7d/5k failed) applied to both `INBOUND` (`routes/webhooks-shared.ts`) and `AI_SUMMARY` (`worker.ts`).

---

## 4. Email Setup UX

OAuth is the default outbound path. Postmark forwarding is still the inbound path and an advanced fallback, so the setup path needs to be clear.

- [ ] **Add per-provider forwarding instructions in `IntegrationCard.tsx`.** The `EmailForwardingDisclosure` currently shows one generic sentence. Add Google Workspace, Outlook 365, cPanel, and Cloudflare Email Routing steps.
- [ ] **Decide Postmark outbound stance.** If Postmark remains supported for outbound from `support@merchant.com`, add Sender Signature verification before exposing it. If OAuth is the only supported outbound path, remove or clearly label Postmark outbound as unsupported.

---

## 5. Instagram, Only If Exposed To Real Merchants

Do not treat Instagram as a launch blocker unless it is actually available to non-dev merchants. Before exposing it:

- [ ] Confirm Meta App Review has passed for the required Instagram messaging permissions.
- [ ] Verify a real webhook event's `entry[0].id` matches the stored `externalAccountId`. The current OAuth callback stores the Instagram Business Account ID while webhook routing uses `entry[0].id`; this must be proven against the active Meta flow.
- [ ] Surface `no_ig_account` remediation directly in the OAuth failure banner: Business account, linked Facebook Page, and classic Page admin access.

---

## Explicitly Out Of Scope

- iMessage.
- Twilio SMS or Twilio WhatsApp.
- TikTok DMs before a merchant asks.
- Facebook Messenger as a separate channel.
- Direct USPS Tracking API.
- Ticket assignment, per-org outbound signatures, and customer notes before a multi-seat customer asks.
- Shopify GDPR webhooks before committing to a Shopify App Store listing.
