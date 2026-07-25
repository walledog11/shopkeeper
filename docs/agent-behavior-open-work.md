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

Two shipped Shopify capabilities — `create_refund` and `attach_return_label` —
were found this week to have never once executed, each rejected by Shopify at
document validation and each reported to the merchant as "may have committed."
Both are fixed. The systematic guard is item 8 below.

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
| Gift cards (2026-07-06 expansion) | none | shipped tool `create_gift_card` | **verified on `palette-dev`** 2026-07-25 — canary `ok`/`committed` |
| Store credit (2026-07-06 expansion) | none | shipped tool `issue_store_credit` | **scopes granted 2026-07-25**, never executed — no canary family |
| Refunds (`create_refund`) | none | **broken since it shipped**; fixed 2026-07-25 | **verified on `palette-dev`** — partial-amount path only |
| Return labels (`attach_return_label`) | none | **broken since it shipped**; fixed 2026-07-25 | **document schema-valid** on `palette-dev`; never executed |

The gift-card and store-credit rows were one capability that read as live
everywhere in the code and was not. Both sit in the registry
(`tools/registry/order.ts`), the prompt and `plan-preview.ts`, so the agent
plans them and the merchant can approve them, but the only real store's OAuth
grant predated the expansion and held none of their scopes — an approved plan
using either failed at execution. Found 2026-07-25 by the P3-01 canary scope
pre-check. Both sets have since landed: the live grant now reports
`missing: []`, so neither tool 403s. `create_gift_card` is verified end to end;
`issue_store_credit` is merely unblocked, because no canary family exercises it
and nothing has ever called it against a real store.

The scope half was not a code gap, and re-authorizing was not the fix — the
grant is driven by the app's configured scopes, not by our authorize URL, so
`SHOPIFY_OAUTH_SCOPES` describes what we intend rather than what a store holds
(detail and evidence in P3-01 of the cleanup plan). Two consequences worth
keeping: a shipped tool can be inert on a given store with nothing in our data
saying so, and the durable fix is persisting granted scopes at install so it is
knowable without probing that store. Until then, `node
scripts/canary-shopify-mutations.mjs` is the only way to ask.

### `create_refund` never worked (found and fixed 2026-07-25)

The refund row above is a genuine code defect, not a grant problem, and it is
the most serious thing this doc has recorded. `refunds.ts` selected
`userErrors { field message code }`, but `refundCreate` returns plain
`UserError`, which has no `code`. That is a **static document-validation
error**: Shopify rejected every refund before executing it, on every store,
100% of the time, since the capability shipped.

The failure mode is what makes it expensive. A validation error comes back as
HTTP 200 with an `errors` array; `shopifyGraphql` throws a `ShopifyRequestError`
with **no status** (`client.ts:316`); and `isAmbiguousShopifyMutationError`
(`client.ts:224`) treats a missing status as transport ambiguity. So a mutation
that provably never ran was reported as *"may have committed at Shopify… do not
retry or confirm it to the customer"* — the P3-01 machinery faithfully parking a
deterministic outage in `unknown` and suppressing customer confirmation. The
reconciliation probe was right every time (`no_effect`); only the classification
above it was wrong.

Three durable lessons:

- **Unit tests cannot catch this class.** All 30 refund tests passed before and
  after the fix, because they mock `shopifyGraphql` — no document in
  `packages/agent/src/shopify/` is validated against a real schema anywhere in
  CI. The canary is the only guard, which is the argument for widening it.
  *(Widened 2026-07-25 — see item 8. CI now catches one narrow sub-case, the
  declared-but-unused variable, because it is checkable from the document text
  alone. Anything needing the schema — a field that does not exist, a wrong
  input type — still requires the live `--validate` run.)*
- **The canary runs the built package.** `railway run` resolves
  `@shopkeeper/agent/shopify` through the export map to `dist/`, so a source fix
  needs `npm run build -w @shopkeeper/agent` before a canary run means anything.
  One verification round was wasted re-testing a stale artifact.
- **`status` alone is not a diagnosis.** Four branches of `createRefund` return
  `unknown` and the harness recorded only the enum, making the run unreadable —
  `unknown`/`no_effect` is equally consistent with "totally broken" and with
  "correctly survived a transient 5xx". The canary now records `message` and
  `probeMessage`, which is what identified the bug.

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
7. **The full-refund path is schema-valid but still unexecuted.** Narrowed by
   item 8, not closed. The shape half is done: `refundCreate.full` in
   `VALIDATION_CASES` coerces `shipping: { fullRefund: true }` and the
   `refundLineItems` built by `graphqlRefundLineItems` (`refunds.ts:133`:
   `lineItemId`, `quantity`, `restockType`, `locationId`) against the live
   schema, so a wrong field name in those inputs can no longer hide. What
   remains is behavioral, and validation cannot reach it: whether
   `buildFullRefundTransactions` picks the right transactions, and whether the
   refunded total matches the order. The canary always passes `amount: '0.01'`
   and takes the partial branch. Still needs a second test order and an
   `--only=refund` variant that omits `amount` — but it is no longer the same
   class of risk as the two defects above.
