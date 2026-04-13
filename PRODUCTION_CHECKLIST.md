# Production Checklist

Items are organized into phases by effort and dependencies. Items within a phase can be done in parallel unless noted otherwise.

---

## Phase 1 — Code Fixes
> ~2–3 hours total. All items are parallel. Zero risk to dev — pure code changes with no external dependencies.

- [x] **Remove dev bypass in `send-code`** — `apps/dashboard/src/app/api/phone/send-code/route.ts`: delete the `isDev` branch that uses hardcoded code `000000`; delete the `NODE_ENV !== "development"` guard around the send rate limiter so it applies in all environments
- [x] **Remove dev bypass in `verify-code`** — `apps/dashboard/src/app/api/phone/verify-code/route.ts`: delete the `NODE_ENV !== "development"` guard around the verify rate limiter
- [x] **Fix analytics resolution time query** — `apps/dashboard/src/app/api/analytics/route.ts`: replace the `db.thread.findMany` that loads all closed threads into Node memory with a single `$queryRaw` `AVG(updated_at - created_at)` query — same pattern as `firstReplyStats` directly below it
- [x] **Fix audit log CSV cap** — `apps/dashboard/src/app/api/org/audit-log/route.ts`: the CSV export is hard-capped at 50 rows, making it useless for compliance; remove the cap (or paginate) so a full export downloads all records
- [x] **Gateway graceful shutdown** — `apps/gateway/src/index.ts`: add `process.on('SIGTERM', ...)` that calls `server.close()` and drains in-flight BullMQ workers before exit; Railway sends SIGTERM before killing the container — without this, in-flight webhook jobs are hard-killed mid-flight
- [x] **Gateway deep health endpoint** — `apps/gateway/src/index.ts`: add `GET /health/deep` that runs `db.$queryRaw\`SELECT 1\`` and a Redis ping; the existing `GET /` returns 200 even if the DB or Redis connection is broken

---

## Phase 2 — Code Features
> ~1–2 days total. All items are parallel. No external services or migrations required — can be shipped before deployment.

- [ ] **Thread SLA age indicators** — color-code thread list rows by time since last customer message (green < 4h, yellow < 24h, red > 24h); pure client-side math on `updatedAt`, no DB change (~30 min)
- [ ] **Keyboard shortcuts** — add `K` to open command palette, `R` to resolve current thread, `N` to focus note composer; all client-side event listeners, no API changes (~1–2 hours)
- [ ] **Shopify outbound via email** — `apps/dashboard/src/app/api/messages/route.ts`: the Shopify branch currently returns `501`; Shopify threads already have the customer's email in `customer.platformId` — reuse the existing email dispatch block instead of returning an error (~1 hour)
- [ ] **Canned response template variables** — support `{{customer_name}}` and `{{order_number}}` in canned response bodies, substituted at send-time from the `Customer` row and Shopify order data already loaded in the thread context; no DB migration needed (~2–3 hours)
- [ ] **Search full-text index** — `packages/db/prisma/schema.prisma`: add a `GIN` index on `messages.content_text` via raw migration; update `apps/dashboard/src/app/api/search/route.ts` to use `to_tsvector` / `@@` instead of `contains` — the current implementation does a sequential scan on every search (~1–2 hours)

---

## Phase 3 — Infrastructure Provisioning
> ~1 day. All items are parallel — each is an independent external account or service. Must be complete before Phase 4.

### Redis
- [ ] Create an Upstash Redis database (use the same region as your Vercel/Railway deployments)
- [ ] Confirm TLS is enabled (the `rediss://` scheme) — required by both ioredis and BullMQ

### Database
- [ ] Confirm `DATABASE_URL` points to the production Neon PostgreSQL instance (not a dev branch)
- [ ] Confirm the connection string includes `?pgbouncer=true&connection_limit=1`

### Stripe
- [ ] Create a Stripe account; obtain a restricted `STRIPE_SECRET_KEY` for production
- [ ] Create products and prices for Starter and Pro tiers; note the two price IDs
- [ ] In the Stripe dashboard, add a webhook endpoint pointing to `https://your-vercel-app.vercel.app/api/billing/webhook` with events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`; note the signing secret

### Twilio / WhatsApp
- [ ] Upgrade from Twilio trial to a paid account
- [ ] Switch from the WhatsApp Sandbox to a live WhatsApp Business number (sandbox requires manual opt-in and cannot send first messages)
- [ ] Note the production `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, and the E.164 `TWILIO_FROM_NUMBER` for OTP SMS

