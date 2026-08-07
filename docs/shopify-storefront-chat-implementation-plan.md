# Shopify Storefront Chat

A text-only "Shopkeeper Chat" theme app extension on the existing Shopify app,
so shoppers can ask a question on the storefront and have it land in the
merchant's existing ticket, planning, approval, and Shopify-action pipelines.

**Not scheduled.** Written down so the shape is decided, not because it is next.
The next customer-support adapter is WhatsApp (reuses the existing Meta app and
inbound pipeline); this one adds a public, unauthenticated surface plus a
Shopify app-configuration migration. See "When to pick this up" below.

Last reviewed: 2026-08-06.

## Scope decision

The original draft shipped guest chat and Customer Account OAuth together. It
is split, and only the guest half is specified in full.

Dropping OAuth from the first shippable milestone removes the authentication
attempt table, PKCE, encrypted customer-token storage and refresh, customer
binding, two of the three new scopes, and the entire verified-session test
matrix — while still delivering the whole product loop: shopper asks a question
→ ticket → agent plan → merchant approves → reply appears in the widget.

It also removes the risk. Guest mode is the *safe* tool policy; verified order
lookup is where both the disclosure risk and the token-custody cost live. And
because guest mode needs no `customer_read_*` scopes, M1 can ship without
forcing every already-connected merchant to re-authorize.

- **M0** — Shopify app-configuration migration. No features.
- **M1** — Guest-only storefront chat. The shippable milestone.
- **M2** — Verified sessions. Deferred; sketched, not specified.

## Prerequisites

Not part of this plan, and settled before M1 starts.

- **The realtime subsystem enabled in production.** M1 depends on gateway Redis
  pub/sub and SSE (`apps/gateway/src/realtime/{publish,sse,token}.ts`,
  `apps/dashboard/src/lib/realtime/*`). Decision closed 2026-08-06: finish and
  enable, not delete — the code is wired end to end and the publish half already
  runs unflagged in production. Remaining work is env and a prod canary, tracked
  in [to-do-list.md](to-do-list.md). This plan does not inherit it silently:
  there it is optional polish over a 15s poll, here it is shopper-facing and
  latency-critical, so M1 starts only once the canary is clean.


## M0 — Shopify app configuration migration

### Why this is separate

There is no `shopify.app.toml` and no `extensions/` directory in this repo. The
app runs on **managed installation configured in the Dev Dashboard** — see the
comment at `apps/dashboard/src/app/api/integrations/shopify/auth/route.ts:49`,
which records that the Partner Dashboard configuration, not the `scope`
parameter, decides what a merchant actually grants.

A theme app extension requires the Shopify CLI and `shopify app deploy`, which
makes the TOML authoritative for scopes, webhook subscriptions, redirect URLs,
and proxy configuration — against the live install path for every connected
merchant. A mismatched TOML changes what the next install grants. This is a
one-way migration and it gets its own milestone with no feature work riding on
it.

### Changes

- Export the current Dev Dashboard app configuration verbatim before touching
  anything. Record it in `docs/production/` as the rollback reference.
- Create a **throwaway dev app** and land the TOML there first. Never
  `config link` the production app against an unverified file.
- Link the root `shopify.app.toml` to the production app only after the dev-app
  TOML round-trips: deploy, install on a dev store, confirm granted scopes and
  webhook topics match the exported reference exactly.
- Preserve managed installation and the existing scope set. M0 adds **no**
  scopes — an unchanged scope set means no re-authorization prompt for any
  already-connected merchant.
- Configure the app proxy: `/apps/shopkeeper-chat` → `/api/storefront-chat/proxy`
  on the dashboard host. Verify whether app-proxy declaration in the TOML needs
  an access scope at all before writing `write_app_proxy` anywhere — an invalid
  scope string fails the install outright, and proxies are normally declared in
  app config rather than granted.
