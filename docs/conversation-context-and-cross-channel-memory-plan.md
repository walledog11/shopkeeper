# Conversation Episodes for Storefront Chat

**Status:** P0, P1, and items A and C shipped. B, D, E, and F remain.
**Decision date:** 2026-08-12. **Revised:** 2026-08-14 — cut to what shipping and
testing the storefront chat widget actually requires; identity, obligations, and
prior-episode retrieval are deferred with reasons below.
**Delete this file when the five items are done and the migration rule has moved
into the runbook.**

## Objective

A storefront visitor returns after days, sends a new message, and the agent uses
the old conversation to generate a confusing merchant action plan.

That is the whole bug. Everything below either closes it or is a correctness
problem P1 introduced while closing half of it.

## Product rules

1. **One `Thread` is one conversation episode.** Raw messages from different
   episodes are never combined in an agent turn.
2. **Episode boundaries are deterministic.** Status, provider conversation
   identity, and elapsed conversational inactivity decide rollover. An LLM does
   not decide whether an old transcript should remain current.
3. **The latest request is separate from the episode summary.** Planning and
   merchant notifications use the newest unanswered customer burst, not the
   whole-thread `aiSummary`.
4. **Merchant output describes what changed.** A new request summary is a delta;
   an episode summary is background. The UI never labels one as the other.
5. **Elevated tool access is scoped to the proof that granted it.** An episode
   boundary must not silently grant or silently revoke it.

## Boundaries

Fixed, code-owned defaults — implemented as `CHANNEL_EPISODE_POLICY` in
`apps/gateway/src/message-handlers/resolve-inbound-episode.ts`. Do not add
merchant settings until observed traffic shows a real need.

| Channel | New episode when |
| --- | --- |
| Storefront chat | Thread is closed or at least 24 hours conversationally idle |
| Instagram DM | Closed or at least 24 hours idle |
| TikTok Shop | Provider conversation changes, thread closes, or 24 hours idle |
| Email | Thread closes or at least 7 days idle |
| Shopify order notes | Never — a synthetic note is not a customer conversation |

Channels absent from that map never roll, and that is a decision: operator
channels (`sms_agent`, `dashboard_agent`, `imessage`) are one durable thread per
binding and a boundary would fragment the merchant's own conversation, `shopify`
is merchant-side traffic, and `sms` is retired.

Use the latest non-note `Message.sentAt`/`Thread.lastMessageAt` for inactivity.
`StorefrontChatSession.lastSeenAt` is browser activity — written on every widget
open — and must never decide conversational continuity. The first new inbound
message performs the rollover; merely opening the widget must not create a thread
or mutate the inbox.

## Migration rule — read before writing any migration

Production carries **six partial unique indexes that `schema.prisma` cannot
declare**, created by raw SQL across six migrations:
`threads_one_open_per_customer`, `messages_org_external_id_unique`,
`integrations_instagram_organization_unique`,
`integrations_instagram_account_unique`, `integrations_shopify_account_unique`,
`integrations_non_email_account_unique`.

Prisma has no `where` clause on `@@unique` or `@@index` (verified against the
pinned 6.19.3), so `prisma migrate dev` builds its shadow database from the
migration history, diffs it against `schema.prisma`, and emits a `DROP INDEX` for
each one inside whatever migration you are authoring — silently removing inbound
dedupe, the open-thread race protection, and every cross-tenant integration
constraint at once. Hand-writing is not the fallback; it is the only path.

These are standing rules for **every** migration in this repo, not one-time tasks:

- Hand-write the migration directory and its `migration.sql`, then apply with
  `prisma migrate deploy`. Never run `prisma migrate dev` against this schema.
- If you draft SQL with `prisma migrate diff`, delete every `DROP INDEX` from its
  output before saving.
- Verify the saved `migration.sql` contains no `DROP INDEX` before applying it.
- After it lands, confirm all six survived — this must return 6:
  ```sql
  SELECT count(*) FROM pg_indexes WHERE indexname IN (
    'threads_one_open_per_customer', 'messages_org_external_id_unique',
    'integrations_instagram_organization_unique', 'integrations_instagram_account_unique',
    'integrations_shopify_account_unique', 'integrations_non_email_account_unique');
  ```

