# Production Checklist

Items are organized by phase and dependency order. Items within a phase can be done in parallel unless noted.

---

## Phase 1 — Start Immediately (Two Parallel Tracks)

Run both tracks concurrently. Track A is gated on external parties and can take days to weeks; Track B is pure code with no external dependencies.

### Track A — External Approvals & Accounts (start today — long lead times)

**TikTok** _(Open Beta approval takes days to weeks — apply first)_
- [ ] Register a TikTok for Business API app at `business-api.tiktok.com/portal` using a TikTok Business Account
- [ ] Apply for **Business Messaging API** Open Beta access — requires TikTok data security and privacy review
- [ ] Add OAuth callback URL `{APP_URL}/api/integrations/tiktok/callback` in the portal
- [ ] Register gateway webhook URL `{GATEWAY_URL}/webhooks/tiktok` and subscribe to `direct_message` events
- [ ] Collect credentials: `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`, `TIKTOK_WEBHOOK_SECRET`

**Stripe**
- [ ] Create a Stripe account; obtain a restricted `STRIPE_SECRET_KEY` for production
- [ ] Create products and prices for Starter and Pro tiers; note the two price IDs
- [ ] In the Stripe dashboard, add a webhook endpoint pointing to `https://your-vercel-app.vercel.app/api/billing/webhook` with events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`; note the signing secret

**Twilio / WhatsApp**
- [ ] Upgrade from Twilio trial to a paid account
- [ ] Switch from the WhatsApp Sandbox to a live WhatsApp Business number (sandbox requires manual opt-in and cannot send first messages)
- [ ] Note the production `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, and the E.164 `TWILIO_FROM_NUMBER` for OTP SMS

---

### Track B — Code (no external dependencies — write now, ship when Track A is ready)

**Inbox**
- [ ] **Smart inbox auto-sort** — automatically float urgent threads to the top of the queue based on Shopify order state; a thread with a linked unfulfilled Shopify order and an open customer action request (address change, cancellation, etc.) should rank above threads with no time constraint; implement as an `urgencyScore` computed in the thread list query (no schema change required — derive from existing `Thread.shopifyCustomerId` + order data) or as a nullable `urgencyScore Int?` column updated when the order state is known

**Customer**
- [ ] **Customer profile notes** — add a `notes Text?` field to the `Customer` model; surface as an editable textarea in `ContextPanel` below customer info; persisted via a new `PATCH /api/threads/customer/[customerId]` route

**TikTok Implementation** _(write now; deploy when Open Beta approval lands from Track A)_
- [ ] `apps/gateway/src/constants.ts` — add `TIKTOK: 'tiktok'` to `CHANNEL` and `TIKTOK: 'process-tiktok-dm'` to `JOB`
- [ ] Create `apps/dashboard/src/app/api/integrations/tiktok/auth/route.ts` — CSRF state cookie, redirect to `https://business-api.tiktok.com/portal/auth` with `app_id`, `state`, `redirect_uri`, `scope=business.dm`
- [ ] Create `apps/dashboard/src/app/api/integrations/tiktok/callback/route.ts`: validate CSRF state, exchange `auth_code` → `bc_access_token`, fetch business display name, subscribe to DM webhooks, `db.integration.upsert`, redirect to `?connected=tiktok`
- [ ] `apps/gateway/src/routes/webhooks.ts` — add `GET /tiktok`: echo back `challenge` query param for TikTok webhook URL verification
- [ ] `apps/gateway/src/routes/webhooks.ts` — add `POST /tiktok`: verify `X-TikTok-Signature` (HMAC-SHA256), extract `business_id`, `resolveOrganizationId`, enqueue `JOB.TIKTOK`; always return HTTP 200
- [ ] `apps/gateway/src/worker.ts` — add `CHANNEL.TIKTOK` branch: extract `from_user_id`, `message_content.text`, `message_id`; skip own-account echo messages; call `processInboundMessage`
- [ ] `apps/dashboard/src/app/api/messages/route.ts` — add `CHANNEL_TYPE.TIKTOK` outbound block: fetch integration, `POST` to TikTok Business Message API, return 502 on non-2xx
- [ ] `apps/dashboard/src/app/dashboard/integrations/_components/IntegrationCard.tsx` — add `'tiktok'` to `ConnectType` union and connect button
- [ ] `apps/dashboard/src/app/dashboard/settings/_components/IntegrationsTab.tsx` — change TikTok entry `connectType` from `'coming-soon'` to `'tiktok'`; add `connected=tiktok` banner case

