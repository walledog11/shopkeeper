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

Three shipped Shopify money paths were found this week to have never once worked.
`create_refund` and `attach_return_label` were rejected by Shopify at document
validation and reported to the merchant as "may have committed"; store credit's
*reconciliation probe* read every committed credit as a no-op, which is the same
100% failure rate pointed the other way. All three are fixed. The systematic
guard against shipping a fourth invalid document is item 8; the guard against
misreporting a rejection as ambiguous is item 9; the probe defect is the one
neither of those would have caught, and item 10 says why.

Acting on item 10's closing lesson then found two *more* probes reading Shopify
wrongly (item 11) — a country code and an order-edit delta — and one tool pair
that reported a committed return as a flat failure (item 12). Neither set is a
100%-failure, but both are the same shape as the first three: the code that runs
when we already know something went wrong was the code nobody had tested.

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
| Store credit (2026-07-06 expansion) | none | shipped tool `issue_store_credit`; **its reconciliation probe was broken since it shipped**, fixed 2026-07-25 | **verified on `palette-dev`** 2026-07-25 — `ok`, `spentCents: 1`, balance $0.01; probe `committed` only after the fix |
| Refunds (`create_refund`) | none | **broken since it shipped**; fixed 2026-07-25 | **verified on `palette-dev`** — both paths: partial (`#1005`, $0.01) and full (`#1006`, $629.95, total matched) |
| Return labels (`attach_return_label`) | none | **broken since it shipped**; fixed 2026-07-25 | **document schema-valid** on `palette-dev`; never executed |
| Order creation (`create_shopify_order`) | none | **broken since it shipped**; fixed 2026-07-25 | rejected `422 "Order tags is invalid"` on `palette-dev`; **fix not yet re-run** |

The gift-card and store-credit rows were one capability that read as live
everywhere in the code and was not. Both sit in the registry
(`tools/registry/order.ts`), the prompt and `plan-preview.ts`, so the agent
plans them and the merchant can approve them, but the only real store's OAuth
grant predated the expansion and held none of their scopes — an approved plan
using either failed at execution. Found 2026-07-25 by the P3-01 canary scope
pre-check. Both sets have since landed: the live grant now reports
`missing: []`, so neither tool 403s. Both are now verified end to end —
`issue_store_credit` by the `store_credit` family added the same day, whose first
run is what exposed the probe defect in item 10.

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
HTTP 200 with an `errors` array; `shopifyGraphql` threw a `ShopifyRequestError`
with **no status**; and `isAmbiguousShopifyMutationError` (`client.ts:232`)
treated a missing status as transport ambiguity. So a mutation that provably
never ran was reported as *"may have committed at Shopify… do not retry or
confirm it to the customer"* — the P3-01 machinery faithfully parking a
deterministic outage in `unknown` and suppressing customer confirmation. The
reconciliation probe was right every time (`no_effect`); only the classification
above it was wrong. That classification is fixed as of item 9.

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
   **The rows are deleted too, 2026-07-25.** Both were confirmed inert before
   removal — `metadata.simulated: true`, shop `demo-store.shopkeeper.test`, and
   each in its own throwaway org ("test" and "tes", 0 threads and 0
   `AgentAction` rows apiece) rather than in the real store's org, which holds 99
   threads and 178 actions. Every inbound reference was checked and was zero:
   `Thread.replyIntegrationId`, `Message.integrationId`, and
   `Organization.defaultEmailIntegrationId`. The deletion was guarded on all
   three conditions plus the exact ids, dry-run first, and one Shopify
   integration remains: `palette-dev-3peukw16.myshopify.com`.
   The fixtures still come back the next time someone runs
   `api/integrations/shopify/simulate`, which is why the sweep guard above — not
   this deletion — is what closes the item. **Deliberately left:** the two empty
   orgs and their 2 KB articles each, seeded by the simulated connect. They own
   nothing else and no sweep reads them.
