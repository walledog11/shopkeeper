# Punch List

What needs to be done next, in priority order. Not a launch checklist — a roadmap of the gaps that exist today, surfaced from a real walk through the integrations, agent, and onboarding.

ICP: solo Shopify merchant or 2–3 person team. Email is the primary support channel, Instagram is the likely second, and the merchant talks to their own agent over a messaging app (operator channel).

---

## 1. Email — the only channel today, and it is not actually production-grade

The current Postmark flow asks the merchant to type their support address into a textbox, manually configure email forwarding, and trust DKIM/SPF will line up. None of that will work for a solo merchant.

### 1a. Switch the primary email integration to Gmail / Outlook OAuth

This is the single biggest unlock. Help Scout, Gorgias, Front, Missive, Tidio — every successful SMB helpdesk does this. Why:

- No DNS to configure. Merchant clicks "Connect Gmail," authorizes via Google, done.
- Outbound goes from the merchant's real address with their real DKIM. Inbox placement is solved by default.
- Sent items appear in their Gmail "Sent" folder, so they can still use Gmail directly on days they want to.
- No DKIM/SPF/Return-Path mystery for the merchant to debug.

Implementation:
- Gmail API with `gmail.modify` scope.
- Pub/Sub watch for inbound (or polling fallback).
- `users.messages.send` for outbound; carry the original `Subject`, `In-Reply-To`, `References`.
- Outlook later — same pattern via Microsoft Graph.

Keep Postmark in the codebase as a fallback for merchants who can't OAuth, but make OAuth the default.

### 1b. If Postmark stays as a path, fix the gaps before exposing it

- [ ] Display the inbound Postmark address in the UI with copy buttons and per-provider forwarding instructions (Google Workspace, Outlook 365, cPanel, Cloudflare Email Routing).
- [ ] Add Postmark Sender Signature verification flow — without it, outbound from `support@merchant.com` will either be rejected by Postmark or land in spam.
- [ ] Stop hardcoding `Re: Your inquiry` as the outbound subject (`apps/dashboard/src/lib/messaging/dispatch-message.ts:126`). Carry the thread's original subject through.
- [ ] Replace the instant "Connected" state in the integrations row with an inline "we haven't received any mail at this address yet — send a test from your own inbox to verify" until the first inbound arrives.

---

## 2. Operator channel — kill Twilio, switch to Telegram (then WhatsApp Cloud API)

The intent for Twilio was operator-to-agent chat: the merchant approves / edits agent plans over a messaging app. Twilio is the wrong vehicle for that.

Why Twilio is wrong here:
- WhatsApp Business approval is weeks of friction for a feature that should "just work."
- Per-message billing on top of the subscription — bad surprise for a solo merchant.
- Sandbox-only until approved, and the code's sandbox-fallback path (`apps/gateway/src/routes/webhooks-twilio.ts:115`) can silently mask a misconfigured production setup.
- iMessage is not a real option — Apple has no public API and Mac-relay workarounds are against ToS and unreliable. Drop it from the plan entirely.

### 2a. Add Telegram as the primary operator channel

- [ ] Single Clerk Telegram bot. Merchant scans a QR / clicks a deep-link from the dashboard that opens `t.me/ClerkBot?start=<org-token>`. Bot binds that chat to the merchant's `OrgMember`.
- [ ] Same plan-approval semantics as today: `yes`, `no`, `skip N`, freeform reply.
- [ ] Replace the `SmsContext` table or generalize it to `OperatorContext` keyed by `(orgId, chatId, channel)`.
- [ ] Free, no approval, no per-message cost.

### 2b. Add WhatsApp Cloud API (Meta direct, not Twilio) as the second operator option

- [ ] Direct Meta Cloud API integration. Free for the first 1000 conversations/month.
- [ ] Same plan-approval interface as Telegram, behind the same `OperatorContext` abstraction.
- [ ] Only worth building once a merchant asks for it — Telegram covers most early users.

### 2c. Remove or quarantine the Twilio code path

- [ ] Move `webhooks-twilio.ts`, `dispatch-message.ts` Twilio branch, and `TWILIO_*` env vars behind a feature flag or delete them.
- [ ] Drop Twilio from the integrations UI.

