# Agent Behavior — Open Work

What's left from the 2026-07-11 agent-behavior audit. The plan itself is done:
Track A (A1–A6, conversational operator channel) and Track B1–B5 (support-adjacent
proactive expansions) are all implementation-complete and live-verified. The full
history is in
[archive/agent-behavior-and-expansion-plan-2026-07.md](archive/agent-behavior-and-expansion-plan-2026-07.md).
B6 (order-ops autonomy) was never a behavior phase — it's module #2 and now lives
only in
[core-extraction-and-module-expansion-plan.md](core-extraction-and-module-expansion-plan.md).

Last reviewed: 2026-07-25.

## Rollout state

Code state and production state are different things; this table is the only
place that says both.

| Capability | Flag | Code | Production |
| --- | --- | --- | --- |
| Operator pending-plan queue (A6) | `OPERATOR_PLAN_QUEUE_MAX` | merged `f2778ec1` | **`1`** — single-slot parity, queue inert |
| Return-lifecycle monitor (B3) | `RETURN_LIFECYCLE_MONITOR_ENABLED` | merged 2026-07-20 | **off** (migration applied 2026-07-22) |
| Delivery-exception monitor (B4) | `DELIVERY_EXCEPTION_MONITOR_ENABLED` | merged 2026-07-20 | **off** (migration applied 2026-07-22) |
| Post-resolution follow-up (B5) | `POST_RESOLUTION_FOLLOWUP_MONITOR_ENABLED` | merged `9a686639` | **on** since 2026-07-22 |
| Order-risk fraud monitor (B6) | `ORDER_RISK_MONITOR_ENABLED` | code-complete | **off** — flag-and-notify only, no autonomy |
| Gift cards / store credit (2026-07-06 expansion) | none | shipped tools (`create_gift_card`, `issue_store_credit`) | **403 on `palette-dev` until re-auth** — see below |

The last row is a capability that reads as live everywhere in the code and is
not. `create_gift_card` and `issue_store_credit` sit in the registry
(`tools/registry/order.ts`), the prompt and `plan-preview.ts`, so the agent will
plan them and the merchant can approve them, but the only real store's OAuth
grant predates the expansion and lacks `write_gift_cards` and both store-credit
scopes. An approved plan using either fails at execution. Found 2026-07-25 by
the P3-01 canary scope pre-check; re-auth in progress. Nothing here is a code
gap — the durable fix is persisting granted scopes at install so this is
knowable without probing (recorded under P3-01).

Per-org opt-outs, all in `Organization.settings` and surfaced on
`/dashboard/agent/configure`: `salesPulseEnabled`, `lowStockThreshold`,
`deliveryExceptionWatchEnabled`, `postResolutionFollowUpEnabled` /
`postResolutionFollowUpDays`.

## Finishable now

Nothing here waits on production traffic, credits, or another plan.

1. ~~**A2 live phone verification.**~~ **Done 2026-07-24.** Verified on a real
   phone against the local test DB, with `@ClerkDevBot`'s webhook temporarily
   pointed at a cloudflared tunnel (prod webhook captured first and restored
   after). Both merchant messages parsed as `free-form` — checked against
   `parseTelegramCommand`, with `SPAM 1` / `REPLY 2 …` still hitting their fast
   paths as controls — and both reached the model over the durable path: two
   `OperatorEvent` rows, channel `telegram`, status `committed`. "the one from
   sarah is spam" fired `mark_ticket_spam` on the right ticket id, resolved from
   the customer name alone and with no confirming question, and the thread went
   `filtered` / `confirmed_spam`. The reply instruction fired `send_ticket_reply`
   on the flagged ticket; the dashboard hop returned ok and the thread
   self-healed to `confirmed_genuine`, exercising the recoverability legs the
   spam decision below rests on.
   **Narrower gap, left open on purpose:** the reply was actually sent as "we
   ship Friday", not the scripted "reply to the second: …", so the model chose
   the ticket by content rather than by ordinal. Ordinal reference ("the second")
   is still unverified on a phone — one message closes it.
   Fixture: `apps/gateway/src/scripts/stage-digest.ts`, which seeds two flagged
   tickets plus one genuine ticket deliberately left out of `pendingDigest` and
   pushes through the production `buildOrgDigest` + `notifyOperator` path. It
   needs the gateway **worker** as well as the server — durable ingestion is the
   only inbound path — and `E2E_AI_MODE` set to anything but `deterministic`.
2. ~~**A1 executor coverage gap.**~~ **Done 2026-07-24.** An `executor path`
   suite in `operator-inbox-tools.test.ts` now drives both tools through
   `executeToolWithStatus` — the same entry point `run-execution.ts` uses — so
   `definition.parse` (enum, required, type, unknown-key rejection) and
   `categoryPermission` are covered, plus a guard that neither tool resolves
   without the gateway `moduleTools`. Verified by mutation: deleting the
   `status` enum fails the suite.