**Run prisma from the repo root, never from inside `packages/db`.** That
directory's `.env` points at the production Neon instance and *overrides* an
inline `DATABASE_URL`, so `cd packages/db && DATABASE_URL=…local… npx prisma
migrate deploy` silently targets production. It did once — migration 1 landed in
prod before its code. Additive and inert, so nothing broke, but read the
`Datasource "db": … neon.tech` line before trusting where a migration went. The
local test DB is `127.0.0.1:55432/clerk_test` and needs both `DATABASE_URL` and
`DIRECT_DATABASE_URL` passed inline.

## What shipped

**P0 (2026-08-14)** — `describe('conversation episodes')` in
`apps/gateway/src/routes/internal-storefront-chat.test.ts`, written against the
gateway route with a real database. The dashboard proxy mocks the gateway hop, so
a test written there proves nothing about episodes.

**P1 (2026-08-14)** — migration `20260814120000_add_conversation_episodes`
(hand-written, all six indexes verified surviving) plus:

- `resolveInboundEpisode` owns the only place an inbound message's episode is
  decided. It runs inside a transaction that locks the customer row with
  `SELECT … FOR UPDATE`; the old `findFirst → create → catch P2002` sequence could
  not survive two concurrent first-messages after expiry. Removing the lock fails
  the concurrency test 3/3.
- Rollover closes the expired thread with `closedReason = episode_rollover`,
  clears `cachedPlan`/`cachedPlanMessageId` in the same transaction, binds the new
  storefront episode to its session, and removes the old thread's operator pending
  plan after commit. Nothing is carried forward.
- Verification resolves through `StorefrontChatSessionEpisode` rather than the
  session's current `threadId`, in **both** readers (`packages/agent/src/context.ts`
  and `apps/gateway/src/storefront-chat-verified-orders.ts`). Keying off the
  pointer made tool policy a side effect of a pointer update in both directions.
  Scope now follows the proof: the browser session that answered the challenge,
  for as long as that session lives, still scoped to the verified order.
- Outbound persistence no longer unconditionally reopens a thread (both call
  sites in `dispatch-message-common.ts`), `assertCurrentEpisode` runs before any
  provider branch, and a late draft returns a typed `episode_superseded` conflict
  rather than being rerouted onto the new episode.

**Correction — what P1 did not close.** This file previously claimed the old
summary was gone from a returning visitor's *context*. It was not: rollover leaves
`aiSummary` on the closed thread, which then matched `buildContext`'s past-tickets
query verbatim and came back as `ctx.pastTickets` on the very next turn.

It did **not** reach the storefront prompt. `buildSystemPromptParts` set
`ordersSection` to `""` under `storefrontMode`, and `buildPastTicketsSection` was
only ever called inside the non-storefront branch — so the widget loaded the stale
summary on every turn and then dropped it. The channels that rendered it were
email, Instagram DM, and TikTok, all of which roll episodes too. Verified by
reverting item C's deletion, rebuilding `packages/agent`, and watching the
storefront prompt assertion still pass.

Both halves are closed by item C, which deletes the query rather than the
rendering. P1 also made the dump grow while it stood: a shopper chatting across
three days manufactures three closed threads and fills their own past-ticket slots.

## Remaining work

### A. Plan from the current request, not the episode summary — **done**

- [x] Promoted the trailing-run logic into `conversation-burst.ts`, returning the
  burst's messages rather than only its count. `getConversationStage` now derives
  its count from it, so the notification and the request summary can never
  describe different bursts. Episode-local for free, since a thread is an episode.
- [x] The classifier produces `requestSummary` and `requestDisposition` alongside
  the episode summary, over a `--- CURRENT REQUEST ---` block that names the burst
  explicitly rather than leaving it to be inferred from the transcript's tail.
  One model call, `CLASSIFIER_VERSION` bumped to 4. The `request_*` columns
  shipped inert in migration 1; this is their first writer.
- [x] Compare-and-set: the burst is re-read after the model call, and a request
  whose newest message changed underneath is dropped while the episode summary
  still lands. Verified load-bearing — forcing the guard true fails the test with
  `expected 'Customer asks whether the shop ships …' to be null`.
