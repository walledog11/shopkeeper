# Shopify Storefront Chat

A text-only "Shopkeeper Chat" theme app extension on the existing Shopify app,
so shoppers can ask a question on the storefront and have it land in the
merchant's existing ticket, planning, approval, and Shopify-action pipelines.

**Not scheduled.** Written down so the shape is decided, not because it is next.
It adds a public, unauthenticated surface plus a one-way Shopify
app-configuration migration, which is why it carries its own milestones. See
"When to pick this up" below.

This is the only new **customer-origin** channel on the table. Nothing else
proposed adds a way for a customer to reach the merchant.

Last reviewed: 2026-08-07.

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

- **M0a** — Shopify app-configuration migration. No features, no new scopes.
- **M0b** — App proxy and `write_app_proxy`. The scope change, isolated.
- **M1** — Guest-only storefront chat. The shippable milestone.
- **M2** — Verified sessions. Deferred; sketched, not specified.

M0 was split in two on 2026-08-07, once it was confirmed that declaring an app
proxy requires the `write_app_proxy` access scope. The original M0 promised both
a CLI migration *and* an unchanged scope set, and those turned out to be
incompatible. Separating them keeps the one-way, every-merchant-affecting
migration free of any scope change, so that if a re-authorization prompt appears
it belongs to exactly one milestone and one cause.

## Prerequisites

Not part of this plan, and settled before M1 starts.

- **The realtime subsystem proven in production.** ✅ **Cleared 2026-08-07.**
  Decision closed 2026-08-06 was finish and enable, not delete; both env gates
  are now set and the canary passed — `realtime:smoke` green against prod
  (delivery and cross-org non-delivery), `[Realtime] Subscribed` in the gateway
  logs, and a signed-in browser confirmed revalidating off a real push against a
  silent control window. Evidence under "Prove in prod" in
  [to-do-list.md](to-do-list.md). This plan did not inherit it silently: there it
  was optional polish over a 15s poll, here it is shopper-facing and
  latency-critical, which is why M1 waited on it.

  **This is a gate on the infrastructure, not a component M1 reuses.** The
  existing SSE is org-scoped in every dimension: `sse.ts` keys its connection
  map on `orgId`, `token.ts` verifies an `{orgId, exp}` payload signed with
  `INTERNAL_API_SECRET`, `publish.ts` uses a single global `REALTIME_CHANNEL`,
  and the CORS header admits exactly one origin (the dashboard). M1 needs
  session-scoped fan-out, a different signing secret, a storefront channel, and
  multi-origin CORS — see the transport bullets below. What the canary buys is
  proof that gateway Redis pub/sub and long-lived SSE survive Railway under
  real traffic. Budget M1 for a second SSE implementation, not for plumbing.


## M0a — Shopify app configuration migration

No features, and **no scope change**. If this milestone raises a
re-authorization prompt on any store, something went wrong.

### Why this is separate

There is no `shopify.app.toml` and no `extensions/` directory in this repo. The
app runs on **managed installation configured in the Dev Dashboard** — see the
comment at `apps/dashboard/src/app/api/integrations/shopify/auth/route.ts:49`,
which records that the Partner Dashboard configuration, not the `scope`
parameter, decides what a merchant actually grants.

A theme app extension requires the Shopify CLI and `shopify app deploy`, which
makes the TOML authoritative for scopes, webhook subscriptions, redirect URLs,
and proxy configuration — against the live install path for every connected
merchant. A mismatched TOML changes what the next install grants. It gets its own
milestone with no feature work riding on it.

**What is actually one-way, corrected 2026-08-07.** Config *values* are not.
`shopify app deploy` creates an app version — "a snapshot of your app
configuration and all extensions" — and `shopify app release --version <v>`
re-releases an earlier one, with `shopify app versions list` to enumerate them.
`deploy --no-release` stages a version without releasing it at all. So a bad
config deploy is recoverable by re-releasing the prior version.

**Verified on a real app, not just from docs.** A rehearsal on `shopkeeper-dev`
staged the production export as `shopkeeper-dev-4` while `shopkeeper-dev-3`
remained active — the live app was untouched and the staged version was
reviewable in the Dev Dashboard first. Evidence in the reference doc. This means
M0a's production step can be **staged, inspected, and only then released**,
which is a materially safer shape than this plan originally assumed.