3. ~~**Decision — digest spam via the model.**~~ **Decided 2026-07-24** — see
   Decisions below. No code change: the shipped behavior is the decision.
4. ~~**Decision — Concierge parity for the inbox tools.**~~ **Decided
   2026-07-24** — see Decisions below. No code change.
5. ~~**The digest counts internal threads as open tickets.**~~ **Done
   2026-07-24.** Found while verifying A2: the staged digest read "Open tickets:
   1" before any operator thread existed and "Open tickets: 2" afterwards, with
   the same single genuine support ticket both times — the extra one was the
   merchant's own operator thread, and that count is the first line the merchant
   reads. `buildOrgDigest` (`apps/gateway/src/maintenance/digest.ts:194`) now
   takes `canonicalInboxThreadWhere`, which adds the `sms_agent` /
   `dashboard_agent` and `archivedAt` exclusions it was missing, with one
   documented exception: `filterStatus: undefined`, because the digest reports
   filtered threads as a count ("Filtered: n") rather than hiding them.
   The same gap sat in `loadStaleThreadWaitingItems`
   (`apps/gateway/src/maintenance/digest-briefing.ts:298`), where a filtered or
   archived thread with a stale `cachedPlan` could reach "Waiting on you"; that
   query takes the predicate whole. Real-DB tests cover both and were
   mutation-verified against the old queries — an org with one email ticket plus
   an operator thread, a Concierge thread and an archived thread reported "Open
   tickets: 3" before and 1 after.
6. ~~**Two simulated Shopify integrations are sitting in the production
   database.**~~ **Guard done 2026-07-25; the rows are still there and that is
   now a cleanup choice, not an exposure.** Both are
   `demo-store.shopkeeper.test`, created 2026-07-02, with
   `metadata.simulated = true` and tokens encrypted under a local dev fallback
   key (they are unreadable in production; `palette-dev` is healthy and reads
   fine there). Found 2026-07-24 while running the P3-01 canary, which selected
   one of them instead of the real store. They were always inert to app code —
   every app-code Shopify lookup is org-scoped — so the exposure was only the
   cross-org monitor sweeps.
   **Correction to what this item originally prescribed:** the operational guard
   alone would *not* have excluded these rows. `api/integrations/shopify/simulate/route.ts:30`
   creates them with a live-looking `accessToken` and no `tokenExpiresAt`, so
   `getShopifyConnectionState` returns `active` and
   `isShopifyIntegrationOperational` returns **true**. The dashboard never leaned
   on that guard for them either — it checks `isSimulatedShopifyIntegration`
   separately and earlier (`shopify-integration.ts:92`).
   The fix is `isShopifyIntegrationSweepable` in the new host-agnostic
   `packages/agent/src/shopify/integration-health.ts` (own subpath export, so the
   pure predicates don't drag the `./shopify` barrel into the dashboard client
   bundle — and so the sweeps' `vi.mock('@shopkeeper/agent/shopify')` doesn't
   stub them out). It is not-simulated **and** operational, applied in all three
   sweeps (`order-risk-monitor.ts`, `return-lifecycle-monitor.ts`,
   `delivery-exception-monitor.ts`), each of which now also selects
   `tokenExpiresAt` and `metadata`. The dashboard's copies of
   `getShopifyConnectionState` / `isShopifyIntegrationOperational` /
   `isSimulatedShopifyIntegration` are re-exports of the shared module, so there
   is one definition rather than two. Covered by a per-sweep unit test plus the
   predicate suite, mutation-verified: stubbing the guard to `return true` fails
   exactly three tests, one per monitor.
   **Left open:** deleting the two production rows. It is a production data
   decision, the fixtures come back the next time someone seeds, and nothing now
   depends on it.

## Decisions

### Digest spam: trust clear intent (2026-07-24)

`mark_ticket_spam` fires on clear intent and asks one short confirming question
only when intent is ambiguous — the behavior already shipped in
`operator-digest-tools.ts:37`. No always-confirm prompt.

What makes that safe is recoverability, not caution, and all four legs are real:

- **Bounded target.** `markDigestThreadSpam` rejects any id outside
  `pendingDigest.threadIds`, so the model can only act on tickets the filter
  already flagged and the merchant just read in the digest. It cannot reach a
  healthy inbox ticket.
- **One-click reversible.** The tickets page has a **View spam (n)** filter with
  a per-row Recover action (`useTicketActions.ts:248` → `filterStatus: genuine`).
- **Self-healing.** Any reply sent on the thread sets `confirmed_genuine`
  (`messages/route.ts:48`, `messages/internal/route.ts:50`), so acting on the
  ticket un-files it.
