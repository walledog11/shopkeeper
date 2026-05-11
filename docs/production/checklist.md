# Production Checklist

Scoped to the **ideal customer: a solo Shopify merchant or 2–3 person team using email as their primary support channel**, with Instagram DM as the most likely second channel. Audit refreshed **May 10, 2026**.

- **Blockers** — must be done before the app is production-ready.
- **Before first customers** — should be done before onboarding paying merchants, but not hard launch blockers.
- **Post-launch** — useful follow-ups after the core product is live.
- **Out of scope (for now)** — explicitly deferred until a real customer asks.

Status legend: `[x]` done, `[ ]` pending, `(external)` depends on third-party setup we can't verify from the repo.

---

## Blockers

### Deployment

- [x] Run `prisma migrate deploy` against the production Neon DB before first deploy.
- [x] Deploy dashboard to Vercel.
- [x] Deploy gateway to Railway with the corrected production start command.
- [x] Verify end-to-end after deploy: inbound email → BullMQ job → worker → dashboard reflects the result → outbound reply lands in the customer's inbox.

### Configuration & secrets

- [ ] Rotate `INTERNAL_API_SECRET` to a new production-only value; remove any dev/shared reuse.
- [x] Pin critical runtime deps (`next`, `react`, `openai`, `@anthropic-ai/sdk`, `express`, `bullmq`, `ioredis`, `postmark`, Sentry SDKs) instead of `latest`.
- [ ] Confirm Vercel and Railway env vars are scoped to production only (no preview/dev reuse) and that no secrets are committed to the repo.
- [x] Set `SENTRY_DSN` for both apps — production health passed after the Vercel/Railway env update, and gateway Sentry capture + email alert were verified with a controlled `webhook_signature` event.

### Reliability

- [ ] Alerting instrumentation is implemented for stuck queues, repeated webhook signature failures, repeated provider send failures, and repeated agent/tool failures, but production sign-off still requires Sentry rules and one controlled alert per category. See [`operational-guardrails.md`](operational-guardrails.md).
- [x] Stripe webhook idempotency (dedupe by Stripe `event.id` via Upstash Redis with 7-day TTL). Other webhook ingress (Postmark/Meta/Shopify) already dedupes by `externalMessageId` and is per-org rate limited.
- [ ] Confirm Neon production branch has point-in-time recovery enabled and record the retention window in [`runbook.md`](runbook.md).
- [ ] External uptime checks in Better Stack hitting dashboard `/api/health`, gateway `/health/deep`, and gateway `/health/queues` with the same alert owner as Sentry.
- [x] Document the BullMQ failure recovery path in the runbook: where retry-exhausted jobs land, how to inspect them, how to replay.


### Billing (external)

- [ ] Stripe: production account, restricted `STRIPE_SECRET_KEY`, Starter + Pro products/prices.
- [x] Stripe webhook endpoint for `customer.subscription.created|updated|deleted|trial_will_end`, signing secret stored.
- [ ] Manually walk the failed-payment path: Stripe `invoice.payment_failed` → app reflects past-due state → user-visible banner → write-gating kicks in.

### Email channel — the only required channel for v1 (external)

- [ ] Postmark: production server, set inbound webhook to `https://gateway.up.railway.app/webhooks/email/inbound` (point at the gateway directly — the dashboard email proxy is dev-only).
- [ ] SPF / DKIM / Return-Path correctly configured on the merchant's `INBOUND_EMAIL_DOMAIN` so outbound replies don't land in spam.

### Legal

- [x] Privacy Policy and Terms of Service published at `/privacy` and `/terms`; existing footer and signup links already point there. Drafts should still receive legal review before broad public launch.
- [x] Data deletion request process documented in [`data-deletion.md`](data-deletion.md). Shopify App Store GDPR webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) are explicitly deferred until an App Store submission path exists.

### Production environment variables (external)

