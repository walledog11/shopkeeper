# Shopify Storefront Chat

A text-only "Shopkeeper Chat" theme app extension on the existing Shopify app,
so shoppers can ask a question on the storefront and have it land in the
merchant's existing ticket, planning, approval, and Shopify-action pipelines.

This is the only new **customer-origin** channel on the table. Nothing else
proposed adds a way for a customer to reach the merchant.

Evidence, incident history and superseded reasoning live in
[production/storefront-chat-verification-2026-08.md](production/storefront-chat-verification-2026-08.md).
This file states current truth and what is left to build; that file records how
each claim was established and what was believed before it. Split on 2026-08-13.

Last reviewed: 2026-08-13.

---

## State

**The mechanism works and the merchant experience does not.** The full loop —
shopper asks → ticket → plan → merchant approves → reply in the widget — runs on
the dev store, including emailed-code order verification and the strong form of
the disclosure test. What a merchant receives is a nine-line approval card asking
permission to say "not shipped yet."

| | |
| --- | --- |
| **Live in production** | M0a, M0b, M1 transport, guest tool policy, both kill switches, spend budget, merchant setup UI, M1.5 verification. One store: `palette-dev-3peukw16.myshopify.com` (org Palette, `guarded`/`off`). |
| **Blocking a second store** | Notification shape — see [The card was the wrong artifact](#the-card-was-the-wrong-artifact). |
| **Blocking a real merchant** | The above, plus operability: budget-exhaustion alerting, session sweep, the silent dead-email-integration failure. |

### What to do next

1. **Notification shape.** The card is the wrong artifact for routine storefront
   messages. This is what holds a second store — the shopper side is done.
   Includes deleting the `Verified:` line
   (`apps/gateway/src/message-handlers/planning-notifications.ts:297`) and the
   self-narration M1.5 reintroduced, and sequencing auto-execute for verified
   read-only questions.
2. **The eval gate.** Red since 2026-08-08 — 13 fixtures failing or flaky, seven
   at 0/3, all pre-existing. Fix the thirteen, add the `shopify_chat` guest
   fixture (now unblocked), then capture. Owed since the guest policy landed and
   grown twice since.
3. **The dead email integration failing silently.** A sender whose token the
   provider rejects tells the shopper a code was sent and mails nothing.
4. **Operability before a second store:** merchant alert on budget exhaustion,
   scheduled sweep for expired sessions and `storefront_chat_daily_usage`,
   content check on a session's first message, approval-mode local
   acknowledgement.
5. **Two paths that have never fired live:** router-materialized escalation
   (the one that was deleting the reply), and step 5 of the webhook migration —
   one controlled order event reaching the gateway exactly once.
6. **Cheap owed checks:** the merchant-facing explanation for the
   `write_app_proxy` prompt was never written; no fresh install has confirmed
   what version 9 grants; no connected production merchant has been checked for a
   re-auth prompt (there is one store).
7. **Then the rollout step:** one real merchant workspace in approval mode
   through the integration card. Never exercised outside the dev store.

---

## Scope decision

The original draft shipped guest chat and Customer Account OAuth together. It is
split, and only the guest half is specified in full.

Dropping OAuth from the first shippable milestone removes the authentication
attempt table, PKCE, encrypted customer-token storage and refresh, customer
binding, two of the three new scopes, and the entire verified-session test matrix
— while still delivering the whole product loop. It also removes the risk: guest
mode is the *safe* tool policy, and because it needs no `customer_read_*` scopes,
M1 ships without forcing every already-connected merchant to re-authorize.

- **M0a** — Shopify app-configuration migration. ✅ **Shipped 2026-08-07.**
- **M0b** — App proxy and `write_app_proxy`. ✅ **Shipped 2026-08-07**, in the
  same version as M0a.
- **M1** — Guest-only storefront chat. 🚧 **Bar met, not finished.** Transport,
  guest policy, kill switches, spend budget and merchant setup UI are live, and
  the full loop is proven on the dev store. Outstanding: session revocation sweep
  and retention, exhaustion alerting, approval-mode acknowledgement, the eval
  gate, most of the test plan.
- **M1.5** — Emailed-code order verification. 🚧 **Wired 2026-08-11, verified
  live 2026-08-12.** Needs no new Shopify scopes, which is why it comes before
  M2. Outstanding: the silent email-integration failure, and the notification
  shape its first live card exposed.
- **M2** — Customer Account OAuth. Deferred and largely superseded by M1.5.

M0 was split in two once it was confirmed that declaring an app proxy requires
`write_app_proxy`, so the one-way, every-merchant-affecting migration would carry
no scope change. The split then dissolved as sequencing — both landed in one
file, `de2ee92f`, because the rehearsal established there was no irreversible step
to isolate. See the record.

## Prerequisites

- **The realtime subsystem proven in production.** ✅ **Cleared 2026-08-07** —
  `realtime:smoke` green against prod, `[Realtime] Subscribed` in gateway logs, a
  signed-in browser revalidating off a real push. Evidence under "Prove in prod"
  in [to-do-list.md](to-do-list.md).

  **This is a gate on the infrastructure, not a component M1 reuses.** The
  existing SSE is org-scoped in every dimension: `sse.ts` keys its connection map
  on `orgId`, `token.ts` verifies an `{orgId, exp}` payload signed with
  `INTERNAL_API_SECRET`, `publish.ts` uses a single global `REALTIME_CHANNEL`, and
  the CORS header admits exactly one origin. M1 needs session-scoped fan-out, a
  different signing secret, a storefront channel, and multi-origin CORS. What the
  canary buys is proof that gateway Redis pub/sub and long-lived SSE survive
  Railway under real traffic. **Budget for a second SSE implementation, not for
  plumbing.**

---

## M0a — app configuration migration ✅ shipped 2026-08-07

`shopify.app.toml` is in the repo root — the verbatim production export, unchanged
apart from the M0b additions — deployed as `shopkeeper-production-9` in
`de2ee92f`. `-8` remains available to re-release. The export is checked in at
[production/shopify-app-config-export-2026-08-07.toml](production/shopify-app-config-export-2026-08-07.toml)
as the rollback reference.

The dev-app rehearsal proved an existing install survives a released config change.
Full reasoning, the rehearsal procedure and what the export corrected are in the
record.

**Owed:** no fresh install has confirmed what version 9 grants, and no connected
production merchant has been checked for a re-authorization prompt.

**Also inherited, not caused:** the app declares none of the three mandatory
compliance webhooks (`customers/data_request`, `customers/redact`, `shop/redact`)
and has no handlers for them. Blocking for App Store distribution, which is
already deferred. Closing it means writing the handlers first, then declaring the
topics — not pointing them at `/webhooks/shopify`, whose topic allowlist rejects
them into silent failure.

**Webhook delivery inverted on 2026-08-09 (`e7d881c9`).** The TOML now declares
all five order/uninstall topics at app level and per-shop provisioning was
deleted; the migration is in
[production/shopify-webhook-migration.md](production/shopify-webhook-migration.md).
Step 4 is confirmed by audit. **Step 5 — one controlled order event reaching the
gateway exactly once — is unperformed**, and with zero per-shop subscriptions app
config is now the only delivery path, so a wrong declaration means silence rather
than duplication. Nothing persists a Shopify webhook receipt, so a dev-store order
event is the only thing that can close it.

## M0b — app proxy and `write_app_proxy` ✅ shipped 2026-08-07

Version 9 declares `[app_proxy]` (`/apps/shopkeeper-chat` →
`https://app.useshopkeeper.com/api/storefront-chat/proxy`) with `write_app_proxy`
in `[access_scopes]`, and the proxy resolves — Shopify-signed requests reach the
bootstrap route.

Adding the scope raises a re-authorization prompt for active merchants. It does
not break them: stores that never accept it are backfilled server-side by Shopify
and keep working. But a prompt is merchant-visible, and on a product whose first
principle is that trust is binary it should arrive attached to a feature the
merchant asked for.

**Owed:** the merchant-facing explanation for that prompt was never written.
Connected merchants are few enough to tell directly.

---

## M1 — guest-only storefront chat 🚧

Shoppers can start immediately and anonymously. Shopkeeper answers from the
knowledge base and public product information, escalates, and asks the merchant.
It discloses nothing customer-specific and mutates nothing, ever, on any input.

### Built

`c3733e33`, `de2ee92f`, `97232cc0`, `a0cad69c`, `85d990cc`, `fd5616db`.

- **The theme app extension** in `extensions/shopkeeper-chat` — a `body`-targeted
  app embed rendering into a Shadow DOM, with launcher label, greeting, accent and
  position as theme settings. It **polls**; SSE was deliberately deferred.
- **`ChannelType.shopify_chat` and `StorefrontChatSession`**, migrations
  `20260807120000_add_storefront_chat`, `20260808120000_add_storefront_chat_budget`
  and `20260809120000_add_storefront_chat_verification`.
- **`bootstrap` and `messages`** proxy routes on the dashboard, behind the app-proxy
  signature *and* a session bearer token; tokens signed with
  `STOREFRONT_CHAT_SIGNING_SECRET`, resume secrets stored hashed. The proxy
  signature verifier is separate from the webhook one and restores the empty
  `logged_in_customer_id` that Shopify signs and the request drops — established by
  measurement against a real request.
- **Gateway `/internal/storefront-chat/message`** → `processInboundMessage`, so
  storefront messages inherit dedupe, classification, summary, plan precompute,
  operator notify, and the existing `threads_one_open_per_customer` P2002 re-find
  rather than a parallel pipeline.
- **Outbound:** `sendReply`'s channel allowlist and `dispatch-message.ts` persist
  into the session's thread, refusing a revoked session.
- **Channel plumbing** across `CHANNEL_INFO`, the gateway `CHANNEL` constants, the
  analytics union, and the agent package's `CHANNEL_TYPE`.
- **Both kill switches**, defaulting off, re-read on every `/messages` call rather
  than trusted from the session token, so disabling takes effect immediately instead
  of at the end of the token's hour. The widget removes itself on a 403 rather than
  showing an error.
- **The guest tool policy** and **the spend budget** — specified below.
- **Merchant setup UI.** An admin-only toggle on the Shopify integration card backed
  by `PATCH /api/integrations/shopify/storefront-chat`, which merges
  `metadata.storefrontChat.enabled` without touching unrelated metadata. Enabling is
  rejected when `STOREFRONT_CHAT_ENABLED` is not `"true"`; disabling revokes every
  active session for that integration. Shows setup steps, a theme-editor deep link,
  and the Shopify Inbox warning.
- **Tests:** cross-tenant data-model, app-proxy signature, switch enforcement on both
  proxy routes, 50 guest-policy tests (every registry tool classified
  allowed-or-forbidden so a new tool cannot land unclassified; refusal asserted per
  forbidden tool across every autonomy tier including `full`; non-guest results
  asserted unchanged), eight budget tests across the gateway route and dashboard hop,
  two on the planning warning, plus the 35 M1.5 tests below.

### Not built

- **The approval-mode local acknowledgement** — the one guest-policy bullet still
  outstanding. Nothing tells the shopper a reply is coming while a plan waits for
  the merchant, and the acknowledgement must not be persisted as a `Message` or it
  invalidates the pending plan. May shrink once routine messages stop parking.
- **Session revocation and retention — partial.** Disabling from the integration
  card revokes that integration's active sessions; Shopify disconnect and
  `app/uninstalled` remove sessions by cascading integration delete. Missing: a
  scheduled sweep for expired sessions, revocation on workspace deletion without
  integration delete, and any `retention.ts` / `purge.ts` coverage.
  `storefront_chat_daily_usage` is likewise unswept — one row per shop per day,
  forever.
- **Budget exhaustion alerting and content filtering.** Exhaustion logs a warning
  and the daily counter deliberately climbs past its ceiling so sustained abuse
  stays distinguishable from a shop that merely reached its limit — but nothing
  reaches the merchant, and nothing inspects what a first message says. The budget
  bounds volume, not content.
- **Most of the test plan, and the eval gate.**

### Standing risk

Both switches are on for exactly one store, a dev store the author controls, with
no traffic and no inbound links.

What a shopper can *reach* is bounded — no order or customer data, no Shopify
mutation, at any autonomy tier. What a shopper can *spend* is bounded too: 30
messages per session and 200 per shop per day, refused before the model runs, so
exhaustion degrades the widget and leaves the org cap and the merchant's other
channels alone.

What remains is **operational blindness**: nothing tells the merchant their
storefront hit its ceiling, no sweep retires expired sessions, and no content check
stands between a bot and 200 admitted messages a day.

### Data model

- Add `shopify_chat` to `ChannelType`. Leave the existing `shopify` channel and its
  email-fallback behavior unchanged.
- `StorefrontChatSession`: organization, Shopify integration, anonymous visitor
  identity, current-episode pointer, storefront host, hashed resume secret,
  last-seen, expiry, revoked-at. The session is the durable browser identity,
  **not** the conversation. A `Thread` is one bounded conversation episode and the
  pointer must roll on the inactivity rules in
  [conversation-context-and-cross-channel-memory-plan.md](conversation-context-and-cross-channel-memory-plan.md),
  even while the same session continues. **No token columns and no
  verified-customer column** — those arrive with M2.
- Anonymous customers use `platformId = shopify_chat:<session-id>`.
- Budget counters: `StorefrontChatSession.messageCount` (lifetime per session — the
  session itself expires, and a shopper who clears it to reset the count lands on
  the per-shop and per-IP layers instead) and `StorefrontChatDailyUsage` keyed
  uniquely on `(integration_id, day)` so concurrent shoppers on one shop increment
  atomically. **Deliberately not `llm_daily_spend`** — exhausting the storefront
  must degrade the widget alone and leave the merchant's email and Instagram agents
  running, which a shared counter cannot express.
- Store only the hash of a 32-byte browser resume secret; never the secret.
- Revoke sessions on app uninstall, Shopify disconnect, merchant chat disablement,
  workspace deletion, and customer deletion.
- Retain chat messages under existing retention and deletion rules; extend the
  existing export and deletion paths to cover sessions.

Adding the enum member is a code milestone, not a rollout checkbox: `channelType`
has ~264 references across ~90 non-test files, and `CHANNEL_INFO` in
`apps/dashboard/src/lib/messaging/channels.ts` is an exhaustive
`Record<ChannelType, ChannelInfo>` that will not compile until every such map is
updated. Budget for `DASHBOARD_CHANNEL_TYPES`, `OPERATOR_CHANNEL_ORDER`
(`lib/integrations/catalog.ts`), the gateway `CHANNEL` constants
(`apps/gateway/src/constants.ts`), ticket filters, and analytics unions.

### Public interfaces and message flow

- **Bootstrap** — `POST /api/storefront-chat/proxy/bootstrap`. Verify Shopify's
  canonical app-proxy signature, timestamp freshness, shop domain, installed
  integration, enabled state, and forwarded storefront host. Accept optional
  `{sessionId, resumeToken, locale, pageUrl}`. Resume a valid visitor identity or
  create one **without** creating an empty ticket. Return session ID, the resume
  secret when newly created, short-lived API/SSE tokens, public widget settings,
  the current episode only, and collapsed metadata for prior episodes. If the
  current episode is past its hard idle boundary, report it as expired; do not
  treat opening the widget as conversation activity or inject the expired
  transcript into the next turn.
- Mint storefront access and SSE tokens with a dedicated
  `STOREFRONT_CHAT_SIGNING_SECRET`, never `INTERNAL_API_SECRET`. Bind every token
  to one session, organization, Shopify integration, and storefront host, and
  enforce tenant ownership on every read and write.
- **Transport** — `POST /storefront-chat/messages` (bearer session token, returns
  `202`), `GET /storefront-chat/messages?cursor=...` (customer-visible messages
  only; internal notes and action logs never leave Shopkeeper),
  `GET /storefront-chat/events?token=...` for conversation-scoped SSE
  invalidations. Limit text to 4,000 normalized characters; dedupe on
  `shopify_chat:<session-id>:<clientMessageId>`.
- Put shopper traffic on the **gateway**, not the dashboard, apart from the
  app-proxy bootstrap that Shopify itself must sign. The gateway already holds
  long-lived connections; Vercel functions must not, and the existing dashboard
  rate limiter is Upstash-REST-backed, so every send would add a round trip. Note
  also that `rate-limit.ts` fails closed outside development.
- Adding `/api/storefront-chat/*` to `publicRoutePatterns` in
  `apps/dashboard/src/proxy/path-access-policy.ts` makes it the first
  **shopper-traffic** public route; that list is otherwise webhooks and OAuth
  callbacks. Keep the added surface to bootstrap alone.
- Add a storefront-chat queue job and persistence handler: lock the session while
  creating its first customer/thread or rolling a closed **or hard-idle** thread
  into a new episode. The first new inbound message performs the rollover
  transactionally, expires the old cached/pending plan, preserves explicit open
  obligations separately, and rebinds the session. Create `shopify_chat` threads
  linked to the existing Shopify integration; reuse the existing summary,
  classification, planning, notification, and escalation processing only after
  those shared paths are request-scoped by the context plan.
- **Both of those thread-create paths run into `threads_one_open_per_customer`** —
  a partial unique index over (organization, customer, channel) `WHERE status =
  'open'`, created in migration
  `20260405000000_add_idempotency_and_thread_uniqueness` and **absent from
  `schema.prisma`**. Prisma will not warn, will not generate a typed constraint
  error, and the failure surfaces as a raw Postgres unique violation under
  concurrency. This drift has already broken thread-create work once. Design the
  session lock and the rollover against the index as it exists in the database, and
  decide up front whether a losing racer retries onto the winner's thread or
  surfaces a send failure to the widget.
- Extend outbound dispatch so manual, approved, and autonomously executed
  `send_reply` operations persist normally and publish to the matching storefront
  session. Provider failure must not create a successful outbound message.
- Publish identifiers only on a storefront-specific Redis channel; the browser
  refetches history after an invalidation. Fall back to 15-second polling when SSE
  is unavailable, with optimistic states and same-client-message-ID retry.

### Guest tool policy ✅ built 2026-08-08

`authState: "guest"` on the agent context, set in `buildContext` for `shopify_chat`
threads and nowhere else. Enforced in three places: the planner and the run loop
select from `GUEST_TOOL_NAMES`, and `checkStaticToolPolicy` refuses anything outside
it ahead of argument parsing, so a plan that names a forbidden tool is blocked at
execution rather than merely absent from the tool list.

- Allow knowledge base, product search, `send_reply`, escalation, merchant
  questions, and internal thread housekeeping.
- Block every order read, every customer read, and every mutative Shopify action in
  **static tool policy**, not in the prompt. Additionally no `send_email` (a guest's
  address is unverified) and no `get_support_stats` (the merchant's business, not
  the shopper's question).
- Never treat an order number, email address, Liquid customer value, or
  browser-supplied Shopify ID as authentication.
- Existing autonomy tiers, refund limits, business hours, execution ledger, and
  approval hashes remain authoritative for the reply path.
- Show an immediate local acknowledgement in approval mode but do **not** persist it
  as a `Message` — a persisted agent reply invalidates the pending customer plan
  that the approve→execute path requires. *(Still outstanding.)*
- **Say it in shop register, not system register.** The guest prompt branch forbids
  naming tools, lookups, widgets, integrations or permissions, and forbids inventing
  a support department or an email address it was never given. The first real
  refusal told a shopper the widget "has no order lookup access" — implementation
  talk aimed at someone buying a snowboard, which reads as a half-built store and
  tells anyone probing which surface to try next.
- **The prompt is 5 bullets and 269 words of principle, down from 13 bullets and
  649 words of situation-patching.** Read the record before adding a bullet here:
  five consecutive commits tuned wording and none of them worked. A prompt growing
  case by case means a capability is missing.

### Abuse and spend containment ✅ built 2026-08-08

This is the first surface where an anonymous stranger can trigger LLM spend with no
account. `packages/db/spend-store.ts` keys spend on `(organization, day, model)`
only — with no isolation, a scraped or bot-spammed storefront burns the org's entire
daily cap and takes the merchant's email and Instagram agent down with it.

- ✅ Per-session and per-shop-per-day budgets, enforced separately from and beneath
  the org daily cap, claimed in `apps/gateway/src/storefront-chat-budget.ts` from the
  internal route **before** `processInboundMessage` — so a refusal costs nothing.
  Asserted directly: the shop-budget test checks `llm_daily_spend` is still empty
  after a refusal.
- ✅ Gate before the model: per-session and per-IP fixed-window burst limits on
  gateway Redis, failing closed in production, ahead of the daily counters.
- ✅ Refusals return 429 with shopper-facing copy, which the dashboard passes through
  with `Retry-After` rather than flattening to a 502, and which the widget renders as
  a note rather than a delivery failure. Counters move only on an admitted message.
- ❌ A cheap non-LLM check on the first message of a session.
- ❌ Alert the merchant on sustained exhaustion.

**Denominated in messages, not dollars, and that is a deliberate trade.** The gate
has to run before the model to be worth anything, and at that point the spend of the
message being admitted is not yet known. One admitted message costs at most one
classification, one summary and one plan, so a message ceiling is a spend ceiling
with a known multiplier. True per-session dollar attribution would mean threading a
spend scope through `recordSpend` at every LLM call site including the planner — a
shared-surface change that pulls in the eval gate — and is deferred until a real
merchant's traffic makes the accuracy worth it.

Defaults, all env-tunable in the gateway: 30 messages per session, 200 per shop per
UTC day, 5 per session and 20 per IP per minute
(`STOREFRONT_CHAT_MAX_MESSAGES_PER_SESSION`,
`STOREFRONT_CHAT_MAX_MESSAGES_PER_SHOP_DAY`, `STOREFRONT_CHAT_BURST_PER_SESSION`,
`STOREFRONT_CHAT_BURST_PER_IP`, `STOREFRONT_CHAT_BURST_WINDOW_SECS`).

**One weakness worth naming: the per-IP limit rests on an unverified header.** Two
proxies sit between the shopper and the route — Shopify's app proxy and Vercel — and
the code takes the leading `x-forwarded-for` entry without having confirmed that is
the shopper's address. It is keyed on (integration, address) so that being wrong
degrades into a second per-shop rate limit rather than leaking across merchants or
locking out the internet, and neither the per-session burst limit nor either daily
budget depends on it. Worth measuring against a real storefront request.

### Widget

- Render inside a Shadow DOM with keyboard navigation, focus trapping, screen-reader
  labels, reduced-motion support, and a responsive mobile layout.
- Theme settings for button color, left/right position, greeting, and launcher label.
  Message UI stays text-only.
- Persist session ID and resume secret in shop-scoped `localStorage`; assume no
  app-proxy cookies. This preserves the visitor, not a forever-active thread.
- Show the current episode normally. Put earlier customer-visible episodes for that
  browser session behind collapsed, dated "Previous conversation" sections, including
  across closed- and idle-thread rollover. Never flatten those messages into the
  current episode or make the agent context depend on what the widget is displaying.
- Show reconnect, send-failed/retry, disabled, and rate-limited states.
- Exclude attachments, typing and read receipts, product cards, cart operations,
  email notifications, sign-in, and cross-device recovery.

### Merchant setup

- ✅ A `body`-targeted theme app embed containing the isolated chat bubble/dialog.
- ✅ "Enable storefront chat" on the existing Shopify integration card, with the
  theme-editor deep link and the Shopify Inbox warning.
- No checkout or thank-you page targets.

### Test plan

- Unit — app-proxy signature canonicalization, duplicate parameters, timestamp replay
  rejection, shop binding, origin binding, token expiry, resume-secret hashing, CORS.
- ✅ Storefront budget exhaustion degrades the widget and leaves the org cap and other
  channels usable. Covered on the gateway route rather than as a pure unit test,
  because the property worth asserting is a database one.
- Session-first-message races, closed- and idle-thread rollover, idempotent client
  retries, 4,000-character truncation, rate limits, spam filtering, uninstall
  revocation. Race coverage must assert against real `threads_one_open_per_customer`
  behaviour — two concurrent first messages on one session resolve to a single open
  thread, and rollover does not collide with a late merchant reply or a thread the
  merchant reopened.
- **Eval gate — owed, and now the blocker.** The gate is **red**: 13 fixtures failing
  or flaky since 2026-08-08, seven at 0/3, split between over- and under-escalation,
  all pre-existing rather than storefront damage. The stale 2026-07-30 baseline is
  deliberately kept because red is the accurate reading. **Fix the thirteen, add the
  `shopify_chat` guest fixture, then capture** (`npm run test:evals:baseline -w
  apps/dashboard`). The deferral argument and the full archaeology are in the record.
  Still true when it runs: fixtures carry no `classifierSignals`, so the gate has
  never exercised production's `computeClassifierRouting` path, and eval runs are
  expensive enough to need justifying — single-fixture probes for diagnosis, no
  tune-then-rerun loop.
- **Guest fixtures do not exist yet.** Adding a `shopify_chat` fixture is the only way
  the gate will ever cover guest behaviour; `fixture-validator.ts` would have rejected
  one on sight until 2026-08-12, and no longer does.
- Guest static-policy enforcement against order searches, customer reads, refunds,
  cancellations, edits, credits, discounts, and prompt-injection attempts — including
  a shopper who supplies a real order number and email and claims to be the owner.
- Dispatch persistence and storefront publication for merchant replies, approvals,
  auto-execution, provider failures, and Redis/SSE outages.
- Integration — guest message → queue → ticket → guarded draft → merchant reply → SSE
  → widget; guest informational message → trusted live reply; guest order request →
  blocked tools and honest handoff; reload/reconnect → same-browser identity with
  episode-aware history; closed or hard-idle ticket → next message opens a new
  episode, prior history stays collapsed, and only the new episode is sent to the
  planner.
- Dev-store browser matrix: Online Store 2.0 and a vintage-compatible theme, desktop
  and mobile viewport, app embed disabled and enabled, Inbox bubble present and
  removed.
- Production canary verifying bootstrap, message persistence, dashboard visibility,
  reply delivery, SSE invalidation, and session revocation with no Shopify mutations.

### Rollout

- Ship database and channel support first, then dark gateway/dashboard routes, then
  the disabled theme extension. **This ordering was not followed** — database and
  channel support shipped first as intended, but the routes went out live rather than
  dark (there was no flag to darken them with) and the theme extension deployed
  enabled. Treat it as the plan for landing the remaining flags, not as a description
  of what happened.
- Gate globally with `STOREFRONT_CHAT_ENABLED=false` and per integration with
  `storefrontChat.enabled=false`. ✅ Both built and defaulting off; both deliberately
  on for the dev store.
- Enable on the controlled dev store, then one merchant workspace in approval mode,
  before any live-autonomy store. ✅ Dev store done. ✅ Merchant toggle done.
  **Next:** one real merchant workspace — toggle on, theme embed activated, Inbox
  bubble off — with the full loop verified and no ops touching metadata. Held behind
  the notification-shape work below.
- Add `shopify_chat` to ticket filters, channel labels, analytics unions, operational
  alerts, provider-send metrics, integration health, and production audit scripts.
- Monitor inbound volume, rate-limit and spam rejection, first-response latency, SSE
  reconnects, dispatch failures, auto-execution outcomes, storefront budget
  exhaustion, and LLM spend per session.
- Roll back by disabling the global flag and the theme embed; retain sessions and
  messages for audit.

### Done when

A shopper on the dev store can ask a question, the merchant sees a ticket with a
plan, approving it delivers the reply into the widget, and a shopper attempting order
disclosure through any phrasing gets an honest handoff — with the storefront budget
provably isolated from the org cap.

**Five of five, struck 2026-08-08.** All five were exercised live on the dev store,
including the strong form of the disclosure test (a real unfulfilled order, a
supplied email, an ownership claim, and a request for both tracking and the shipping
address — all three refused, nothing disclosed, nothing invented). Transcript and
caveats in the record.

The handoff half regressed the same day and was fixed; everything else outstanding on
M1 sits outside this bar and is under "Not built".

Worth keeping rather than tidying away: the bar was met, then a change intended to
*improve* the same behaviour broke it, caught by sending one more message rather than
by any test. Three separate things looked correct in code and behaved differently in
production on this feature in a single day — an unapplied migration, a six-hour-stale
gateway build, and a router silently deleting a tool call.

---

## M1.5 — emailed-code order verification

**The milestone that makes the channel worth having.** M1 answered the most common
storefront question — "where is my order" — by sending the shopper somewhere else.
That is a redirect with extra steps, and not a channel a merchant would choose to
install.

### Why M2 is the wrong instrument

M1 conflated *we don't know who this is* with *we can't answer*, so deflection was
the only move left. Deferring the fix to Customer Account OAuth is the heaviest
possible way to buy it: two new scopes, so **every already-connected merchant is
forced to re-authorize** — the exact cost M1 was designed to avoid — and the Customer
Account API requires the shop to be on **new customer accounts**, so merchants on
classic accounts could never use the verified path at all.

### The reframe

The shopper does hold a credential: the email on the order. M1 is right to refuse it
as an *assertion* — anyone can type an address. Use it as a **challenge target**
instead of a claim, and it flips from something they say (worthless) into something
they must prove control of (strong).

**This needs no new Shopify scopes.** The app already holds `read_orders` and
`read_customers`.

**The invariant, in one line: disclosure only ever flows to the address already on
the order.** Someone who types a stranger's order number with their own email learns
nothing — not even whether the order exists, and no mail is sent to anyone.

### Flow

1. Shopper asks about an order; the agent asks for the email on it.
2. The server looks the order up and compares the supplied email to the order's.
3. **The reply is identical either way** — "if that's the email on the order, I've
   sent a 6-digit code to it." Never confirm that the order exists or that the email
   matched; that answer is itself a disclosure.
4. On a match, the code goes to the address **on the order**. On a mismatch or a
   nonexistent order, `verification.ts:135` returns before a code is generated and
   **nothing is mailed at all** — so the widget cannot deliver even one unsolicited
   email to an owner.
5. A correct code upgrades the session to `authState: "verified"`, scoped to that one
   order.
6. Tracking, status and delivery date are answered inline, in the widget.

### Constraints

- 6 digits, 10-minute expiry, single use, 5 attempts before the (session, order) pair
  locks. A locked pair reports *locked* rather than *expired*, so a fresh code is not
  the obvious way out of the ceiling — and a re-request does not reset it.
- A **separate and tighter counter for verification sends** than the message budget.
  Without it the widget becomes a way to mail-bomb a customer. **It charges every
  request, not every send** — charging only the matches would let order-number probing
  run free against a counter that never moves.
- Scope verification to the **order**, not the customer account.
- **Reads only.** Cancel, edit, refund, address change stay out of guest and verified
  alike and continue to escalate. Verification unlocks *seeing your own order*; it
  never unlocks mutating one. Whether a verified shopper should be able to *initiate*
  a mutation that then goes to merchant approval is deliberately left open — start
  read-only and let real traffic answer it.
- Familiar to shoppers: Shopify's own new customer accounts log in by emailed code.

### A tier below verification — `get_order_fulfillment_status`, built 2026-08-09

Not every order question needs identity. "Has it shipped" does not, so it no longer
waits on a code. The tool takes an order number and/or the checkout email and returns
the shipping state plus two dates, built from an explicit allowlist of non-identifying
fields rather than `serializeOrder`. No name, address, contact details, items or
amounts, and no tracking number, because carrier sites resolve those to a delivery
address. An order number and email that do not match return the same response as an
order that does not exist.

Kept out of every non-guest tool list, with a test — which also meant the support
planner's tool set was unchanged, so this added a tool without owing an eval-gate run.

**Accepted disclosure, stated so it can be revisited:** anyone supplying a valid order
number learns that order's shipping state, which makes order numbers enumerable for
shipping status. Bounded to shipping state and nothing else. Requiring the email
alongside the number is a one-line change if that trade stops being worth it.

### Posture: verification is not an agent capability

**The host runs the challenge deterministically on its own route; the agent only ever
observes a session that already is or is not verified.** Nothing about the ritual
enters the plan/approve loop, so nothing about it waits on the merchant — and the
planner's no-side-effects contract is untouched on every channel.

What this does **not** buy: the *answer* using the newly-unlocked order reads is still
a `send_reply`, so under `guarded`/`off` it still parks for merchant approval like
every other storefront reply. Verification is instant; the answer is not, unless the
org auto-executes. That is the honest ceiling of any option that keeps approval mode —
and it is what makes the notification-shape work below load-bearing.

The two alternatives (plan-time tools, or auto-executing the whole channel) and why
both were rejected are in the record.

### Built and verified

- **`POST /api/storefront-chat/proxy/verify`** with `action: "request" | "code"`,
  behind the same app-proxy signature, session bearer token and both kill switches as
  the message routes — extracted to `lib/storefront-chat/authorize.ts` so the two paths
  cannot drift on what they check.
- **`lib/storefront-chat/verification.ts`.** `requestVerification` claims the send
  budget *before* any lookup and conditionally, resolves both Shopify and the email
  integration ahead of the order lookup so a misconfigured store fails identically for
  every order number, compares the supplied address, and on a match mails the code to
  the address on the order. It returns `sent` whether or not the order exists, whether
  or not the email matched, and whether or not anything was mailed. A Shopify lookup
  error also returns `sent` — surfacing it would make Shopify's availability observable
  per order number.
- **`authState: "verified"` plus `verifiedOrders`,** set in `buildContext` from rows
  this process did not write. Verified unlocks `get_order_by_name` and
  `get_order_tracking` **scoped to the verified order** — enforced in static policy on
  parsed arguments, so verifying `#1025` cannot read `#1026`. No customer-wide read,
  and no mutation at any autonomy tier.
- **The widget's "Check an order" card** — order number + email, then code entry, then
  a verified note. Widget-local messages only; nothing here becomes a `Message` row, so
  no pending plan is invalidated. A bare 6-digit code typed into the composer is
  intercepted and answered inline rather than reaching the agent; that interception is
  the single piece of text inspection in the design, and it decides nothing except
  which handler runs.
- **Tests: 35 new** — 13 on the verify route against a real database, 12 on the
  verified tool policy, 6 on `buildContext` promotion, 4 on the bare-code detector.
  Existing suites unchanged: 747 agent unit, 27 agent integration, 1317 dashboard.
- **Verified live 2026-08-12** on the dev store: end-to-end verification of `#1024`,
  order-scoping proven in both directions, and the disclosure invariant tested with the
  strong form — a mismatched request returned byte-identical copy, wrote no row and
  mailed nothing. Details in the record.

### Outstanding

- **A dead email integration fails completely silently.** The org's default sender was
  a Gmail connection whose token Google rejects: the shopper was told a code was sent,
  nothing was mailed, and one Vercel log line was the only evidence. Resolution happens
  before the order lookup so a *missing* integration fails identically for every order
  number, but credentials are only exercised at send time, after the response is
  already decided.
- **The notification shape its first live card exposed** — below.

---

## The card was the wrong artifact

**Decision 2026-08-12. Read this before adding anything merchant-facing to this
plan.**

A verified shopper asked where their order was. The agent looked it up. The answer was
"not shipped yet." The merchant received nine lines on their phone ending in **"Good
to send?"**

There is no decision in that card. Nothing risky, nothing irreversible, nothing
requiring judgment — and the planner had already routed it `auto_execute`. What the
merchant got was a form to sign for the exact task they installed the app to stop
doing. Twenty a day and they approve blind, which is a worse failure than never
asking, because it launders unreviewed actions through a ritual that looks like review.

**The test to apply before shipping any merchant-facing surface:** read it as a
24-year-old selling artisan products, no e-commerce experience, who bought something
that promised a seamless setup and an employee rather than a bot. If it reads as
paperwork, the fix is upstream of the copy.

**Notification shape is chosen by the decision it contains, not by what the agent
did.**

- **Routine, safe, identity established → act, then report in one line.** No draft, no
  thread link by default, no question. "Someone asked where #1024 was. Not shipped yet
  — I told them, and confirmed the delivery address. ✅"
- **Genuine uncertainty → ask one question about the uncertain thing.** Not a
  restatement of the conversation. "A shopper proved they own #1024 but is asking about
  #1026 too. Want me to check it?"
- **Risky or irreversible → the full card.** Refunds, cancellations, address changes.
  `07051933`'s work is right for these and "Good to send?" belongs here, only here. Its
  design record is in the verification file.

Two corollaries:

**Before improving an artifact, ask whether it should exist for that class of event.**
The `Verified:` line added the same day
(`apps/gateway/src/message-handlers/planning-notifications.ts:297`) reads *"Verified:
entered a code emailed to the address on #1024."* — written for the builder. It asks a
merchant to audit an authentication mechanism before letting their own agent answer a
shipping question, and it exists only because the card asks for approval at all. If
verification is trusted enough to unlock the read, it is trusted enough not to be
re-adjudicated by a human.

**Self-narration came back, and it will keep coming back.** The same card had the agent
telling a shopper *"I can only pull up details on #1024 in this chat since that's the
order you verified…"* The guest prompt was collapsed from 13 bullets to 5 specifically
to kill this, and M1.5 reintroduced it by creating a new boundary to narrate. Every
future capability with an edge will try to explain that edge out loud. The employee
sentence is "happy to check #1026 too — what's the email on that one?"

**What this changes in the remaining work.** The rollout step that puts a merchant
workspace in approval mode stands as a *rollout* posture; it is not the shipped
product. A verified shopper asking a read-only question about their own order is the
canonical auto-execute case — identity proved, no mutation reachable at any tier — and
shipping it behind "Good to send?" contradicts the user-pulled-autonomy position the
product rests on. Sequencing that, and the same pass over the morning briefing, is owed
before this channel goes to a real merchant.

---

## M2 — verified sessions (deferred, and largely superseded)

M1.5 subsumes most of what this milestone was for, at a fraction of the cost and
without forcing a re-authorization on anyone. Keep M2 only for genuine account binding
— order history across orders, saved addresses — and only if a merchant actually asks
for it.

Sketch only. Do not build against this section without specifying it properly.

Customer Account OAuth provides a high-assurance channel identity that can link the
storefront visitor to a canonical person; it does not turn the session into a
conversation or authorize replaying every prior transcript. It restores the normal
autonomy and tool policy for that shopper only at the assurance scope the login
establishes. It needs: a `StorefrontChatAuthAttempt` table for single-use state and
PKCE verifier; the `customer_read_customers` and `customer_read_orders` scopes;
encrypted access/refresh token storage via the existing token-encryption utilities;
refresh and revalidation on later bootstraps with identity cleared on refresh failure;
session revocation on token refresh failure; and a persistent sign-in control in the
widget.

Two things must be settled before it is scheduled:

- **Adding those scopes forces re-authorization for every already-connected
  merchant.** That is a migration with merchant-facing consequences and needs its own
  plan.
- **Customer Account API requires the shop to be on new customer accounts.** Merchants
  still on classic accounts cannot use the verified path at all and stay guest-only.
  Confirm the eligibility rule and decide whether a permanently two-tier experience is
  acceptable before committing.

## Deferred beyond M2

Checkout and thank-you chat extensions, attachments, offline verified email, Storefront
MCP commerce cards, rich commerce UI, cross-device history, App Store listing, and
public distribution.

## Known costs and open gaps

- **No cross-channel customer identity yet.** A shopper who chats on the storefront and
  later emails appears as two customers with two threads, and agent memory will not join
  them. This is no longer an accepted context model; the verified identity graph,
  merge/unmerge audit, and relevance-gated memory work are specified in
  [conversation-context-and-cross-channel-memory-plan.md](conversation-context-and-cross-channel-memory-plan.md).
  Until that work ships, channels remain separate rather than being joined by a weak
  name or address guess.
- **The merchant must disable Shopify Inbox** to avoid duplicate launchers. There is no
  coexistence story.
- **A valid order number reveals that order's shipping state.** The residual cost of
  `get_order_fulfillment_status`, recorded with the tier that created it.

## When to pick this up

**What holds a second store is the merchant's experience, not the shopper's.** The
shopper side works and the security properties held under the strong form of the
disclosure test. Every storefront message — including "where is my order", answered from
a verified session with a read-only tool — arrives as an approval card ending in "Good
to send?". Putting that in front of a real merchant teaches them that their agent needs
supervision to state a fulfillment status, which is the opposite of what this product is
selling.

Operability is still owed underneath it: nothing tells a merchant their storefront hit
its ceiling, expired sessions are not swept, a dead email integration fails silently, and
the merchant toggle has never been exercised on a workspace outside the dev store.

The original merchant condition — no store that is not a controlled test store until the
guest policy, the storefront budget, and the kill switches exist — is **met**. All three
exist and the feature is enabled on exactly the controlled test store that condition
permits.

**Do not answer "not yet" with "do WhatsApp instead"** (decision 2026-08-07). WhatsApp is
a merchant-control channel, not a customer-origin one — see
[product-truth.md](product-truth.md) §2 and its guardrails — so it is not an alternative
to this plan on any axis. Shipping it would add a third way for the merchant to talk to
the agent next to Telegram and iMessage, which is not the gap this plan fills. It is also
a weak wedge in the US market Shopkeeper targets. If storefront chat is not ready, the
alternative is more depth on the channels customers already arrive through — not another
operator channel.