### Hosting
- [ ] Deploy dashboard to Vercel
- [ ] Deploy gateway to Railway; confirm the service start command is `npm run start` (or the correct command for the Express app)

---

## Phase 4 — Configure & Deploy
> ~3–4 hours. Must happen after Phase 3 — you need the production URLs before configuring webhooks. Steps within this phase are mostly sequential.

### Set environment variables

**Dashboard (Vercel)**
- [ ] `DATABASE_URL` — Neon connection string with `?pgbouncer=true&connection_limit=1`
- [ ] `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- [ ] `ANTHROPIC_API_KEY`
- [ ] `OPENAI_API_KEY`
- [ ] `INTERNAL_API_SECRET` — new value, rotated from any dev value
- [ ] `POSTMARK_API_KEY`
- [ ] `META_APP_ID`, `META_APP_SECRET`
- [ ] `APP_URL` — production Vercel domain (e.g. `https://app.yourdomain.com`)
- [ ] `INBOUND_EMAIL_DOMAIN`
- [ ] `GATEWAY_INTERNAL_URL` — Railway gateway URL
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_WEBHOOK_URL`
- [ ] `SHOPIFY_APP_SECRET`
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PRICE_ID_STARTER`, `PRICE_ID_PRO`
- [ ] `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- [ ] `SENTRY_DSN` (optional)

**Gateway (Railway)**
- [ ] `DATABASE_URL` — same Neon connection string with pgbouncer params
- [ ] `REDIS_URL` — Upstash `rediss://` URL (ioredis-compatible)
- [ ] `ANTHROPIC_API_KEY`
- [ ] `INTERNAL_API_SECRET` — must match dashboard value exactly
- [ ] `META_APP_SECRET`, `META_VERIFY_TOKEN`
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, `TWILIO_WEBHOOK_URL`
- [ ] `SHOPIFY_APP_SECRET`
- [ ] `SENTRY_DSN` (optional)
- [ ] Remove `DASHBOARD_INTERNAL_URL` — the OAuth callback proxy is only needed during local dev

### Wire webhooks
- [ ] In the Meta developer console, set the webhook callback URL to `https://gateway.up.railway.app/webhooks/meta` and verify `META_VERIFY_TOKEN` matches
- [ ] In the Twilio console, point the WhatsApp Business webhook to `https://gateway.up.railway.app/webhooks/twilio`

### Database migration
- [ ] Run `prisma migrate deploy` against the production Neon DB before first deploy

---

## Phase 5 — Schema-Backed Features
> ~1–2 days total. All items are parallel. Code can be written now, but each requires a Prisma migration that runs during Phase 4 / at deploy time.

- [ ] **Thread assignment** — add `assigneeId String? @map("assignee_id")` to the `Thread` model (nullable, references Clerk user ID); add an assignee picker in `ContextPanel.tsx`; add an `assignee` filter to the thread list query
- [ ] **Thread priority flag** — add `priority` enum (`urgent`, `high`, `normal`, `low`, default `normal`) to `Thread`; surface as a colored badge in `ThreadList` and a selector in `ContextPanel`; add a priority sort option to the thread list
- [ ] **Customer profile notes** — add a `notes Text?` field to the `Customer` model; surface as an editable textarea in `ContextPanel` below customer info; persisted via a new `PATCH /api/threads/customer/[customerId]` route
- [ ] **CSAT survey on thread close** — when a thread is resolved, enqueue a BullMQ delayed job (1-hour delay) in the gateway that sends a one-click satisfaction link via the thread's channel; store the score in the existing `Feedback` table; surface avg CSAT in analytics

---

## Phase 6 — TikTok Integration
> Requires TikTok Business Messaging API Open Beta approval before any code runs in production. Code phases can be written in parallel while waiting for approval.

### Phase 0 — External Setup (manual — do first, approval takes days/weeks)
- [ ] Register a TikTok for Business API app at `business-api.tiktok.com/portal` using a TikTok Business Account
- [ ] Apply for **Business Messaging API** Open Beta access — requires TikTok data security and privacy review
- [ ] Add OAuth callback URL `{APP_URL}/api/integrations/tiktok/callback` in the portal
- [ ] Register gateway webhook URL `{GATEWAY_URL}/webhooks/tiktok` and subscribe to `direct_message` events
- [ ] Collect credentials: `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`, `TIKTOK_WEBHOOK_SECRET`

### Phase 1 — Constants
- [ ] `apps/gateway/src/constants.ts` — add `TIKTOK: 'tiktok'` to `CHANNEL` and `TIKTOK: 'process-tiktok-dm'` to `JOB`