- Confirm which mandatory compliance webhooks the app already owes
  (`customers/data_request`, `customers/redact`, `shop/redact`) and that the
  TOML declares them identically to the current Dashboard configuration.

### Done when

Production app is CLI-configured, a fresh install on a dev store grants exactly
the pre-migration scope set, an existing connected merchant's integration keeps
working with no re-auth prompt, and the exported reference config is checked in.

## M1 — Guest-only storefront chat

Shoppers can start immediately and anonymously. Shopkeeper answers from the
knowledge base and public product information, escalates, and asks the merchant.
It discloses nothing customer-specific and mutates nothing, ever, on any input.

### Data model

- Add `shopify_chat` to `ChannelType`. Leave the existing `shopify` channel and
  its email-fallback behavior unchanged.
- Add `StorefrontChatSession`: organization, Shopify integration, anonymous
  customer, active thread, storefront host, hashed resume secret, last-seen,
  expiry, revoked-at. **No token columns and no verified-customer column** —
  those arrive with M2.
- Anonymous customers use `platformId = shopify_chat:<session-id>`.
- Store only the hash of a 32-byte browser resume secret; never the secret.
- Revoke sessions on app uninstall, Shopify disconnect, merchant chat
  disablement, workspace deletion, and customer deletion.
- Retain chat messages under existing retention and deletion rules; extend the
  existing export and deletion paths to cover sessions.

Adding the enum member is a code milestone, not a rollout checkbox:
`channelType` has ~264 references across ~90 non-test files, and
`CHANNEL_INFO` in `apps/dashboard/src/lib/messaging/channels.ts` is an
exhaustive `Record<ChannelType, ChannelInfo>` that will not compile until every
such map is updated. Budget for `DASHBOARD_CHANNEL_TYPES`, `OPERATOR_CHANNEL_ORDER`
(`lib/integrations/catalog.ts`), the gateway `CHANNEL` constants
(`apps/gateway/src/constants.ts`), ticket filters, and analytics unions.

### Public interfaces and message flow

- **Bootstrap** — `POST /api/storefront-chat/proxy/bootstrap`. Verify Shopify's
  canonical app-proxy signature, timestamp freshness, shop domain, installed
  integration, enabled state, and forwarded storefront host. Accept optional
  `{sessionId, resumeToken, locale, pageUrl}`. Resume a valid session or create
  one **without** creating an empty ticket. Return session ID, the resume secret
  when newly created, short-lived API/SSE tokens, public widget settings, and
  initial message history.
- Mint storefront access and SSE tokens with a dedicated
  `STOREFRONT_CHAT_SIGNING_SECRET`, never `INTERNAL_API_SECRET`. Bind every
  token to one session, organization, Shopify integration, and storefront host,
  and enforce tenant ownership on every read and write.
- **Transport** — `POST /storefront-chat/messages` (bearer session token,
  returns `202`), `GET /storefront-chat/messages?cursor=...` (customer-visible
  messages only; internal notes and action logs never leave Shopkeeper),
  `GET /storefront-chat/events?token=...` for conversation-scoped SSE
  invalidations. Limit text to 4,000 normalized characters; dedupe on
  `shopify_chat:<session-id>:<clientMessageId>`.
- Put shopper traffic on the **gateway**, not the dashboard, apart from the
  app-proxy bootstrap that Shopify itself must sign. The gateway already holds
  long-lived connections; Vercel functions must not, and the existing
  dashboard rate limiter is Upstash-REST-backed, so every send would add a
  round trip. Note also that `rate-limit.ts` fails closed outside development.
- Adding `/api/storefront-chat/*` to `publicRoutePatterns` in
  `apps/dashboard/src/proxy/path-access-policy.ts` makes it the first
  **shopper-traffic** public route; that list is otherwise webhooks and OAuth
  callbacks. Keep the added surface to bootstrap alone.
- Add a storefront-chat queue job and persistence handler: lock the session
  while creating its first customer/thread or rolling a closed thread into a new
  ticket; create `shopify_chat` threads linked to the existing Shopify
  integration; reuse the existing summary, classification, planning,
  notification, and escalation processing.