> **TikTok Notes:** Confirm exact OAuth parameter names and payload field names against the live API spec once Open Beta access is granted. `bc_access_token` expires after ~30 days — store `refresh_token` in `Integration.metadata` if returned, then add a token-health cron (same pattern as Instagram). DMs only — video comments are out of scope.

---

## Phase 2 — Infrastructure Setup
> All parallel. Depends on Track A accounts existing. Can overlap with the tail end of Track B code work.

- [ ] Create an Upstash Redis database (use the same region as your Vercel/Railway deployments); confirm TLS is enabled (the `rediss://` scheme)
- [ ] Confirm `DATABASE_URL` points to the production Neon PostgreSQL instance (not a dev branch); confirm the connection string includes `?pgbouncer=true&connection_limit=1`
- [ ] Deploy dashboard to Vercel
- [ ] Deploy gateway to Railway; confirm the service start command is `npm run start`

---

## Phase 3 — Configure & Deploy
> Mostly sequential. Requires Phase 2 production URLs before wiring webhooks.

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
- [ ] `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`, `TIKTOK_WEBHOOK_SECRET`
- [ ] `SENTRY_DSN` (optional)

**Gateway (Railway)**
- [ ] `DATABASE_URL` — same Neon connection string with pgbouncer params
- [ ] `REDIS_URL` — Upstash `rediss://` URL (ioredis-compatible)
- [ ] `ANTHROPIC_API_KEY`
- [ ] `INTERNAL_API_SECRET` — must match dashboard value exactly
- [ ] `META_APP_SECRET`, `META_VERIFY_TOKEN`
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, `TWILIO_WEBHOOK_URL`
- [ ] `SHOPIFY_APP_SECRET`
- [ ] `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`, `TIKTOK_WEBHOOK_SECRET`
- [ ] `SENTRY_DSN` (optional)
- [ ] Remove `DASHBOARD_INTERNAL_URL` — the OAuth callback proxy is only needed during local dev

### Wire webhooks
- [ ] In the Meta developer console, set the webhook callback URL to `https://gateway.up.railway.app/webhooks/meta` and verify `META_VERIFY_TOKEN` matches
- [ ] In the Twilio console, point the WhatsApp Business webhook to `https://gateway.up.railway.app/webhooks/twilio`
- [ ] In the TikTok portal, verify the webhook URL is set to `https://gateway.up.railway.app/webhooks/tiktok`

### Database migration
- [ ] Run `prisma migrate deploy` against the production Neon DB before first deploy

---

## Phase 4 — Post-Launch
> Ship the core product first. Pick these up once merchants are onboarded.

### Inbox Efficiency
- [ ] **Stale-ticket auto-close playbook trigger** — add a `no_customer_response` trigger type to playbooks (fires N days after last customer message with no reply); requires a new daily BullMQ cron that scans open threads; pairs with the existing `close_ticket` action type

### Channels
- [ ] **Facebook Messenger** — Meta Graph API is already wired for Instagram; Messenger uses the same platform but routes via `page_id` instead of `ig_user_id`; add `CHANNEL.MESSENGER` constant, a new `POST /webhooks/meta-messenger` handler (or extend the existing Meta handler with a page message event branch), and a `messenger` outbound block in `apps/dashboard/src/app/api/messages/route.ts`; OAuth connects the Facebook Page (separate from the IG integration). Deprioritized — only build when a merchant actively uses Facebook Page DMs.
- [ ] **Live chat Shopify app** — a separate embeddable Shopify storefront widget that opens a real-time chat bubble; routes customer messages into Clerk as a new `live_chat` channel type; requires a Shopify app listing, a WebSocket or SSE connection from the widget to the gateway, and a new channel handler in the worker; scoped as a future standalone project after the main app ships

---

## Backlog
> No blocking dependency. Pick up at any time.