### Phase 2 — OAuth Routes (dashboard)
- [ ] Create `apps/dashboard/src/app/api/integrations/tiktok/auth/route.ts` — CSRF state cookie, redirect to `https://business-api.tiktok.com/portal/auth` with `app_id`, `state`, `redirect_uri`, `scope=business.dm`
- [ ] Create `apps/dashboard/src/app/api/integrations/tiktok/callback/route.ts`:
  - Validate CSRF state cookie
  - Exchange `auth_code` → `bc_access_token` via `POST https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/`
  - Fetch business display name via `GET https://business-api.tiktok.com/open_api/v1.3/business/get/`
  - Subscribe to DM webhooks via `POST https://business-api.tiktok.com/open_api/v1.3/business/messaging/webhook/subscribe/`
  - `db.integration.upsert` with `platform: 'tiktok'`, `externalAccountId: business_id`, `accessToken: bc_access_token`, `tokenExpiresAt: +30d`
  - Redirect to `?connected=tiktok`

### Phase 3 — Gateway Webhook Handler
- [ ] `apps/gateway/src/routes/webhooks.ts` — add `GET /tiktok`: echo back `challenge` query param for TikTok webhook URL verification
- [ ] `apps/gateway/src/routes/webhooks.ts` — add `POST /tiktok`:
  - Verify `X-TikTok-Signature` (HMAC-SHA256 of raw body) via `timingSafeEqual`
  - Extract `business_id`, check for real message presence
  - `resolveOrganizationId(CHANNEL.TIKTOK, business_id)`
  - Enqueue `JOB.TIKTOK`; always return HTTP 200

### Phase 4 — Worker Branch
- [ ] `apps/gateway/src/worker.ts` — add `CHANNEL.TIKTOK` branch:
  - Extract `from_user_id`, `message_content.text`, `message_id` from webhook payload
  - Skip own-account echo messages (`from_user_id === business_id`)
  - Optionally fetch sender profile via `GET https://business-api.tiktok.com/open_api/v1.3/user/info/`
  - Call `processInboundMessage(organizationId, from_user_id, CHANNEL.TIKTOK, text, { externalMessageId: message_id })`

### Phase 5 — Outbound Dispatch
- [ ] `apps/dashboard/src/app/api/messages/route.ts` — add `CHANNEL_TYPE.TIKTOK` block:
  - Fetch integration by `platform: CHANNEL_TYPE.TIKTOK` for the org
  - `POST https://business-api.tiktok.com/open_api/v1.3/business/message/send/` with `Access-Token` header and `{ business_id, to_user_id, message: { text } }`
  - On non-2xx: return 502

### Phase 6 — UI
- [ ] `apps/dashboard/src/app/dashboard/integrations/_components/IntegrationCard.tsx` — add `'tiktok'` to `ConnectType` union and a connect button branch linking to `/api/integrations/tiktok/auth`
- [ ] `apps/dashboard/src/app/dashboard/settings/_components/IntegrationsTab.tsx` — change TikTok entry `connectType` from `'coming-soon'` to `'tiktok'`; add `connected=tiktok` banner case

> **Notes:** Confirm exact OAuth parameter names and payload field names against the live API spec once Open Beta access is granted. TikTok `bc_access_token` expires after ~30 days — store `refresh_token` in `Integration.metadata` if returned, then add a token-health cron (same pattern as Instagram). DMs only — video comments are out of scope.

---

## Backlog
> Lower-priority items with no blocking dependency. Can be picked up at any time.

- [ ] **Remove hardwired demo notifications** — `apps/dashboard/src/app/dashboard/layout.tsx`: delete the two hardcoded entries (`demo-trial`, `demo-integration`) at the top of the `notifications` array; the real computed notifications below them (integration count, trial days, past-due) will take over automatically

- [ ] **Inbound email attachments** — handle the `Attachments` array from Postmark inbound webhooks; store URLs in `Message.attachments` (field already exists in schema); display in `ConversationView`
- [ ] **Webhook / Zapier outbound** — document the payload schema for outbound events (thread created, message received, thread closed); implement an `Integration` type of `webhook` that POSTs to a configured URL on each event
- [ ] **Typing indicators** — optionally show a typing indicator in the outbound composer before send; scoped to the UI only (no backend changes needed)
- [ ] **Browser notifications / SSE** — replace the 3-second SWR poll on `/api/threads` with a Server-Sent Events stream from the dashboard; allows background tab notifications for new tickets without polling overhead