### 2d. Evaluate web-push to a PWA as the long-term replacement

- [ ] Eventually the right answer is a push notification with inline "Approve / Skip / Edit" actions to a mobile-friendly dashboard. No messaging-app dependency. Park this until Telegram is shipped.

---

## 3. Instagram DM — almost certainly not working today

Listed as "100% complete" in memory; in practice there are four reasons a real merchant cannot use it.

- [ ] **24-hour window handling.** Meta rejects outbound after 24 hours with `error.code === 10` (subcode 2018278). `dispatch-message.ts:67` only catches `190`. Detect this case, surface "Instagram only allows replies within 24 hours of the customer's last message" in the UI, and gate the composer accordingly.
- [ ] **Confirm Meta App Review status.** `instagram_manage_messages` and friends require Meta App Review before non-dev-user accounts can connect. If review hasn't been submitted/passed, no real merchant can connect IG today. Submit if not already done.
- [ ] **Verify `entry[0].id` matches `externalAccountId`.** The webhook (`webhooks-meta.ts:81`) routes by `entry[0].id`. The callback stores `igAccountId` (IG Business Account ID). For the Instagram Login flow these match; for the older Page Messenger flow, `entry[0].id` is the Page ID and webhooks will silently drop. Print both side-by-side from a real test event and confirm.
- [ ] **OAuth error UX.** `no_ig_account` returns a six-word banner. Replace with a remediation guide: IG must be a Business account, linked to a Facebook Page, and the user must have classic "People with Facebook access" admin on the Page (not just Business Portfolio access).

---

## 4. Shopify — close, but two real gaps

- [ ] **Handle `app/uninstalled` webhook.** When a merchant uninstalls Clerk from Shopify, the access token is invalidated immediately. The integration row stays "connected" forever and every agent action errors mysteriously. Add a handler in `apps/gateway/src/routes/webhooks-shopify.ts` that marks the integration disconnected and surfaces it in the UI.
- [ ] **Pin a single API version.** OAuth callback uses `2024-01` (`apps/dashboard/src/app/api/integrations/shopify/callback/route.ts:105, 158`); the agent uses `2026-04` (`apps/dashboard/src/lib/agent/shopify/client.ts:1`). Pick one.
- [ ] **GDPR webhooks** (`customers/data_request`, `customers/redact`, `shop/redact`) — only needed if Shopify App Store listing is on the table. Defer until you commit to App Store.

---

## 5. Agent — two safety gaps that will burn a merchant

- [ ] **Per-thread mutex.** Two browser tabs + auto-plan + manual `@mention` can race in `run.ts`. The agent can issue two refunds, send two replies, or cancel an already-cancelled order. Add a per-`thread.id` lock (Redis SETNX with TTL is fine).
- [ ] **Daily / weekly spend cap.** `maxRefundAmount` only caps a single call. A malformed prompt could trigger many refunds before anyone notices. Add an org-level daily refund cap and disable the tool when the cap is hit until the next day.
- [ ] **`escalate_to_human` tool.** If tools fail or the question is out-of-scope, the model hallucinates or falls silent. Add an explicit escalation tool that flags the thread, notifies the merchant via the operator channel, and stops the run.
- [ ] **Confidence-based autonomy** (longer arc). High-confidence simple cases ("where's my order" with a shipped status, return-policy lookup) should act immediately with a 10-second undo button. That's the actual differentiation over Gorgias. Park until the safety gates above are in.

---

## 6. Onboarding — the order is wrong

- [ ] **Reverse the onboarding flow.** Today it is `welcome → connect → plan`, which asks for payment before the merchant has seen a real message route through. Move plan selection to *after* the first message has actually been delivered to a connected channel.
- [ ] **Real-channel test loop.** After the merchant connects email, prompt them to send a test message from their personal inbox and confirm receipt inline. "Connected" should not appear in the integrations row until at least one real inbound has arrived.
- [ ] **Past-due / cancelled billing UX** — past-due state should produce a clear in-app banner and gate writes, not silently fail mid-action. (Carry-over from the old checklist.)

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