**And the management-model switch turns out not to exist** (2026-08-07).
`shopkeeper-production` is *already* a versioned app — eight releases between
2026-06-15 and 2026-08-03, `-8` active. There is no conversion from
Dashboard-configured to CLI-authoritative to perform: the app already lives in
the model the CLI operates on, `deploy` simply creates version 9, and `-8`
remains available to re-release.

So this milestone has no irreversible step at all. What is left is ordinary care
that version 9's *contents* are right — handled by staging with `--no-release`
and reviewing in the Dev Dashboard before releasing.

### Changes

- Export the current Dev Dashboard app configuration verbatim before touching
  anything. Record it in `docs/production/` as the rollback reference. **Started
  2026-08-07** in
  [production/shopify-app-config-reference.md](production/shopify-app-config-reference.md).
  **Done 2026-08-07** — the verbatim export is checked in beside it as
  `shopify-app-config-export-2026-08-07.toml`, pulled via `shopify app config
  link` against `shopkeeper-production`. Scopes matched the code-derived
  prediction exactly, which is what M0a's parity promise rests on. **That export
  *is* the M0a file** — the CLI generated it from the live app, so nothing needs
  authoring and the earlier hand-written draft was deleted as a hazard.
- Rehearse on a dev app before production. **Prefer a dev app that is already
  installed on a dev store over a fresh throwaway** (revised 2026-08-07). A
  throwaway has no installs, so it cannot exercise the requirement that actually
  matters here — that an *existing connected install keeps working* across a
  Dashboard→CLI migration. An already-installed dev app is the only rehearsal
  that covers it.

  The cost is that `deploy` overwrites the target's config: the export would
  rename it to `shopkeeper-production`, repoint `application_url` and the
  redirect URLs, and replace its scopes. Recoverable, but record the starting
  point first rather than trusting that:

  ```
  npx shopify app versions list          # record the current version FIRST
  # link the dev app, deploy, verify the dev-store install
  npx shopify app release --version <recorded>   # restore it
  ```

  Confirm `versions list` actually shows a restorable prior version before
  betting a working dev app on the rollback. If it does not, or if the dev app
  is load-bearing for day-to-day work, use a throwaway and accept that the
  existing-install question goes unrehearsed until production.
- Note that **no dev app tests the byte-exact export**: `client_id` and `name`
  necessarily differ on any target that is not production. The rehearsal
  verifies the deploy flow, what a fresh install grants, and whether an existing
  install survives — not the literal file.
- Link the root `shopify.app.toml` to the production app only after the dev-app
  round-trip passes: deploy, install on a dev store, confirm granted scopes match
  the exported reference exactly. Webhook topics will **not** appear at app level
  — they are registered per-shop on OAuth callback — so verify those by
  connecting the dev store through the app, not by reading app config.
- Preserve managed installation and the existing scope set, byte for byte. M0a
  adds **no** scopes — an unchanged scope set means no re-authorization prompt
  for any already-connected merchant. The 15-scope list is in the reference doc;
  the app proxy and `write_app_proxy` are **not** part of this milestone, which
  is the whole reason it can make this promise.
- Confirm which mandatory compliance webhooks the app already owes
  (`customers/data_request`, `customers/redact`, `shop/redact`) and that the
  TOML declares them identically to the current Dashboard configuration.
  **Resolved 2026-08-07 by the export: the app declares none of the three, and
  registers none of them per-shop either.** The repo has no handlers for them
  and no subscription exists — a real pre-existing gap, but one M0a inherits
  rather than causes, so M0a still migrates at parity. It becomes blocking for
  App Store distribution, which is already in this plan's deferred list. Closing
  it means writing the three handlers first, then declaring the topics — not
  pointing them at `/webhooks/shopify`, whose topic allowlist rejects them into
  silent failure.

  The same export corrected a wrong assumption in this plan's framing: the five
  order/uninstall webhooks are **not** Dashboard-configured. They are registered
  per-shop against the REST Admin API on every OAuth callback
  (`integrations/shopify/callback/route.ts:368-392`), and app config declares no
  subscriptions at all. So the TOML must **not** declare them — doing so would
  double-deliver every order event.

### Done when

Production app is CLI-configured, a fresh install on a dev store grants exactly
the pre-migration scope set, an existing connected merchant's integration keeps
working with no re-auth prompt, and the exported reference config is checked in.

## M0b — App proxy and `write_app_proxy`

The scope change, isolated from the migration and from the widget. Small, but it
is the only milestone in this plan that touches what existing merchants have
granted, which is why it is not folded into either neighbour.

### Why this is separate