7. ~~**The full-refund path is schema-valid but still unexecuted.**~~ **Done
   2026-07-25 — it executed, on order `#1006`.** Full refund of $629.95 on a
   fresh Bogus-gateway test order: `status: ok`, `refundedCents: 62995` against
   `orderTotalCents: 62995`, `matchesOrderTotal: true`, and the reconciliation
   probe `committed` — "Reconciled refund on order 6122805395690 for $629.95."
   Both branches of `create_refund` have now run against a real store, which was
   the last thing this doc could say about refunds without hedging.
   The shape half was closed by item 8: `refundCreate.full` in
   `VALIDATION_CASES` coerces `shipping: { fullRefund: true }` and the
   `refundLineItems` built by `graphqlRefundLineItems` (`refunds.ts:153`:
   `lineItemId`, `quantity`, `restockType`, `locationId`) against the live
   schema, so a wrong field name in those inputs can no longer hide.
   **Selection logic covered 2026-07-25.** The branch had *zero* unit coverage —
   nothing in the repo referenced `buildFullRefundTransactions` or `fullRefund`,
   so "picks the right transactions" was untested as well as unexecuted. A
   `createRefund full-refund input` suite in `refunds.test.ts` now drives the
   no-`amount` path against a three-transaction calculation and asserts the
   document variables: every paying transaction at its full amount, the $0
   gift-card one dropped, `shipping: { fullRefund: true }` present, Shopify's
   calculated `refund_line_items` winning over the order-derived ones, and none
   of it sent on the partial path. Mutation-verified — un-dropping the zero
   transaction, removing the shipping flag, or preferring the order-derived line
   items each fails a test.
   What a mock could never prove, and the live run did: Shopify *accepts* those
   transactions, and the refunded total comes back equal to the order total.
   **The `refund_full` family.** `--only=refund_full` omits `amount`. It selects
   only `test: true` orders that are `paid` and uncancelled, so it cannot reach
   a real customer's order or a dirty one — `palette-dev` had four live orders
   sitting alongside the fixture the whole time. It records `orderTotalCents`,
   `refundedCents` and `matchesOrderTotal` rather than just `status`, because
   `ok` proves the document ran and says nothing about whether the right money
   moved, and `matchesOrderTotal === false` fails the run's exit code so that
   defect cannot read as green.
   The `paid` requirement is not fussiness: `probeRefund` with no requested
   amount matches *every* successful refund on the order, so a second refund on
   the same order reports `unknown` for a run that worked. **`#1006` is now
   fully refunded, so re-running this family needs another fresh test order.**
   Two operational facts worth keeping. `--allow-live-store` is **required, not
   conditional** — `palette-dev` reports `plan_name: basic`, so
   `isDevelopmentPlan` is false and every family refuses by default; that is the
   same fact behind `order_creation` staying unrun in the A5 row, where the
   "live `basic`-plan store" is `palette-dev` itself, not the production store.
   And the run has to go through `railway run`: the repo's `.env` files carry no
   `TOKEN_ENCRYPTION_KEY`, so a local run skips the `palette-dev` row as
   undecryptable and then refuses to pick a store at all — the guard working,
   not a misconfiguration.
   **One harness bug, caught by the harness.** The first execute attempt skipped
   the family, and the note said why: the selection excluded the partial
   family's order unconditionally, but the newest test order is *both* that
   default pick and the only clean full-refund candidate, so the guard stranded
   exactly the case it was meant to protect. Now conditional on whether the
   partial family is running in the same invocation. The generalizable part is
   that a skip which explains itself cost one round-trip; a silent one would
   have read as "no candidates" and sent someone to create a second unnecessary
   order.
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
9. ~~**Decide whether a statusless GraphQL error stays "ambiguous."**~~
   **Decided and done 2026-07-25.** A document Shopify refused to execute is no
   longer reported as "may have committed" — the case both defects above landed
   in. `ShopifyRequestError` carries `rejectedBeforeExecution`, set in
   `shopifyGraphql`, and `isAmbiguousShopifyMutationError` returns false for it;
   the tool then takes its ordinary error path instead of parking in `unknown`.
   Everything else is untouched, so a dead socket, a 429, a 5xx and an execution
   error all stay ambiguous.
   **Two corrections to the discriminator this item proposed.** The "no `data`
   key" signal was not reachable where the doc assumed: `shopifyGraphql` threw on
   `payload.errors` *before* it ever looked at `data`, so the throw had to start
   carrying the answer rather than the classifier deriving it. And that throw
   flattened errors to `e.message`, discarding `extensions` — which is where
   `THROTTLED` lives. Since a throttle is also pre-execution and also arrives
   with no `data` key, the data-key test **alone** would have reclassified
   throttles as definitely-didn't-happen, the one direction that must not
   happen. The implemented rule is therefore: no `data` key **and** no error
   carrying a capacity code (`THROTTLED`, `INTERNAL_SERVER_ERROR`).
   Codes now also survive into the error text (`Throttled (THROTTLED)`), which
   is the third instance of this doc's "a bare message is not a diagnosis"
   lesson.
   Mutation-verified per leg: dropping the classifier's early return, the
   capacity-code exclusion, or the data-key test each fails exactly one test —
   the rejected-document, throttle, and execution-error cases respectively.
   Package suite 538/538, root typecheck green.
   **Not proven live.** Every mutation document is valid now, so no canary run
   can reach this path without deliberately breaking one, which the item-8 drift
   guard exists to prevent. The unit tests replay the recorded response shapes
   instead — including the exact `Field 'code' doesn't exist on type 'UserError'`
   body from the refund defect.
