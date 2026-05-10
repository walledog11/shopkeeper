# Production Checklist

Scoped to the **ideal customer: a solo Shopify merchant or 2–3 person team using email as their primary support channel**, with Instagram DM as the most likely second channel. Audit refreshed **May 8, 2026**.

- **Blockers** — must be done before the app is production-ready.
- **Before first customers** — should be done before onboarding paying merchants, but not hard launch blockers.
- **Post-launch** — useful follow-ups after the core product is live.
- **Out of scope (for now)** — explicitly deferred until a real customer asks.

Status legend: `[x]` done, `[ ]` pending, `(external)` depends on third-party setup we can't verify from the repo.

---

## Blockers

### Deployment

- [ ] Run `prisma migrate deploy` against the production Neon DB before first deploy.
- [ ] Deploy dashboard to Vercel.
- [ ] Deploy gateway to Railway with the corrected production start command.
- [ ] Verify end-to-end after deploy: inbound email → BullMQ job → worker → dashboard reflects the result → outbound reply lands in the customer's inbox.

### Configuration & secrets

- [ ] Rotate `INTERNAL_API_SECRET` to a new production-only value; remove any dev/shared reuse.
- [x] Pin critical runtime deps (`next`, `react`, `openai`, `@anthropic-ai/sdk`, `express`, `bullmq`, `ioredis`, `postmark`, Sentry SDKs) instead of `latest`.
- [ ] Confirm Vercel and Railway env vars are scoped to production only (no preview/dev reuse) and that no secrets are committed to the repo.
- [ ] Set `SENTRY_DSN` for both apps — `instrumentation.ts` already wires it up.

### Reliability

- [ ] Alerting instrumentation is implemented for stuck queues, repeated webhook signature failures, repeated provider send failures, and repeated agent/tool failures, but production sign-off still requires Sentry rules and one controlled alert per category. See [`operational-guardrails.md`](operational-guardrails.md).
- [x] Stripe webhook idempotency (dedupe by Stripe `event.id` via Upstash Redis with 7-day TTL). Other webhook ingress (Postmark/Meta/Shopify) already dedupes by `externalMessageId` and is per-org rate limited.
- [ ] Confirm Neon production branch has point-in-time recovery enabled and record the retention window in [`runbook.md`](runbook.md).
- [ ] External uptime check (Better Stack / Pingdom / similar) hitting the gateway `/health` endpoint and the dashboard homepage. Same alert channel as Sentry.
- [x] Document the BullMQ failure recovery path in the runbook: where retry-exhausted jobs land, how to inspect them, how to replay.

### Security

- [ ] Confirm Clerk webhooks for org/user lifecycle are wired (or document why they're not) — orphan rows after Clerk-side deletion will leak data across tenants over time.
- [x] Audit every dashboard API route for `getOrCreateOrg()` (or equivalent org scoping). All 66 dashboard API routes verified: 52 use `getOrCreateOrg()` / `auth()`, 6 use `x-internal-secret`, 5 use signed webhooks (Stripe HMAC, Shopify HMAC, OAuth state cookie), 2 are public proxies to the gateway, 1 is `/api/health`. All `[id]`-style routes verify `organizationId` in the WHERE clause or post-fetch. Cross-org regression guard at `src/lib/security/cross-org-isolation.test.ts` (12 cases: canned responses, KB articles, KB bases, playbooks, integrations, AI summary). Per-route 404 tests already cover threads, messages, and agent plan.
- [x] Verify OAuth callback routes (Shopify, Meta) bind the `state` param to the originating user's session, not just check it for presence. Both auth routes now persist `userId` alongside the state nonce; both callbacks call `auth()` and reject if the current Clerk userId doesn't match. State compares run through `timingSafeIncludes`. `returnTo` validated via shared `safeReturnTo()` to block protocol-relative open redirects.
- [x] Add a CI step that runs `npm audit --audit-level=high` and fails on high/critical findings.
- [x] Confirm dashboard API routes that mutate state (`/api/messages`, `/api/agent/*`, `/api/threads/*`) reject unauthenticated requests with 401 — not 500 or HTML redirect. All 16 mutating handlers already returned 401 via `handleApiError` / explicit checks; the gap was at the middleware layer (`src/proxy.ts`), where `auth.protect()` was returning Next.js `notFound()` (404) for unauthenticated API requests. Fixed: middleware now returns JSON 401 for unauthenticated API paths and only calls `auth.protect()` for page paths. Covered by `src/proxy.test.ts` (7 cases: API 401 / org-optional 401 / public passthrough / API 403 no-org / page redirect to sign-in / page redirect to /select-org / fully authenticated passthrough).

### Testing & CI

- [x] `npm test` passes reliably (46 unit + 198 dashboard integration + 120 gateway integration after dependency and billing-gate updates). Test-only `ioredis` mock gap that was silently swallowing alert-path TypeErrors is fixed.
- [x] True end-to-end launch flow test: inbound message → thread → plan → approval → outbound reply (`e2e/core-agent-flow.spec.ts`).
- [x] Browser E2E for the main support flow with Clerk auth and outbound provider interception.

### Billing (external)

- [ ] Stripe: production account, restricted `STRIPE_SECRET_KEY`, Starter + Pro products/prices.
- [x] Stripe webhook endpoint for `customer.subscription.created|updated|deleted|trial_will_end`, signing secret stored.
- [ ] Manually walk the failed-payment path: Stripe `invoice.payment_failed` → app reflects past-due state → user-visible banner → write-gating kicks in.

### Email channel — the only required channel for v1 (external)

- [ ] Postmark: production server, set inbound webhook to `https://gateway.up.railway.app/webhooks/email/inbound` (point at the gateway directly — the dashboard email proxy is dev-only).
- [ ] SPF / DKIM / Return-Path correctly configured on the merchant's `INBOUND_EMAIL_DOMAIN` so outbound replies don't land in spam.

### Legal

- [ ] Privacy Policy and Terms of Service published and linked from the app footer and signup page.
- [ ] Data deletion request process documented. If submitting to the Shopify App Store: implement the GDPR mandatory webhooks (`customers/data_request`, `customers/redact`, `shop/redact`).

### Production environment variables (external)

**Dashboard (Vercel)** — required: `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `ANTHROPIC_API_KEY`, `INTERNAL_API_SECRET`, `POSTMARK_API_KEY`, `APP_URL`, `INBOUND_EMAIL_DOMAIN`, `GATEWAY_INTERNAL_URL`, `SHOPIFY_APP_SECRET`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PRICE_ID_STARTER`, `PRICE_ID_PRO`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SENTRY_DSN`. Optional: `NEXT_PUBLIC_APP_URL` (must equal `APP_URL` if set).

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
- Launch is gated on: deploy infra, secrets rotation + Sentry, the reliability/security audit items, Stripe + Postmark production accounts, legal pages published, and the two open "Before first customers" gaps (onboarding polish, past-due UX).