- [x] All three `thread.aiSummary` planning fallbacks now read `requestSummary`
  (`generate-thread-plan.ts`, `operator-answer-replan.ts`,
  `apps/dashboard/src/app/api/agent/answer/route.ts`). Where no request has been
  summarised the generic instruction stands — the planner still reads the
  messages themselves, so nothing is lost by refusing to hand it the episode.
- [x] The email path writes the request fields at persistence
  (`inbound-persistence.ts`), because it classifies pre-persistence and then runs
  the summary job with `skipSummary` — without that, email threads would carry a
  null disposition forever and item B's gate would have to treat unknown as
  allowed. The classifier sees one message there, so a second unanswered email
  narrows the summary to the newest; `requestSourceMessageId` still points at the
  newest customer message, so the narrowing costs detail and never correctness.

`requestDisposition` falls back to `unclear`, never `none`, on an unreadable or
absent verdict — including the existing-customer fast path in `channels.ts` that
skips the classifier entirely. Only `merchant_action` and `unclear` may park work
for the merchant, so the default has to leave a request visible rather than let a
malformed field swallow a refund request.

### B. Don't manufacture merchant work from a greeting

- [ ] `none` and `acknowledgement` requests never create a merchant action plan.
  A greeting or "thanks" gets the product's safe acknowledgement behavior without
  appearing as work for the merchant.
- [ ] Routine informational reads/replies follow the existing decision: perform
  the safe read/reply when policy permits and report the outcome; do not present
  an approval card whose only value is asking permission to answer.
- [ ] Only `merchant_action` and genuinely unresolved `unclear` requests park a
  plan or question.
- [ ] Replace notification `aiSummary` inputs with `requestSummary`.
- [ ] Immediately before publishing a notification, assert current thread, current
  request source, current plan ID, and eligible disposition.

This overlaps the safe-reply auto-execution in `packages/agent/src/plan-execution.ts`:
routing and the auto-execute decision are one change, evaluated together.

### C. Delete the past-ticket dump — **done**

Note for prioritisation: this changed **no widget behaviour**, because the
storefront prompt already dropped the section (see the correction above). Its real
effect is on email and Instagram threads, plus one fewer query per customer turn.

- [x] Deleted the "three most recent closed threads for this Customer" query from
  `buildContext`, the `pastTickets` field from `AgentContext`,
  `buildPastTicketsSection` and both its call sites, and
  `CONTEXT_BUDGETS.pastTicketSummaryChars`. Removing the field rather than
  emptying it makes the type system the enforcement.
- [x] Removed the two eval fixtures that existed only to exercise the dump.
  `memory-past-tickets-no-derail` used past tickets as a distractor for a
  quick-reply path `order-status-basic` already covers; `memory-past-ticket-continuity`
  was judge-scored on continuity the agent can no longer have, so it would have
  gone permanently red as an advisory. Their baseline entries went with them.
  `memory-past-ticket-continuity` remains the acceptance case if prior-episode
  retrieval is ever built.
- [x] Replaced the three prompt tests that asserted the section renders with one
  that asserts it never does, and extended the storefront episode test to assert
  the built prompt carries nothing from the closed episode.

### D. Stop counting rollovers as resolutions

`get_support_stats` (`packages/agent/src/tools/support-stats.ts:62-70`) counts
every `status = 'closed'` thread as a resolution, and `inboxThreadSql` excludes
only operator channels — `shopify_chat` is fully counted. So each rollover adds a
fake resolution, skews `avgMinutes` (which is `updated_at - created_at`, meaning a
3-day-idle episode reports a ~3-day "resolution time"), and inflates
`tickets.total`/`byDay`/`byChannel` without any new customer contact.

`closedReason` exists to tell "they moved on to a new question" from "nobody ever
came back." Nothing reads it yet.

- [ ] Exclude `closedReason = 'episode_rollover'` from the resolution and ticket
  counts, or count the episode chain as one ticket. The briefing is the flagship
  surface; it must not report invented resolutions.
- [ ] Have the retention sweep (`apps/gateway/src/maintenance/inactive-thread-sweep.ts`)
  stamp `closedReason = 'inactivity'` when it closes a quiet thread. It closes
  today and records no reason, so the two cases are indistinguishable.

### E. Widget: mark the boundary