- **Non-compounding.** `filterFeedback` trains nothing — its only consumers are
  the tickets UI, route validation, and `purge.ts`. A wrong mark does not bias
  future filtering.

The argument against always-confirming is stronger than the argument for it: a
prompt on every dismissal is approval theater that teaches reflexive "yes", which
erodes the confirmations that do matter — plan approvals that move money. It also
wouldn't catch the actual failure mode, which is the model picking the *wrong*
ticket, not misreading intent.

**Known limitation, accepted:** from the phone this is one-way. The inbox tools
exclude filtered threads (`canonicalInboxThreadWhere`), so a merchant cannot see
or undo a spam mark from Telegram/iMessage — only from the dashboard. If that
ever bites someone, the fix is an `undo_ticket_spam` digest tool, not a confirm
prompt.

### Concierge inbox parity: no (2026-07-24)

Do not mirror `list_active_tickets` / `get_ticket` as dashboard host tools.

- Concierge runs two clicks from `/dashboard/tickets`, which is strictly richer
  than a 20-row text list. The tools earn their value on the phone, where there
  is no UI.
- Mirroring means a second implementation of the same tool — the drift class this
  doc set just spent a cleanup on.
- Product principle 2 ("reach the merchant wherever they are") governs proactive
  *pushes*. These are pull-only read tools, so it doesn't bind here.
- Every tool added to a turn costs prompt tokens and a chance the model reaches
  for a tool instead of answering, cutting against P2-02's bounded-context work.

**If reopened, promote rather than mirror.** `operator-inbox-tools.ts` depends
only on `db` plus host-agnostic helpers (`canonicalInboxThreadWhere`,
`wrapUntrusted`, `getCurrentPlanForThread`), so it can move into
`packages/agent` behind a server-only subpath the way `./executor` is exported —
never into `registry/*`, which ships in the dashboard client bundle. **Trigger:**
Concierge gains a mobile surface, or a merchant actually asks Concierge about a
ticket and hits the cliff.

## Blocked, and on what

Each row names the event that unblocks it. None of these are code.

| Item | Blocked on | Unblock event |
| --- | --- | --- |
| A5's "Handled" section claiming actions definitely completed | P3-01 mutating canary pass — and, before it, **a re-auth of `palette-dev` and one test order** | Inspect pass ran clean 2026-07-25 (`railway run --service shopkeeper -- node scripts/canary-shopify-mutations.mjs`): selected `palette-dev-3peukw16.myshopify.com`, skipped both simulated rows as `simulated fixture`, `connectivityError: null` — so credentials, token decryption and Shopify auth are all confirmed, and neither store availability nor the harness (`632be88e`) is a blocker. What *is*: the store reports `testCount: 0` / `liveCount: 4`, and the refund family needs a `test: true` order (`canary-shopify-mutations.mjs:235`). Without one it silently skips with a note and exit code 0, so a mutating run would cover gift_card + order_creation **for real** on a paid `basic`-plan store while never testing refunds — the one irreversible family. Create a Bogus Gateway / Shopify-Payments-test-mode order first, then run `--execute --allow-live-store`. The scope gap this row used to flag as an ambiguous-403 risk turned out to be real, and the pre-flight check found it (2026-07-25; detail and the run order in P3-01 of the cleanup plan): `palette-dev` is missing `write_gift_cards` and both store-credit scopes, so re-auth comes before the test order. |
| Raising `OPERATOR_PLAN_QUEUE_MAX` above 1 | P1 execution-ledger rollout verification | `npm run audit:plan-executions -- --hours=24` returning representative dashboard *and* gateway executions. It currently returns zero — there is no traffic yet. |
| Enabling B3/B4 monitors | same P1 rollout, plus the P6-02 controlled recovery exercise (the simulated-fixture leg is closed — see item 6) | as above |
| B3/B4/B5 live push verification | a real return arrival, delivery exception, or 5-day-old resolution | first real merchant traffic, or a deliberately staged fixture on the test DB |

Until its gate lands, a capability may ship only the read-only or copy-only
portion that doesn't widen the unsafe action surface. Enabling a flag does not
bypass a gate — it only exposes an already-complete path.

## Dependencies elsewhere

The systems-safety gates live in
[codebase-cleanup-plan.md](codebase-cleanup-plan.md); read status there, not
here, so it can't drift. The mapping that still matters:

| Behavior | Required cleanup work |
| --- | --- |
| Pending-plan approve/dismiss/revise/queue | P1-01…P1-03, P2-01 |
| Natural-language ticket sends from the operator channel | P4-03 (done), P5-01 (done), P4-01 for async email |
| Briefing claims about completed actions | P1/P3 committed execution outcomes |
| New mutative/proactive monitors | P1 execution claims, P3 mutation/cap work, P4 delivery durability, P6-02 queue monitoring |