**Dashboard (Vercel)** — required: `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `INTERNAL_API_SECRET`, `POSTMARK_API_KEY`, `APP_URL`, `INBOUND_EMAIL_DOMAIN`, `GATEWAY_INTERNAL_URL`, `SHOPIFY_APP_SECRET`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PRICE_ID_STARTER`, `PRICE_ID_PRO`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SENTRY_DSN`. Optional: `NEXT_PUBLIC_APP_URL` (must equal `APP_URL` if set).

**Gateway (Railway)** — required: `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`, `INTERNAL_API_SECRET`, `DASHBOARD_URL`, `SHOPIFY_APP_SECRET`, `BLOB_READ_WRITE_TOKEN`, `SENTRY_DSN`.

`META_*`, `TWILIO_*`, and `USPS_*` are kept in the codebase but are not required for v1 — see "Out of scope."

---

## Before first customers

The ICP is one person or a 2–3 person team. The list is short on purpose.

- [x] **"Needs My Reply" filter** — threads where the last real message is from a customer. Filter chip on the open tab queries by denormalized `Thread.lastMessageSenderType` (indexed).
- [x] **Inbound email attachments** — Postmark `Attachments` ingested end-to-end via Vercel Blob (10 MB cap, executable extension blocklist). Requires `BLOB_READ_WRITE_TOKEN` in gateway env.
- [ ] **Onboarding flow polish** — first-run experience: connect Shopify → set up email forwarding → see the first agent reply. Anything that confuses a solo merchant in the first 10 minutes will lose them.
- [ ] **Past-due / cancelled billing UX** — past-due state should produce a clear in-app banner and gate writes, not silently fail mid-action.

Explicitly deferred (don't ship for v1, but reconsider when a customer hits the gap):
- **Ticket assignment** (`assigneeId` on `Thread`) — only matters once there's a team.
- **Per-org outbound email signatures** — useful once there's a team to disambiguate. Today the From header carries the org name and the agent uses `brandVoice`.
- **Customer notes** (`notes Text?` on `Customer`) — Shopify order history already covers the 80% case.

---

## Post-launch

The most likely first asks, in order:

1. **Instagram DM channel** — already mostly built (Meta OAuth, gateway webhook, worker branch). To turn on: register the Meta production app, set the webhook callback to `https://gateway.up.railway.app/webhooks/meta`, confirm `META_VERIFY_TOKEN`, populate `META_APP_ID` / `META_APP_SECRET` / `META_CONFIG_ID`. Most Shopify DTC merchants use Instagram for storefront DMs.
2. **Shopify storefront chat widget** — embed a chat bubble on the merchant's storefront that opens a thread in Clerk. This is an acquisition wedge for the Shopify App Store, not just a feature.
3. **Ticket assignment + outbound signatures** — bundle these together. Triggered by the first multi-seat customer.

---

## Out of scope (for now)

Items previously on the checklist that the ICP does not need. Revisit only if a real customer asks.

- **WhatsApp / SMS via Twilio** — rare for US Shopify merchants. Leave the Twilio code in place but skip the paid account upgrade, WhatsApp Business number, and webhook wiring until requested. Drops `TWILIO_*` from the launch path entirely.
- **USPS Tracking API** — Shopify already exposes `fulfillment.tracking_url` per order; the agent can return that link without a separate USPS authorization. Avoids the multi-week USPS MID approval.
- **TikTok DMs** — Open Beta API, narrow merchant overlap, large code surface. Don't pre-build.
- **Facebook Messenger** — declining channel; Instagram covers the same audience.

---

## Notes

- Repo-side deploy support exists via `scripts/check-production-env.mjs`, `scripts/verify-production.mjs`, and [`runbook.md`](runbook.md), but those scripts don't substitute for the live deployment, migration, webhook console, or provider account steps.
- Launch is gated on: secrets rotation + Sentry, the reliability audit items, Stripe + Postmark production accounts, and the two open "Before first customers" gaps (onboarding polish, past-due UX).