Bootstrap reads messages from `session.threadId`, which rollover repoints, so the
expired episode leaves the widget on its own after the next message. Only the
seam is visible, and only within one page load.

- [ ] When a message response returns `isNewThread: true` and messages are already
  on screen, render a "New conversation" divider.
- [ ] Reset the optimistic-echo and `seen` bookkeeping
  (`extensions/shopkeeper-chat/assets/shopkeeper-chat.js:173,216-217,227`) at that
  boundary, so identical text in two episodes is not suppressed as an echo.

### F. Ship

- [ ] Run the full agent eval gate **once**, after A, B, and C are all complete —
  not once per item. Safe-reply auto-execution owes a gate run of its own; batch
  it into this one, since both change planner-visible routing.
- [ ] Verify on the dev store: widget, dashboard, operator notification, and
  reply/approval paths together.

## Deferred

Cut from this plan, with the reason each can wait:

- **Person / ChannelIdentity / IdentityLinkAudit / PersonMemoryFact.** The entire
  justification was "skipping destroys data permanently," which requires traffic
  to be losing. There is none. Every `Person` would also hold exactly one
  `ChannelIdentity` until Shopify Customer Account OAuth lands, and its only
  consumer is prior-episode retrieval, also deferred.
- **`CustomerObligation`.** Rollover drops the merchant's queued card silently
  today. The cheap fix, if it bites during testing, is to tell the merchant the
  card expired — not a table.
- **`ThreadMemoryIndex` and prior-episode retrieval.** Read-path, derived, and a
  ranking problem with no traffic to rank against. Designing it blind ships
  matching rules that are wrong in a way no test catches.
- **Collapsed "Previous conversation" history in the widget.** The data is kept —
  rolled-over threads are closed, not deleted, and archive at 90 days — so this is
  reversible whenever a shopper asks for it.
- **`CONVERSATION_EPISODE_MODE` shadow mode.** Shadow-running a decision against
  zero traffic is ceremony. The dev store is the test.
- **Email provider-conversation key.** Email uses the 7-day idle fallback the
  boundary table already sanctions. `providerConversationScoped: true` is set, so
  adding the key is the only change needed when it matters.
- **Bootstrap paginating backward.** It takes the oldest fifty
  (`orderBy: sentAt asc, take: 50`), which mattered when a thread was a lifetime.
  An episode bounded by 24h idle rarely reaches fifty.
- **Conversation-to-sale attribution.** Separately recorded in
  [to-do-list.md](to-do-list.md).

## Acceptance

- [~] A visitor returns after three days and says "Hi": fresh episode, no old raw
  messages or old summary in context, no merchant plan. — episode and raw-message
  halves pass; the old summary still arrives via past tickets (item C) and a
  greeting can still produce a plan (item B).
- [x] The same visitor follows up after ten minutes: same episode, coherent
  context.
- [x] An old cached plan exists when rollover occurs: expired and removed from
  operator queues.
- [x] A merchant sends an approval drafted for the expired episode: typed
  superseded conflict, no provider send, no old-thread reopen.
- [x] A verified storefront session rolls to a new episode: still verified, and
  the expired episode is still verified too.
- [x] Two concurrent first messages after expiry create one new open episode and
  persist both messages exactly once. — verified load-bearing; removing the
  customer row lock fails it 3/3.
- [ ] A rolled-over episode does not appear as a resolved ticket in the briefing.

## Verification commands

```bash
npm run test:unit -w packages/agent
npm run test:integration -w packages/agent
npm run test:unit -w apps/gateway
npm run test:integration -w apps/gateway
npm run test:unit -w apps/dashboard
npm run test:integration -w apps/dashboard
npm run typecheck
npm run lint
npm run test:evals -w apps/dashboard   # once, at item F
```

Two things to know before reading a red dashboard integration run as your fault:

- **That suite has a pre-existing order-dependent flake**, confined to
  `/api/integrations/*` route tests. It fails on `master` too. Nothing about
  episodes, threads, or dispatch was ever the failure.
- **Residue accumulates in the shared local test DB.** Orphaned
  `integration_disconnects` rows build up; `cleanupTestData` deletes by org, and
  these outlive their org. Clearing that table is a fair reset before judging a
  flaky run.