Declaring an app proxy requires the `write_app_proxy` access scope — confirmed
2026-08-07 against Shopify's app-proxies documentation, which states it directly.
The app-configuration reference page omits it entirely, and that omission is
what made the original M0 believe it could migrate *and* stay scope-neutral.

Adding the scope raises a re-authorization prompt for active merchants. It does
not break them: stores that never accept it are backfilled server-side by
Shopify and keep working. But a prompt is merchant-visible, and on a product
whose first principle is that trust is binary, it should arrive attached to a
feature the merchant asked for rather than to invisible plumbing.

Kept out of M0a so the migration's "no prompt" claim is falsifiable — if a
prompt appears during M0a, it is a defect, not an expected side effect.

Kept out of M1 as a milestone so the scope change can land and settle on its own
schedule, ahead of the widget. M1's bootstrap route depends on the proxy
existing, so M0b must be live before M1 can be tested end to end — but it does
not have to ship in the same change, and it should not.

### Changes

- Add `write_app_proxy` to `[access_scopes]` in the TOML, on top of the exact
  15-scope set M0a preserved. This is the only scope this plan adds before M2.
- Configure the app proxy: `/apps/shopkeeper-chat` → `/api/storefront-chat/proxy`
  on the dashboard host. Per Shopify's schema all three keys are required —
  `url`, `subpath` (alphanumeric, ≤30 chars, not `admin`/`services`/`password`/
  `login`), and `prefix` (one of `a`, `apps`, `community`, `tools`).
- Land it on the same dev app M0a rehearsed on and confirm the proxy resolves,
  exactly as M0a did for the base configuration.
- Decide and write the merchant-facing explanation for the prompt **before**
  deploying, not after the first merchant sees it. Connected merchants at this
  point are few enough to tell directly.
- Expect the storefront-chat routes to 404 until M1 lands. That is correct — a
  configured proxy pointing at an unbuilt route is inert, and shipping the scope
  early is the entire point of the split.

### Done when

The production app declares the proxy, `write_app_proxy` is granted or backfilled
on every connected store, no merchant's existing integration has degraded, and
the prompt has been explained to whoever saw it.

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
- **Both of those thread-create paths run into `threads_one_open_per_customer`**
  — a partial unique index over (organization, customer, channel) `WHERE status
  = 'open'`, created in migration
  `20260405000000_add_idempotency_and_thread_uniqueness` and **absent from
  `schema.prisma`**. Prisma will not warn, will not generate a typed constraint
  error, and the failure surfaces as a raw Postgres unique violation under
  concurrency. This drift has already broken thread-create work once. Design the
  session lock and the closed-thread rollover against the index as it exists in
  the database, and decide up front whether a losing racer retries onto the
  winner's thread or surfaces a send failure to the widget.
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
  revocation. Race coverage must assert against real
  `threads_one_open_per_customer` behaviour — two concurrent first messages on
  one session resolve to a single open thread, and rollover after close does not
  collide with a thread the merchant reopened.
- **Eval gate.** Adding a `guest` authentication state to agent context and
  filtering tools by it changes the shared support-planner surface: storefront
  threads are planned by the same `generateThreadPlan` path as every other
  ticket, so the standing invariant in `.claude/CLAUDE.md` applies and the gate
  runs before M1 ships. Either run it, or state in the PR why guest state is
  provably unreachable from the planner. Two things to know before leaning on
  it: the fixtures carry no `classifierSignals`, so the gate has never exercised
  production's `computeClassifierRouting` path, and eval runs are expensive
  enough to need justifying — use single-fixture probes for diagnosis, not a
  tune-then-rerun loop.
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
  then the disabled theme extension. M0a has already settled app configuration
  and M0b the proxy, so no step here touches app config or scopes.
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

After a merchant is live and proving the existing support loop. The realtime
prerequisite is no longer outstanding — it was canaried clean 2026-08-07 — so
the merchant condition is the only one left.

**Do not answer "not yet" with "do WhatsApp instead"** (decision 2026-08-07).
WhatsApp is a merchant-control channel, not a customer-origin one — see
[product-truth.md](product-truth.md) §2 and its guardrails — so it is not an
alternative to this plan on any axis. Shipping it would add a third way for the
merchant to talk to the agent next to Telegram and iMessage, which is not the
gap this plan fills. It is also a weak wedge in the US market Shopkeeper
targets, where WhatsApp penetration is low. If storefront chat is not ready,
the alternative is more depth on the channels customers already arrive
through — not another operator channel.