- Extend outbound dispatch so manual, approved, and autonomously executed
  `send_reply` operations persist normally and publish to the matching
  storefront session. This is a small change: `lib/messaging/dispatch-message.ts`
  is 81 lines and `sendReply` guards on a three-channel allowlist at
  `lib/agent/tools/thread.ts:105`. Provider failure must not create a
  successful outbound message.
- Publish identifiers only on a storefront-specific Redis channel; the browser
  refetches history after an invalidation. Fall back to 15-second polling when
  SSE is unavailable, with optimistic states and same-client-message-ID retry.

### Guest tool policy

- Add `guest` authentication state to agent context. M1 has no other state.
- Allow knowledge base, policy, and non-customer-specific product information.
  Allow `send_reply`, escalation, and merchant questions.
- Block every order read, every customer read, and every mutative Shopify action
  in **static tool policy**, not in the prompt.
- Never treat an order number, email address, Liquid customer value, or
  browser-supplied Shopify ID as authentication. In M1 there is nothing they
  could unlock, which is the point.
- Existing autonomy tiers, refund limits, business hours, execution ledger, and
  approval hashes remain authoritative for the reply path.
- Show an immediate local acknowledgement in approval mode but do **not**
  persist it as a `Message` — a persisted agent reply invalidates the pending
  customer plan that the approve→execute path requires.
- When a shopper asks for order help, say plainly that Shopkeeper cannot look up
  orders here yet and hand off (escalate or point to email). Do not ship a
  sign-in affordance that leads nowhere.

### Abuse and spend containment

This is the first surface where an anonymous stranger can trigger LLM spend with
no account, and it needs its own budget. `packages/db/spend-store.ts` keys spend
on `(organization, day, model)` only — with no isolation, a scraped or
bot-spammed storefront burns the org's entire daily cap and takes the merchant's
email and Instagram agent down with it.

- Add a per-session and per-shop-per-day storefront budget, enforced separately
  from and beneath the org daily cap. Exhausting the storefront budget must
  degrade the widget, never the merchant's other channels.
- Gate before the model, not after: per-session and per-IP rate limits, and a
  cheap non-LLM check on the first message of a session.
- Alert the merchant on sustained budget exhaustion rather than failing silently.

### Widget

- Render inside a Shadow DOM with keyboard navigation, focus trapping,
  screen-reader labels, reduced-motion support, and a responsive mobile layout.
- Theme settings for button color, left/right position, greeting, and launcher
  label. Message UI stays text-only.
- Persist session ID and resume secret in shop-scoped `localStorage`; assume no
  app-proxy cookies.
- Show current and previous customer-visible messages for that browser session,
  including across closed-ticket rollover.
- Show reconnect, send-failed/retry, disabled, and rate-limited states.
- Exclude attachments, typing and read receipts, product cards, cart operations,
  email notifications, sign-in, and cross-device recovery.

### Merchant setup

- Add a `body`-targeted theme app embed containing the isolated chat
  bubble/dialog.
- Add "Enable storefront chat" to the existing Shopify integration card: a
  per-integration enabled flag, a deep link to the theme editor's app-embed
  activation screen, an explanation that Shopify Inbox's storefront bubble must
  be disabled to avoid duplicate launchers, a global server kill switch, and a
  merchant-level disable action.
- No checkout or thank-you page targets.

### Test plan

- Unit — app-proxy signature canonicalization, duplicate parameters, timestamp
  replay rejection, shop binding, origin binding, token expiry, resume-secret
  hashing, CORS.
- Unit — storefront budget exhaustion degrades the widget and leaves the org cap
  and other channels usable.
- Session-first-message races, closed-thread rollover, idempotent client
  retries, 4,000-character truncation, rate limits, spam filtering, uninstall
  revocation.
