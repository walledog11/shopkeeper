# Punch List

What needs to be done next, in priority order. Not a launch checklist — a roadmap of the gaps that exist today, surfaced from a real walk through the integrations, agent, and onboarding.

ICP: solo Shopify merchant or 2–3 person team. Email is the primary support channel, Instagram is the likely second, and the merchant talks to their own agent over a messaging app (operator channel).

---

## 1. Email — the only channel today, and it is not actually production-grade

The current Postmark flow asks the merchant to type their support address into a textbox, manually configure email forwarding, and trust DKIM/SPF will line up. None of that will work for a solo merchant.

### 1a. Switch the primary email integration to Gmail / Outlook OAuth

Outbound OAuth is shipped. See `docs/email-integration-overhaul.md` for the full surface — provider abstraction, Gmail + Outlook OAuth callbacks, single-active-email-row invariant, sanitized `/api/integrations` response, and the "Auth expiring" UI gate keyed off `tokenExpiresAt = new Date(0)`. Postmark forwarding is preserved as an advanced fallback.

Why this matters:

- No DNS to configure. Merchant clicks "Connect Gmail," authorizes via Google, done.
- Outbound goes from the merchant's real address with their real DKIM. Inbox placement is solved by default.
- Sent items appear in their Gmail "Sent" folder, so they can still use Gmail directly on days they want to.
- No DKIM/SPF/Return-Path mystery for the merchant to debug.

Still deferred (intentionally — see overhaul doc):
- Gmail/Outlook inbound polling or webhook ingestion (today inbound only arrives through the Postmark/forwarding path).
- Gmail `users.watch` / Pub/Sub renewal.
- Outlook inbound read scopes (`Mail.ReadWrite`).

### 1b. If Postmark stays as a path, fix the gaps before exposing it

- [~] Display the inbound Postmark address in the UI with copy buttons and per-provider forwarding instructions (Google Workspace, Outlook 365, cPanel, Cloudflare Email Routing). **Partial:** inbound address + copy button is in `IntegrationCard.tsx` (the `EmailForwardingDisclosure`), but the body is one generic sentence — no per-provider step-by-steps for Google Workspace / Outlook 365 / cPanel / Cloudflare yet.
- [ ] Add Postmark Sender Signature verification flow — without it, outbound from `support@merchant.com` will either be rejected by Postmark or land in spam.

---

## 2. Operator channel — kill Twilio, switch to Telegram (then WhatsApp Cloud API)

The intent for Twilio was operator-to-agent chat: the merchant approves / edits agent plans over a messaging app. Twilio is the wrong vehicle for that.

Why Twilio was wrong here (kept for context; code path is gone):
- WhatsApp Business approval is weeks of friction for a feature that should "just work."
- Per-message billing on top of the subscription — bad surprise for a solo merchant.
- iMessage is not a real option — Apple has no public API and Mac-relay workarounds are against ToS and unreliable. Drop it from the plan entirely.

### 2a. Telegram operator channel — shipped

Telegram is live. `apps/gateway/src/routes/webhooks-telegram.ts` is the receiver, the `OperatorContext` table (`packages/db/prisma/schema.prisma:183`) replaced `SmsContext`, and the dashboard has a Telegram bind flow per `OrgMember`. Same `yes` / `no` / `skip N` / freeform semantics. Twilio code path was deleted in `d718485` and Twilio is gone from the integrations UI.

Residual cleanup (docs only, not code):
- [x] Strip the `TWILIO_*` references and "WhatsApp/SMS — complete (Twilio…)" line from `README.md` and `docs/production/runbook.md` — done; Telegram replaces the operator-channel callouts.

### 2b. Add WhatsApp Cloud API (Meta direct, not Twilio) as the second operator option

- [ ] Direct Meta Cloud API integration. Free for the first 1000 conversations/month.
- [ ] Same plan-approval interface as Telegram, behind the same `OperatorContext` abstraction.
- [ ] Only worth building once a merchant asks for it — Telegram covers most early users.

### 2c. Evaluate web-push to a PWA as the long-term replacement

- [ ] Eventually the right answer is a push notification with inline "Approve / Skip / Edit" actions to a mobile-friendly dashboard. No messaging-app dependency. Park this until Telegram is shipped.

---

## 3. Instagram DM — almost certainly not working today

Listed as "100% complete" in memory; in practice there are four reasons a real merchant cannot use it.

- [x] **24-hour window handling.** `dispatch-message.ts` now distinguishes Meta `error.code === 10` / subcode `2018278` from `190`, returning a "Instagram only allows replies within 24 hours of the customer's last message" error. The composer (`Composer.tsx`) gates the send button and shows an inline amber banner for IG threads where the last customer message is older than 24h.
- [ ] **Confirm Meta App Review status.** `instagram_manage_messages` and friends require Meta App Review before non-dev-user accounts can connect. If review hasn't been submitted/passed, no real merchant can connect IG today. Submit if not already done.
- [ ] **Verify `entry[0].id` matches `externalAccountId`.** The webhook (`webhooks-meta.ts:81`) routes by `entry[0].id`. The callback stores `igAccountId` (IG Business Account ID). For the Instagram Login flow these match; for the older Page Messenger flow, `entry[0].id` is the Page ID and webhooks will silently drop. Print both side-by-side from a real test event and confirm.
- [~] **OAuth error UX.** Help-content remediation guide is in place (`apps/dashboard/src/app/dashboard/_components/help/content/troubleshooting.ts:52` and `help/content/integrations.ts:48`) — covers Business account, Facebook Page link, and classic Page admin. **Missing:** that remediation copy is not surfaced at the failure point — the post-callback banner (whatever `no_ig_account` renders to today) needs to link into / inline the help content so the merchant sees it without hunting through Help.