10. ~~**`issue_store_credit` has never executed against any store.**~~ **Done
    2026-07-25 — it executed, and the run found a third 100%-failure defect,**
    this time in reconciliation rather than in a mutation document. See the
    section below.
    The tool itself was sound on the first try: `status: ok`, `spentCents: 1`,
    "balance is now $0.01 USD" on a customer the harness had just created.
    Two things the `store_credit` family had to decide, both settled in its
    implementation and both still right after the fix:
    - **Each run credits a customer it creates itself.** `probeStoreCredit`
      reconciles on the amount alone, because `StoreCreditAccountCreditInput`
      carries no note or reference field we control — unlike the gift-card probe,
      which matches an operation code encoded in the card. Two $0.01 credits on
      one account would therefore both match and report `unknown` for a run that
      worked: the same shape as the `#1006` trap in item 7, and preventable up
      front rather than after the fact. `createCanaryCustomer` posts a fresh
      tagged `shopkeeper-canary` customer per run, which needs `write_customers`
      — already granted.
    - **The credit is permanent, and that is accepted.** `store-credit.ts` has a
      credit mutation and no debit, so nothing in our code can take one back. The
      answer is not to add a debit mutation to unwind canaries — that widens the
      money surface for no product reason — but to land the $0.01 on a throwaway
      customer who will never check out, which the point above already does.
    The family reports `spentCents` alongside `status`, but unlike `refund_full`
    it adds no harness-side total check: `issueStoreCredit` already downgrades to
    `unknown` unless the committed amount and currency equal what was requested,
    so `ok` is the assertion.
    **Left open:** the run credits `palette-dev` customer `9071668134122` and
    leaves it there by design. Re-running the family is safe at any time — it
    creates a new customer rather than reusing that one.
11. ~~**Cover the probes item 10's lesson left dark.**~~ **Done 2026-07-25, and
    it found two more probes reading Shopify wrongly** — see below. Item 10 ended
    on "reconciliation code is less tested than the code it reconciles" and did
    not act on it. Three of seven probes had zero unit coverage: `probeGiftCard`,
    `probeOrderEdit`, `probeOrderAddress`. `probeGiftCard` was sound and the
    `gift_card` canary had already proven it live; the other two were neither
    unit-tested nor reachable by any canary family, which is the same
    double-dark condition that hid the store-credit defect. All three are now
    covered, and both defects are fixed.
12. ~~**A return that committed could be reported as a flat failure.**~~ **Done
    2026-07-25.** Every other mutating Shopify tool classifies an interrupted
    mutation as `unknown` and says "do not retry"; `create_return` and
    `attach_return_label` had no such branch at all, so a `returnCreate` or
    `reverseDeliveryCreateWithShipping` that committed and then lost the
    connection came back as `error`. That is the retry-inviting direction: a
    second return opened on the order, or a second label sent to the customer.
    Both now set `mutationStarted` immediately before their mutation and return
    `toolUnknown` for an ambiguous failure, so a failure in the read *above* the
    mutation — which committed nothing — keeps the ordinary error path.
    Mutation-verified: never setting the flag fails exactly the two
    interrupted-mutation tests. `createReturn` had no test file at all before
    this; it has one now.
    **Left open, deliberately:** neither tool gets a reconciliation probe, so
    both stay out of `RECONCILABLE_SHOPIFY_MUTATION_TOOLS` and their `unknown`
    outcomes park for human review via `unknown-outcome-sweep`. A probe needs a
    new GraphQL query document, and item 10 is the argument for not shipping one
    that has never run against a real store: `probeStoreCredit` queried valid
    fields and still read every credit wrongly. Writing it belongs with a
    `return_label` canary family and a live `--validate` run, not before one.

### `probeStoreCredit` called every committed credit a no-op (found and fixed 2026-07-25)