- Guest static-policy enforcement against order searches, customer reads,
  refunds, cancellations, edits, credits, discounts, and prompt-injection
  attempts — including a shopper who supplies a real order number and email and
  claims to be the owner.
- Dispatch persistence and storefront publication for merchant replies,
  approvals, auto-execution, provider failures, and Redis/SSE outages.
- Integration — guest message → queue → ticket → guarded draft → merchant reply
  → SSE → widget; guest informational message → trusted live reply; guest order
  request → blocked tools and honest handoff; reload/reconnect → same-browser
  history; closed ticket → next message opens a new ticket with coherent widget
  history.
- Dev-store browser matrix: Online Store 2.0 and a vintage-compatible theme,
  desktop and mobile viewport, app embed disabled and enabled, Inbox bubble
  present and removed.
- Production canary verifying bootstrap, message persistence, dashboard
  visibility, reply delivery, SSE invalidation, and session revocation with no
  Shopify mutations.

### Rollout

- Ship database and channel support first, then dark gateway/dashboard routes,
  then the disabled theme extension. M0 has already settled app configuration.
- Gate globally with `STOREFRONT_CHAT_ENABLED=false` and per integration with
  `storefrontChat.enabled=false`.
- Enable on the controlled dev store, then one merchant workspace in approval
  mode, before any live-autonomy store.
- Add `shopify_chat` to ticket filters, channel labels, analytics unions,
  operational alerts, provider-send metrics, integration health, and production
  audit scripts.
- Monitor inbound volume, rate-limit and spam rejection, first-response latency,
  SSE reconnects, dispatch failures, auto-execution outcomes, storefront budget
  exhaustion, and LLM spend per session.
- Roll back by disabling the global flag and the theme embed; retain sessions
  and messages for audit.

### Done when

A shopper on the dev store can ask a question, the merchant sees a ticket with a
plan, approving it delivers the reply into the widget, and a shopper attempting
order disclosure through any phrasing gets an honest handoff — with the
storefront budget provably isolated from the org cap.

## M2 — Verified sessions (deferred)

Sketch only. Do not build against this section without specifying it properly.

Customer Account OAuth binds a real Shopify customer to a session and restores
the normal autonomy and tool policy for that shopper. It needs: a
`StorefrontChatAuthAttempt` table for single-use state and PKCE verifier; the
`customer_read_customers` and `customer_read_orders` scopes; encrypted
access/refresh token storage via the existing token-encryption utilities;
refresh and revalidation on later bootstraps with identity cleared on refresh
failure; session revocation on token refresh failure; and a persistent sign-in
control in the widget.

Two things must be settled before it is scheduled:

- **Adding those scopes forces re-authorization for every already-connected
  merchant.** That is a migration with merchant-facing consequences and needs
  its own plan.
- **Customer Account API requires the shop to be on new customer accounts.**
  Merchants still on classic accounts cannot use the verified path at all and
  stay guest-only. Confirm the eligibility rule and decide whether a
  permanently two-tier experience is acceptable before committing.

## Deferred beyond M2

Checkout and thank-you chat extensions, attachments, offline verified email,
Storefront MCP commerce cards, rich commerce UI, cross-device history, App Store
listing, and public distribution.

## Known costs accepted

- **No cross-channel customer identity.** A shopper who chats on the storefront
  and later emails appears as two customers with two threads, and agent memory
  will not join them. This is a real regression against the "real memory"
  product principle, accepted for MVP. Merging is its own piece of work.
- **The merchant must disable Shopify Inbox** to avoid duplicate launchers.
  There is no coexistence story.
- **Guest chat cannot answer the most common storefront question** — "where is
  my order" — until M2. Onboarding copy must set that expectation, and the
  handoff quality carries the milestone.

## When to pick this up

After a merchant is live and proving the existing support loop, and after the
realtime canary in [to-do-list.md](to-do-list.md) is clean. Until both hold,
WhatsApp is the better next channel: more inbound coverage for less new surface,
reusing the Meta app and inbound pipeline already in place.