- [ ] **Inbound email attachments** — handle the `Attachments` array from Postmark inbound webhooks; store URLs in `Message.attachments` (field already exists in schema); display in `ConversationView`
- [ ] **Typing indicators** — show a typing indicator in the outbound composer before send; scoped to the UI only (no backend changes needed)
- [ ] **Browser notifications / SSE** — replace the 3-second SWR poll on `/api/threads` with a Server-Sent Events stream; the natural home is the gateway (Railway/Express) since it's a persistent server and already knows when new messages arrive (Vercel serverless has a max execution time that makes SSE impractical there); 3s polling is acceptable at low volume, not a launch blocker


  Inbox (Highest-Traffic Feature)

  1. "Needs My Reply" filter view
  The SLA dots (green/amber/red) exist but there's no dedicated filter for threads where the last real message was from a customer. This is the most common mental
   model for a solo merchant ("show me what I haven't answered yet") and would save the most time. The data is already in the thread list (lastCustomerMessageAt +
   sender type).

  2. Right-click / swipe quick actions on thread rows
  To triage a backlog, a merchant has to open every ticket. A context menu (or hover action strip) on each row for Close, Tag, and Assign would let them process
  20 tickets in 60 seconds without opening any of them.

  3. Draft auto-save
  If you type a partial reply and click away to check an order or another ticket, the draft is gone. Auto-saving to localStorage keyed by threadId is a small
  change with outsized UX value — especially on mobile.

  4. Ticket assignment to team members
  For orgs with 2+ people, there's no way to divide the queue. A simple assigneeId field on Thread + an "Assign to" dropdown in the conversation header would be
  enough. Threads can default to unassigned. This unblocks the small-team use case entirely.

  ---
  Customer Context Panel

  8. VIP / risk badge
  total_spent and orders_count are already shown, but there's no signal synthesis. A "VIP" badge (e.g., >5 orders or >$500 spent) and a "First order" badge would
  immediately change how an agent handles the conversation — a $1,200 customer gets a different response than a first-time buyer. One computed badge, no new data.

  9. Visual order timeline
  The order list shows fulfillment status as a text pill, but a merchant glancing at the panel often just wants to know: is the most recent order on its way or
  not? A compact 4-step timeline (Placed → Paid → Fulfilled → Delivered) with the current step highlighted would replace reading four separate status fields.

  ---
  Post-Close / Customer Satisfaction

  10. CSAT survey
  This is the biggest missing feature for a Shopify merchant. After a ticket closes, automatically send a short survey: "Was your issue resolved? 👍 Yes / 👎 No."
   One follow-up text field. Feed the scores into Analytics as a new CSAT card. The infrastructure (outbound email/SMS, thread close hooks) all exists. This is
  the metric investors and the merchant's own customers will reference first.

  ---
  Playbooks

  11. no_customer_response trigger (stale auto-close)
  Already called out in the production checklist backlog, but worth emphasizing — a merchant's biggest time sink is "zombie" tickets that are waiting on a
  customer who will never reply. An N-day stale trigger is the single most-requested feature in every helpdesk tool and pairs naturally with the existing
  close_ticket action.

  12. More trigger types
  new_ticket, tag_applied, ticket_closed cover the basics. Adding order_fulfilled (Shopify webhook already ingested) and first_order_customer would let merchants
  set up proactive shipping confirmations and first-purchase thank-you flows entirely from the playbook UI.

  ---
  Knowledge Base

  13. Article import (CSV / paste)
  Merchants with an existing FAQ document have to copy-paste every article manually. A "Bulk import" button that accepts CSV (title,body,tags) or even a raw text
  dump (auto-split by headings) would cut onboarding time for anyone with more than 5 articles.

  14. KB article usage stats
  Which articles does the agent actually retrieve and cite? Showing a small "Used X times" count on each article helps the merchant know what's working and what
  gaps to fill. This needs one write on article retrieval in the agent runner, then display in the KB UI.

  ---
  Analytics

  15. Period-over-period trend arrows
  Every KPI card shows a value but not whether it's going up or down. Adding a +12% / -5% vs. the previous equivalent period would convert the page from a
  snapshot into an actual trend indicator. The data is already there — just compute the same query for the prior window.

  16. Agent savings estimate
  Merchants don't intuitively know how much the AI is saving them. A "~X hours saved this month" estimate based on aiReplies × avg_handle_time_per_ticket (a
  reasonable constant like 5 min) would make the product's ROI concrete and visible. One derived stat, no backend changes.

  ---
  Settings / Org-level

  17. Custom SLA targets
  The inbox SLA dots use hard-coded 4h/24h thresholds. Letting merchants set their own target (e.g., "I want to respond within 2 hours") in Settings would make
  the color coding mean something to their actual business. One slaTargetHours field on OrgSettings.

  18. Email signature
  Outbound email replies have no signature. A brand name, tagline, and store URL footer on every email is a basic expectation that Shopify merchants will notice
  is missing when emailing customers. A emailSignature textarea in the Agent settings tab, appended to outbound Postmark sends.

  19. Integration health alerts in-app
  The Integrations page shows token health but a merchant might not visit it for weeks. A subtle warning banner (or notification dot on the sidebar nav icon) when
   any integration token is expiring or broken would surface this before it silently breaks their support flow.

  ---
  Concierge (Agent Chat)

  20. Suggested prompts / shortcuts
  The standalone Concierge chat starts with a blank input. Showing 3–4 prompt chips ("Check order status for [customer]", "Draft a refund for the last return
  request", "Summarize today's tickets") would reduce the blank-slate friction and demonstrate the agent's full capabilities to new users.