---

## 4. Shopify — close, but two real gaps

- [x] **Handle `app/uninstalled` webhook.** Gateway now deletes the matching integration row on `app/uninstalled` (`apps/gateway/src/routes/webhooks-shopify.ts`); the OAuth callback subscribes to the topic alongside the order topics. UI falls back to the standard "not connected" state, so the merchant can reconnect from `/dashboard/integrations`.
- [x] **Pin a single API version.** All Shopify Admin REST calls (callback, kb-sync, orders, products, customer(s), search, gateway customer lookup) now use `2026-04`, matching the agent client. Tests updated accordingly.
- [ ] **GDPR webhooks** (`customers/data_request`, `customers/redact`, `shop/redact`) — only needed if Shopify App Store listing is on the table. Defer until you commit to App Store.

---

## 5. Agent — remaining safety work

Per-thread mutex, daily refund cap, and the `escalate_to_human` tool are all shipped (`apps/dashboard/src/lib/server/agent-lock.ts`, `apps/dashboard/src/lib/server/refund-spend.ts`, `apps/dashboard/src/lib/agent/tools/thread.ts:escalateToHuman`). Mutex fails open on Redis errors so a Redis outage doesn't take the agent offline.

Residual:
- [~] **Real-time operator push on escalation.** **Partial:** `escalate_to_human` flips the thread to `pending` with a `needs_human` tag and writes an audit note, so escalated threads surface in the next digest tick. **Missing:** an instant Telegram push to bound `OrgMember` chats. The gateway already has `notifyOperator` (`apps/gateway/src/operator-notify.ts:21`); needs a new dashboard→gateway internal endpoint to invoke it.
- [ ] **Confidence-based autonomy** (longer arc). High-confidence simple cases ("where's my order" with a shipped status, return-policy lookup) should act immediately with a 10-second undo button. That's the actual differentiation over Gorgias. Park until production usage tells us which cases are safe to auto-resolve.

---

## 6. Onboarding — the order is wrong

- [ ] **Reverse the onboarding flow.** Today it is `welcome → connect → plan`, which asks for payment before the merchant has seen a real message route through. Move plan selection to *after* the first message has actually been delivered to a connected channel.
- [~] **Real-channel test loop.** **Partial:** the integrations row now uses a `waiting-for-inbound` status pill (`apps/dashboard/src/components/integrations/IntegrationCard.tsx:84,95`) so "Connected" is held back until the first real inbound arrives. **Missing:** the onboarding flow itself (`(onboarding)/connect/page.tsx`) doesn't surface this — it lets the merchant move on to `/plan` the moment OAuth returns. Move the "send a test from your inbox" prompt into the onboarding step and gate progression on the first inbound landing.

---

## 7. Real-time, not polling

- [ ] Replace SWR polling (`usePaginatedThreads.ts:32` — 15s open / 60s closed) with push from the gateway when a new message lands. SSE or a hosted pubsub (Pusher / Ably / Liveblocks) is fine. The current setup is constant Neon CPU churn that scales linearly with concurrent users × open threads, and the UX latency is worse than it needs to be.

---

## 8. Carry-over operational items from the old checklist

Items from the previous checklist that are still genuinely pending and worth doing soon.

- [ ] Rotate `INTERNAL_API_SECRET` to a new production-only value; remove any dev/shared reuse.
- [ ] Confirm Vercel and Railway env vars are scoped to production only (no preview/dev reuse) and that no secrets are committed to the repo.
- [ ] Confirm Neon production branch has point-in-time recovery enabled; record the retention window in `runbook.md`.
- [ ] Stripe: production account, restricted `STRIPE_SECRET_KEY`, Starter + Pro products/prices.
- [ ] Manually walk the failed-payment path: Stripe `invoice.payment_failed` → app reflects past-due state → user-visible banner → write-gating kicks in.

---

## Explicitly out of scope

- **iMessage** — no public API, no reliable path. Don't build.
- **Twilio SMS / WhatsApp** — superseded by Telegram + WhatsApp Cloud API for the operator channel. Customer-facing SMS isn't on the ICP path.
- **TikTok DMs** — open beta, narrow merchant overlap, large code surface. Don't pre-build.
- **Facebook Messenger** — declining channel; Instagram covers the same audience.
- **USPS Tracking API** — Shopify already exposes `fulfillment.tracking_url`.
- **Ticket assignment, per-org outbound signatures, customer notes** — defer until a multi-seat customer asks.

---

## How to use this list

The order is intentional. Email OAuth (1a) and the operator channel switch (2a) are the two changes that turn the app from "the founder uses it in dev" into "a real merchant can use it without you babysitting." Everything below those is real but doesn't matter if the first two aren't done.