8. ~~**Validate every Shopify mutation document against the live schema.**~~
   **Done 2026-07-25, and it found a second 100%-failure defect** — see below.
   `node scripts/canary-shopify-mutations.mjs --validate` now sends all 10
   mutation documents (12 cases) with `@skip(if: true)` on the root field.
   Nothing executes: GraphQL validates the document and coerces every declared
   variable before it honors the skip. Current state: **12/12 valid, 0
   uncovered**, exit 0, and it needs no development-plan store.
   Two corrections to what this item originally assumed. `cancel_order`,
   `update_shopify_order_address` and the write half of `create_order` are
   **REST**, not GraphQL — they fail with an HTTP status, so they were never in
   this class. And the real GraphQL surface is 10 documents, not 7, because
   `edit_shopify_order` is four separate ones (`orderEditBegin` / `AddVariant` /
   `SetQuantity` / `Commit`), each independently unvalidated until now.
   Three things make this close the class rather than one instance:
   - **One definition per document.** Each is an exported const in the module
     that sends it (`REFUND_CREATE_MUTATION`, …), enumerated in
     `packages/agent/src/shopify/mutation-documents.ts`. The harness validates
     the exact string that runs, not a copy of it.
   - **A drift guard.** A document in `SHOPIFY_MUTATION_DOCUMENTS` with no
     validation case fails the run. Mutation-verified: adding a registry entry
     with no case produced `uncoveredMutationDocuments: ["driftGuardProbe"]` and
     exit 1. A new mutation cannot ship unvalidated by being forgotten.
   - **The premise is proven per-run, not assumed.** A preflight sends
     `orderEditBegin` against a nonexistent order — harmless even if it executes
     — and aborts the whole run unless `data` comes back without the root-field
     key, which is the proof Shopify honored the skip. Every fixture id points at
     a nonexistent resource as a second layer.
   This also closed most of item 7 without a second test order: `refundCreate` is
   validated in **both** shapes, and the full-refund branch
   (`shipping: { fullRefund: true }` plus `graphqlRefundLineItems`) is now
   schema-valid. `returnCreate` likewise gets both the return and the exchange
   variable shape.

### `attach_return_label` never worked either (found and fixed 2026-07-25)

The first run of the validator found the same class of defect a second time, in
a different tool. `reverseDeliveryCreateWithShipping` declared
`$notifyCustomer: Boolean` but hardcoded `notifyCustomer: false` in the field
arguments, so the variable was declared and never used — a static validation
error under GraphQL's "all variables used" rule. Shopify rejected the document
before executing it, on every store, 100% of the time, since the capability
shipped. Fix: drop the unused declaration; the call site never passed it.

Two lessons on top of the refund ones, both already applied:

- **The refund bug was not a one-off.** Two of ten mutation documents were
  statically invalid, in different ways (`userErrors { … code }` on a type
  without `code`; a declared-but-unused variable). Both were unreachable by unit
  tests, both shipped, both presented as ambiguous provider errors. A
  `*.test.ts` guard now asserts no document declares a variable it does not use,
  mutation-verified against the real defect.
- **`message` alone is not a diagnosis either.** The first run reported only
  `"Shopify GraphQL request failed."` — `ShopifyRequestError` carries the actual
  GraphQL error text on `payload`, and the harness was reading `message`. This
  is the same failure the `create_refund` write-up recorded one section up, in a
  new place. The harness now reports both.
9. **Decide whether a statusless GraphQL error stays "ambiguous."** Now the only
   open decision, and item 8 strengthened the case for it: **two** shipped tools,
   not one, spent their entire lives reporting a deterministic rejection as
   "may have committed."
   `isAmbiguousShopifyMutationError` (`client.ts:224`) cannot currently tell a
   dead socket from a 200 that rejected the document, and the refund bug showed
   what that costs. The narrow, safe fix is to reclassify **only** the
   validation case, which is identifiable because Shopify returns no `data` key
   at all: execution errors can genuinely follow side effects, and `THROTTLED`
   also arrives as a 200 `errors` array, so both must stay ambiguous. Left as a
   decision rather than a change because it widens what the system will claim
   definitely did not happen.

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

Each row names the event that unblocks it. All but the first wait on traffic or
time rather than on work; A5 is now the exception, since items 7 and 8 above
feed it.

| Item | Blocked on | Unblock event |
| --- | --- | --- |
| A5's "Handled" section claiming actions definitely completed | the last canary family — `order_creation` — plus item 7 above | **Two of three families pass, and all 10 mutation documents are schema-valid** (2026-07-25, order `#1005`, a $600 Bogus-gateway test order). `gift_card`: `ok` / `committed`. `refund`: `ok` / `committed` on a $0.01 partial, but only after fixing a defect that made it fail 100% of the time — see the `create_refund` section above, and note it took three runs, one of which wasted a round on a stale `dist`. `order_creation` is unrun because it commits a genuine order on a live `basic`-plan store; that is a deliberate choice, not a blocker. Item 8 is now closed and took a second 100%-failure defect (`attach_return_label`) with it, so a canary pass means considerably more than it did: the documents behind it are proven, and a new one cannot ship unvalidated. Item 7 remains — the full-refund branch is schema-valid but has never executed. |
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