The store-credit mutation worked on its first live run. Its **reconciliation
probe** did not, and the canary caught the disagreement in the same output:
`status: ok` with a $0.01 balance, alongside `probeOutcome: no_effect` — "No
store-credit transaction matching $0.01 was found."

`probeStoreCredit` filtered on `transaction.event === "CREDIT"`. Querying the
account directly showed what Shopify actually returns for a credit made by
`storeCreditAccountCredit`: `__typename:
"StoreCreditAccountCreditTransaction"`, `event: "ADJUSTMENT"`. `event` says
*why* the balance moved; `__typename` says *which way*. So the filter matched
nothing, on every store, 100% of the time, since the capability shipped — the
same three words the other two defects in this doc earned.

**This one fails in the expensive direction.** A wrong `no_effect` is not a
stalled action, it is a confident false negative: the probe runs precisely when a
credit came back ambiguous, and `store-credit.ts:135` tells the agent not to
issue a gift-card fallback *until the account is reconciled*. Reconciling to "it
didn't happen" releases that hold, and the next move is a second credit or a
gift card on top of money that already moved. The refund defect reported a
non-event as ambiguous; this one reported a real event as a non-event, which is
the direction product principle 3 cares about.

Fix: filter on `__typename`, and drop `event` from the selection since nothing
reads it. Covered by two tests that replay the recorded `palette-dev` response —
one asserting an `ADJUSTMENT`-event credit reconciles as `committed`, one
asserting a debit of the same amount does not — mutation-verified per leg.
Verified live against the credit the canary had already made: the probe now
returns `committed` / `spentCents: 1` for customer `9071668134122`, with no
second charge.

Two lessons, both new:

- **Item 8 does not cover this class.** Schema validation proves a document is
  *acceptable*, not that our reading of the response is *correct*. Both are
  static-shape mistakes, but a probe that queries valid fields and compares them
  wrongly passes every validator we have. The only thing that caught it was
  running the mutation and the probe against the same real store in one command
  and comparing them — which is now the argument for every future canary family
  reporting both, not just `status`.
- **Reconciliation code is less tested than the code it reconciles.**
  `probeStoreCredit` had *zero* unit coverage before this, while
  `issueStoreCredit` had a suite. That is backwards: the probe is the thing that
  runs when we already know something went wrong.

### Two more probes read Shopify wrongly (found and fixed 2026-07-25)

Covering the three uncovered probes found a defect in two of them. Neither is a
100%-failure like the first three defects, and both are the same underlying
mistake: **a probe reimplemented a comparison the tool it reconciles already
owned, and got it wrong.** Item 8 closed that class for mutation *documents* by
making each one an exported const with a single definition; the probes had no
such rule.

- **`probeOrderAddress` fails a country code.** It compared `address1`, `city`,
  `zip` and `country` with a plain lowercased string equality. Shopify echoes an
  address back with `country: "United States"` and `country_code: "US"`, so an
  input carrying `"US"` — the form the tool's own schema asks for — never
  matched, and every committed address update on such an input reconciled as
  `no_effect`. It also never compared `province` at all, so an update that landed
  in the wrong state read as committed. Both are fixed by calling
  `addressMatches` from `order-address.ts`, which the tool already commits on and
  which handles `province_code` / `country_code` / `country_name` and whitespace.
  It is now exported rather than duplicated. This is a **false negative in the
  same direction as the store-credit probe**: reporting a real change as a
  non-event.
- **`probeOrderEdit` claims an edit it cannot see.** It tested
  `currentQuantity >= requestedQuantity`, but `edit_shopify_order` adds a
  *delta*: `order-edit.ts:290` reconciles against pre-edit quantity **plus** the
  delta with strict equality. The probe has no pre-edit reading, so an order
  already carrying enough of that variant reported a committed edit that had
  never run — a **false positive**, the direction that tells a merchant an item
  was added when it was not. A swap was worse: either half alone satisfied the
  whole check, so a half-applied edit read as fully committed.
  The probe cannot reconstruct pre-edit state, so it no longer pretends to. Each
  leg is now three-valued: a removal is conclusive (the tool refuses to remove a
  variant the order does not carry, so absent-now means it ran), an add is
  conclusive only in the negative (a committed add leaves at least the requested
  quantity, so nothing at all rules it out), and anything else is
  `still_unknown`. A swap needs both legs to agree. The cost is that the common
  add case no longer returns `committed`; that is the point — it never could
  know, and `still_unknown` routes to a human instead of lying.

Mutation-verified per defect: restoring the string-equality comparison fails the
country-name test, restoring `>=` fails the pre-existing-line and swap tests, and
dropping the `province` leg from `addressMatches` fails the wrong-province test —
which is the only test in the package that guards it.

The lesson generalizes past probes: **where a tool and its probe both decide
"did this land?", there must be one predicate, not two.** `probeOrderAddress`
now shares the tool's; `probeOrderEdit` cannot share `order-edit.ts`'s, because
that one needs state the probe does not have — so it says so rather than
approximating it.

### `create_shopify_order` never worked either (found and fixed 2026-07-25)

The `order_creation` family — the last unrun canary, and the only reason A5 was
still blocked — failed on its first execution with
`422 - {"order":["Order tags is invalid"]}`. It is the **fourth** shipped
capability this doc has caught failing 100% of the time since it shipped, and
the third found by running a canary family for the first time.

Shopify caps a tag at 40 characters. The operation tag was
`shopkeeper-op-` (14) plus the raw 36-character idempotency key — **50**. Every
`create_shopify_order` sent one, because `shopifyIdempotencyKey` falls back to a
random UUID when there is no operation id, so there was no path that omitted the
tag and no store on which this worked.

Why nothing caught it earlier:

- **Item 8 could not reach it.** Order creation's write half is REST, not
  GraphQL, so it fails with an HTTP status and was never in the
  document-validation class. The doc already said this; here is what it costs.
- **The unit test asserted the bug.** `shopify.test.ts` checked
  `createBody.order.tags === operationTag` where the expectation was built by
  the same wrong expression as the code — the tag format was hand-reproduced in
  **five** places across two implementations and three tests. Both sides agreed
  on a string Shopify always rejected. This is the sharpest instance yet of "unit
  tests cannot catch this class."
- **Only the canary could, and this family had never run.** Same as
  `issue_store_credit` in item 10.

Two things went **right**, and both are recent work paying off. The 422 carries
an HTTP status, so `isAmbiguousShopifyMutationError` correctly returned false and
the tool reported `error` rather than parking in `unknown` — item 9's
classification behaving exactly as designed on a defect it had never seen. And
`probeOutcome: no_effect` agreed with it, so the mutation and its probe told the
same story, which is the check item 10 argued every family should report.

Fix: one shared `shopifyOperationTag` in `client.ts` — the prefix plus 24 hex
digits of the same digest, 38 characters — replacing all five copies, with the
writer, the probe and every test now reading the single definition. Covered by
tests that pin the length against `SHOPIFY_TAG_MAX_LENGTH`, the per-operation
stability the probe's `tag:` search depends on, and the random-per-call
behavior for an unidentified operation.

The lesson is the one from item 11, arriving again within a day and from the
other direction: **a format shared between a writer and a reader must have one
definition.** There it was a comparison predicate; here it was a string. The
tests hand-reproducing it are what made the duplication invisible.

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

Each row names the event that unblocks it. All of them now wait on traffic, time
or a deliberate choice rather than on work.

| Item | Blocked on | Unblock event |
| --- | --- | --- |
| A5's "Handled" section claiming actions definitely completed | the last canary family — `order_creation` | **Four of five families pass, and all 10 mutation documents are schema-valid** (2026-07-25). `gift_card`: `ok` / `committed`. `refund`: `ok` / `committed` on a $0.01 partial against `#1005`, but only after fixing a defect that made it fail 100% of the time — see the `create_refund` section above, and note it took three runs, one of which wasted a round on a stale `dist`. `refund_full`: `ok` / `committed` against `#1006`, refunded total equal to the order total, closing item 7. `store_credit`: `ok` / `committed` — but `committed` only after fixing a probe that read every real credit as a no-op, which is the one defect this doc has recorded that would have caused a *double* spend rather than a stalled one (item 10). `order_creation` **ran 2026-07-25 and failed**, which is how the fourth 100%-failure defect was found: the operation tag exceeded Shopify's 40-character cap and every order creation came back `422 "Order tags is invalid"` (section above). The tool reported `error` with a `no_effect` probe agreeing — the correct classification, not a false ambiguity. The fix is in and built; **the family still needs one green re-run** before this row can close. Item 8 is closed and took a second 100%-failure defect (`attach_return_label`) with it, so a canary pass means considerably more than it did: the documents behind it are proven, and a new one cannot ship unvalidated. Item 9 also narrows what reaches this section at all: a rejected document now lands in `error`, not `unknown`, so the outcomes A5 has to describe are one class cleaner. |
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
