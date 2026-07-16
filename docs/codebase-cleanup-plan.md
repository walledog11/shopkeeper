# Codebase Cleanup and Optimization Plan

This plan implements the findings in `docs/codebase-audit.md` without turning the application into a conventional helpdesk or changing channel-first product behavior. Tasks are sequenced by merchant/customer risk, not by code aesthetics. Each task should be a small reviewable pull request unless it explicitly says otherwise.

## Sequencing principles

1. Capture the current behavior and failure modes before changing execution semantics.
2. Make irreversible actions single-use before consolidating or renaming surrounding code.
3. Prefer database-enforced correctness over cross-process timing assumptions.
4. Separate provider-specific changes so one integration can roll back independently.
5. Use staged rollout for execution, retry, queue and CSP behavior.
6. Do not remove compatibility code until deployed state/data proves it is unused.

## Phase 0 — Safety checks and baseline tests

### P0-01 — Lock the audit baseline into CI

**Status (2026-07-12): Implementation complete; hosted CI confirmation
pending.** Pull-request CI now runs the structure and repository/package lint
gates, an explicit repository type-check, unit and Node-script tests, the
database-backed combined coverage suite, production build, and the eight-test
auth-bypass Playwright smoke suite. The full local equivalent passes; the first
hosted run remains the release check.

**Local verification checkpoint (2026-07-12):**

- [x] Structure/repository/package lint and repository type-check pass.
- [x] 1,093 unit tests and 30 Node-script tests pass.
- [x] 843 database-backed integration tests pass; 2 cases are skipped by the
  existing suite configuration.
- [x] All 8 auth-bypass Playwright smoke tests pass.
- [x] The production build passes with Sentry uploads explicitly disabled;
  builds without upload credentials no longer install Sentry's post-compile
  release/upload hook.
- [ ] Confirm the same gates on the first hosted pull-request CI run.

- **Related findings:** All; especially AUD-001 through AUD-012.
- **Files likely to change:** root `package.json`; CI workflow files; `scripts/check-critical-coverage.mjs`; possibly test documentation.
- **Proposed implementation:** Ensure pull-request CI runs structure lint, repo/package lint, type-check, unit, Node script, database integration and auth-bypass Playwright smoke tests. Keep live-provider and Clerk-browser suites as separately credentialed release checks.
- **Dependencies:** None.
- **Risk / scope:** Low / Small.
- **Tests required:** The CI commands themselves; prove a deliberately failing fixture is detected before merging the CI change.
- **Rollback considerations:** Revert workflow-only changes if runtime/cost is unacceptable; do not weaken required safety suites silently.
- **Acceptance criteria:** CI reproduces the audit baseline: lint/type-check pass,
  the current legitimate totals of 1,093 unit, 30 script, 843 integration and 8
  smoke tests execute successfully.

### P0-02 — Add a deterministic concurrency and failure-injection harness

**Status (2026-07-12): Completed.** Added a shared promise-driven barrier and
named failure injector with self-tests. Deterministic regression tests now
reproduce separate-lock duplicate execution, stale-plan overwrite, concurrent
daily-cap overspend, fixed-lease expiry overlap, and crash-after-provider
duplicate email delivery without real provider calls or timing sleeps.

- **Related findings:** AUD-001, AUD-002, AUD-003, AUD-004, AUD-005, AUD-006, AUD-007.
- **Files likely to change:** `packages/agent/src/lock/*.test.ts`; gateway planning/operator/outbound tests; dashboard agent route tests; shared test fixtures under `apps/gateway/src/test-fixtures`.
- **Proposed implementation:** Add controllable barriers around plan generation, provider calls, lock expiry and post-provider persistence. Support two simultaneous callers and injected crashes/errors at named phases without real network calls.
- **Dependencies:** None; design the harness so later ledger tests can reuse it.
- **Risk / scope:** Low / Medium.
- **Tests required:** Harness self-tests proving both callers reach the intended barrier and failures occur at the selected phase.
- **Rollback considerations:** Test-only; revert if it makes suites nondeterministic.
- **Acceptance criteria:** The current implementation can deterministically reproduce stale-plan overwrite, two-authority approval, cap race and post-send crash gaps before fixes are applied.

## Phase 1 — Make plan approval and action execution single-use

### P1-01 — Add a durable plan/action execution ledger

**Status (2026-07-12): Completed for reviewed-plan execution.** Migration
`20260712000000_add_plan_execution_ledger` adds durable identity, status/claim
fields, database constraints, tenant relations, and `AgentAction.executionId`
linkage. Dashboard edited approval, quick approval, gateway auto-execution, and
Telegram/iMessage pending-plan approval now create and claim the durable intent
before any approved tool reaches a provider, then record committed, failed, or
unknown terminal state. Free-form operator-event durability remains P4-03's
separate scope.

- **Related findings:** AUD-001, AUD-003, AUD-004, AUD-012.
- **Files likely to change:** `packages/db/prisma/schema.prisma`; a new migration; `packages/agent/src/agent-actions.ts` or a new `execution-ledger.ts`; shared types/exports.
- **Proposed implementation:** Add a plan execution entity with stable `planId`, organization/thread/source-message IDs, plan/instruction hashes, status (`pending`, `claimed`, `committed`, `failed`, `unknown`), claim token/timestamps and approver metadata. Enforce a unique key that makes one reviewed plan single-use. Keep `AgentAction` as per-tool audit rows linked to the execution.
- **Dependencies:** P0-02; product decision on retention/recovery visibility.
- **Risk / scope:** High / Large.
- **Tests required:** Migration tests, duplicate claim, concurrent claim, tenant mismatch, status-transition constraints, crash/recovery transitions.
- **Rollback considerations:** Additive migration first. Roll back application use while leaving the table dormant; do not drop data in the same release.
- **Acceptance criteria:** Exactly one caller can claim a plan across independent processes/Redis instances, and every mutation has a durable intent before its provider call.

### P1-02 — Revalidate and claim atomically before execution

**Status (2026-07-13): Completed; production shadow observation in progress.** All
reviewed-plan entry points use the shared claim service, including dashboard
Concierge approval/auto-execution. The legacy gateway pre-approved execution
bypass has been removed. Stored-plan claim transactions lock the tenant-owned
thread and revalidate its identity before the one-winner transition.
Duplicate/stale callers and duplicate tool-call IDs make no external call;
plan hashes and tool-input comparisons are stable across PostgreSQL JSONB key
ordering; whole-turn ambiguity records `unknown` and cannot be replayed. The
`PLAN_EXECUTION_LEDGER_MODE=off|shadow|enforce` rollback/canary rail is implemented
for both runtimes, with production validation requiring an explicit mode.
The production database reports all 52 migrations applied. Commit `92d9333`,
which contains the ledger implementation, is deployed to the Vercel dashboard
and both Railway gateway services. `PLAN_EXECUTION_LEDGER_MODE=shadow` is set
for the dashboard, gateway web service, and separate gateway worker; dashboard,
database, Redis, worker, and queue health checks pass. The first strict 24-hour
production audit passed with no repeated observations, unknown outcomes, or
stale claims, but contained zero executions. Keep the shadow window open until
real reviewed-plan traffic exercises both hosts; an empty audit is schema and
deployment evidence, not enforcement evidence.

- **Related findings:** AUD-001, AUD-002, AUD-012.
- **Files likely to change:** `packages/agent/src/plan-execution.ts`, `turn.ts`; `apps/dashboard/src/app/api/agent/route.ts`, `quick-approve/route.ts`; `apps/gateway/src/message-handlers/execute-operator-agent-turn.ts`, `pending-plan-actions.ts`.
- **Proposed implementation:** Move current-message/plan/hash validation into the execution-claim service. Claim before running any approved tool; reject consumed/stale claims consistently from dashboard, auto-execution, Telegram and iMessage. Stop relying on cache consumption in `finally` as the single-use mechanism.
- **Dependencies:** P1-01.
- **Risk / scope:** High / Large.
- **Tests required:** Dashboard versus gateway race, auto versus human race, stale customer message, changed settings, subset approval, retry after known no-op failure, unknown provider outcome.
- **Rollback considerations:** Feature flag ledger enforcement (`off`, `shadow`, `enforce`). Shadow mode must log divergence without blocking.
- **Acceptance criteria:** All execution entry points use one claim API and a duplicate/stale approval produces no external call.

### P1-03 — Give pending operator plans a stable identity and resolve every device

**Status (2026-07-12): Completed; live multi-device verification pending.** New
pending-plan JSON carries plan ID, source message ID, plan hash, and instruction
hash while legacy readers remain compatible. Approval and dismissal resolve the
same plan across every organization context with conditional JSON predicates;
newer unrelated parked state is preserved. Stale, duplicate, failed, and unknown
claims are made non-actionable on every device. Database-backed tests cover
same-plan fan-out, newer-plan preservation, legacy conditional cleanup, and
claim rejection.

- **Related findings:** AUD-001, AUD-007, AUD-020.
- **Files likely to change:** `apps/gateway/src/operator-context.ts`; `message-handlers/planning-notifications.ts`, `pending-plan-actions.ts`, `operator-ledger.ts`; Telegram/iMessage plan tests; Prisma schema only if normalized references replace JSON.
- **Proposed implementation:** Store `planId`, source message ID and hashes in `PendingPlan`. After claim/decision, clear or mark the same plan resolved in all organization contexts, not only the approving chat. Preserve unrelated newer pending state with conditional updates.
- **Dependencies:** P1-01/P1-02.
- **Risk / scope:** Medium-high / Medium.
- **Tests required:** Three devices, simultaneous approve/reject, newer plan arriving during cleanup, legacy pending-plan JSON parsing.
- **Rollback considerations:** Readers must accept both old and new JSON shapes during rollout. Remove compatibility parsing only after a data audit.
- **Acceptance criteria:** A decision on one device makes the same plan non-actionable everywhere without erasing a newer plan.

### P1-04 — Make locks a shared latency guard with renewal

- **Related findings:** AUD-001, AUD-015.
- **Files likely to change:** `packages/agent/src/lock/redis-lock.ts`; dashboard/gateway lock adapters; environment/deployment documentation.
- **Proposed implementation:** After ledger enforcement, either point both hosts at one lock authority or retain host-local locks only for duplicate-work suppression. Add token-checked renewal/lease loss handling for long turns. Correctness must remain with the database claim.
- **Dependencies:** P1-02.
- **Risk / scope:** Medium / Medium.
- **Tests required:** Renewal, release after lease loss, Redis outage, run over 90 seconds, process termination.
- **Rollback considerations:** Disable renewal/shared-lock optimization without disabling ledger claims.
- **Acceptance criteria:** A long execution cannot silently overlap because a lease expired, and Redis topology is documented unambiguously.

## Phase 2 — Prevent stale/redundant planning and normalize AI contracts

### P2-01 — Coalesce per-thread summary jobs and conditionally commit plans

**Status (2026-07-12): Implementation complete; queue canary pending.** Inbound
summary jobs carry the source customer-message ID and use BullMQ debounce mode
per thread, replacing a delayed job with the newest payload while retaining a
trailing run behind an active worker. Plan writes use one SQL conditional update
that accepts only the latest non-note customer message; operator notification
rechecks the stable cached-plan identity, and stale planners are discarded before
publish, auto-execution, or notification. Deterministic and database-backed tests
cover out-of-order planners, superseded jobs, newest-source commits, and handled
threads.

- **Related findings:** AUD-002, AUD-014.
- **Files likely to change:** `apps/gateway/src/message-handlers/inbound-persistence.ts`, `generate-thread-plan.ts`, `ai-summary-flow.ts`; `workers/ai-summary.ts`; queue constants/types/tests.
- **Proposed implementation:** Put source message ID/cache generation in job data, use a stable per-thread job identity or explicit trailing-edge coalescer, and conditionally update/notify only if the expected source message remains current. Recheck immediately before auto-execution/notification.
- **Dependencies:** P0-02; preferably P1-02 before enabling auto-execution changes.
- **Risk / scope:** Medium-high / Medium.
- **Tests required:** Blocked first plan plus second inbound, out-of-order completion, burst of messages, worker replicas, failed job followed by trailing job, business-hours branches.
- **Rollback considerations:** Feature flag coalescing separately from conditional stale-write rejection; stale rejection is safe to keep.
- **Acceptance criteria:** Only the newest customer message can produce a cached/notified/executed plan, and bursts produce at most the defined bounded model calls.

### P2-02 — Bound intelligence context and validate classifier output

- **Related findings:** AUD-014.
- **Files likely to change:** `apps/gateway/src/message-handlers/intelligence.ts`, `email-classification.ts`; `packages/agent/src/context.ts`; classifier/prompt tests and eval fixtures.
- **Proposed implementation:** Use a bounded recent-message window plus prior summary, cap KB/article/message characters by a measured token budget, and share a schema for allowed tag/status/language/text lengths. Record prompt/input token metrics by purpose.
- **Dependencies:** P2-01 for clean sequencing; agent quality baseline/evals.
- **Risk / scope:** Medium / Medium.
- **Tests required:** Long threads/articles, invalid structured output, multilingual text, quality/cost eval comparison.
- **Rollback considerations:** Keep old context builder behind an evaluation flag until quality thresholds pass.
- **Acceptance criteria:** Prompt size has a hard bound, invalid tags cannot persist, and evaluation quality remains within the agreed threshold while token use declines on long threads.

## Phase 3 — Strengthen irreversible Shopify action safety

### P3-01 — Classify Shopify retries and reconcile ambiguous mutations

**Status (2026-07-13): Local implementation complete; rollout incomplete.** The
shared Shopify client now retries
safe GET reads once by default and never implicitly retries POST/PUT/DELETE;
mutation retries require an explicit call-site override backed by an operation-
specific idempotency/reconciliation decision. Refunds now use Shopify 2026-04's
required GraphQL idempotency directive with a stable execution/tool identity,
retry the protected request once after transport/5xx ambiguity, and require
successful payment transactions before reporting committed success.
Cancellations take a preflight state snapshot and reconcile an ambiguous REST
response with a follow-up order read without replaying the cancellation. Order
creation now carries a deterministic per-tool operation tag, checks for an
existing tagged order before mutation, and reconciles ambiguous responses with
a tag-filtered order lookup instead of replaying the create request. These paths
return and persist an explicit `unknown` outcome when they cannot prove success,
and later actions in the same plan (especially customer confirmation) are
suppressed. Multi-step order-address updates now preflight fulfillment and
customer ownership, avoid already-applied writes, reconcile ambiguous order and
customer-address PUTs with follow-up reads, and surface a second-step failure as
partial/`unknown` rather than successful completion. Order editing now treats
its begin/stage/commit workflow as distinct mutation phases: interrupted staging
is never replayed, partial staged swaps are `unknown`, and interrupted commits
are reconciled against current order quantities. Store-credit ambiguity is
`unknown` and explicitly suppresses gift-card fallback. Gift cards use a stable,
provider-unique code derived from the reviewed tool operation, validate the
created card, and treat a taken stable code as a possible prior commit instead
of minting another card. Local unit, lint, and repository type checks pass;
provider sandbox/canary verification and durable follow-up recovery are still
open.

**Completed locally (verified 2026-07-13):**

- [x] Safe GETs retry once; POST/PUT/DELETE do not retry implicitly after
  transport errors, 429s, or 5xx responses.
- [x] Reviewed executions provide a stable per-tool operation identity for
  provider idempotency keys.
- [x] `create_refund` uses GraphQL `refundCreate` with Shopify's required
  `@idempotent` key, reuses the same key and variables for its one protected
  retry, and reports success only when refund transactions are `SUCCESS` and
  the committed amount is present.
- [x] `cancel_order` snapshots cancellation state before its REST mutation,
  never retries the cancellation POST, and reconciles an ambiguous response
  with a follow-up order read.
- [x] `create_shopify_order` uses a stable execution/tool tag, returns an
  existing matching order on replay, never retries the create POST, and
  reconciles an ambiguous response through Shopify's tag-filtered order query.
- [x] `update_shopify_order_address` validates fulfillment and customer
  ownership before mutation, reconciles each PUT independently, and treats
  unresolved or partial multi-step completion as `unknown`.
- [x] `edit_shopify_order` validates the requested final variant quantities,
  never replays an interrupted begin/staging/commit mutation, reports partial
  staged swaps as `unknown`, and reconciles an ambiguous commit through a
  current-order read.
- [x] `issue_store_credit` validates the committed transaction identity and
  amount, returns `unknown` after transport/429/5xx ambiguity, and prevents an
  unconfirmed credit from falling through to a gift-card replacement.
- [x] `create_gift_card` supplies a stable high-entropy provider code per
  reviewed tool operation, validates the returned card, and treats ambiguity or
  a taken stable code as `unknown` without issuing another card.
- [x] The Shopify order-update and customer-address provider contracts were
  revalidated before implementing the address reconciliation path.
- [x] Tool, action-audit, plan-execution, dashboard, and analytics contracts
  carry an explicit `unknown` outcome.
- [x] An `unknown` mutative outcome suppresses every later tool in that plan,
  preventing a customer reply or follow-up mutation from claiming completion.
- [x] Dashboard review/timeline/action chips and product analytics distinguish
  unknown outcomes instead of rendering them as successful or merely blocked.
- [x] Deterministic coverage includes 429, commit-then-503, connection loss
  after request write, same-key replay, GraphQL user errors, pending refund
  transactions, cancellation read-after-write reconciliation, already-cancelled
  preflight, order/customer address reconciliation, partial address completion,
  fulfilled-order/customer-ownership rejection, interrupted order-edit
  begin/stage/commit phases, partial staged swaps, current-quantity commit
  reconciliation, store-credit response mismatch and fallback suppression,
  stable gift-card replay/taken-code handling, and customer-confirmation
  suppression.
- [x] The 1,093-test repository unit suite, repository typecheck, affected-
  package lint, focused Shopify safety tests, 13 agent integration tests, strict
  isolated local plan-execution audit, and diff check pass.

**Still required for P3-01 rollout completion:**

- [ ] Verify refund idempotency plus cancellation, order creation/editing,
  address, gift-card, and store-credit outcome handling against a Shopify
  development store, then canary each tool family independently.
- [ ] Define recovery ownership and durable follow-up reconciliation for
  outcomes that remain `unknown` after the immediate retry/read.
- [x] Run the remaining tool families' deterministic commit-before-response,
  connection-loss, 429/5xx, provider-error, replay, and partial-operation tests.

P3-01 is complete for local code and deterministic-test purposes. Do not mark
its rollout complete until both unchecked items above are complete.

- **Related findings:** AUD-003, AUD-015.
- **Files likely to change:** `packages/agent/src/shopify/client.ts`; mutation modules under `packages/agent/src/shopify`; execution ledger/reconciliation worker; tool tests.
- **Proposed implementation:** Retry safe reads by default; require explicit mutation retry policy. Add provider idempotency identifiers where supported and per-tool reconciliation queries. Return `unknown` when commit status cannot be proven. Start with refund, cancel, order creation/edit, gift card and store credit.
- **Dependencies:** P1-01/P1-02; provider contract research/sandbox.
- **Risk / scope:** High / Large.
- **Verification completed:** Refund commit-then-503, connection loss after
  request write, 429, GraphQL user error, same-key replay, pending payment
  outcome, cancellation reconciliation, order-creation preflight/reconciliation
  without mutation replay, multi-step address reconciliation/partial completion,
  order-edit stage/commit interruption and reconciliation, store-credit fallback
  suppression, stable-code gift-card replay protection, and suppression of later
  actions after `unknown`.
- **Verification remaining:** Provider sandbox/canary for every completed
  family; recovery-worker tests and operational ownership for durable `unknown`
  reconciliation.
- **Rollback considerations:** Roll out tool by tool behind a mutation-policy flag; preserve old client for reads during migration.
- **Acceptance criteria:** No high-risk mutation is blindly retried after an ambiguous response; every outcome is committed, failed-before-side-effect, or explicitly unknown/reconcilable.

### P3-02 — Reserve goodwill/refund budget atomically

**Status (2026-07-13): Production migration applied; canary rollout pending.** An
additive reservation ledger now claims daily goodwill capacity under a locked
organization/day row before a refund, store-credit, or gift-card provider call.
Reservations use the stable execution/tool operation key, retain the tool and
input needed for reconciliation, commit verified provider amounts exactly once,
release known no-side-effect failures, and continue to consume capacity while
the provider outcome is `unknown`. Reused operation keys cannot issue a second
provider call or silently change input. Database-backed coverage proves the
former concurrent $6 + $6 against a $10 cap race now admits one provider call,
unknown reservations hold capacity until reconciliation, and repeated commits
do not double-count spend. Per-tool canary evidence and operational recovery of
stale/unknown reservations remain rollout gates. Run
`npm run audit:refund-spend-reservations -- --hours=24` during rollout;
`--strict` fails on any stale reservation or `unknown` outcome. The strict audit
passes against the isolated local test database. The first strict 24-hour
production baseline also passed, but contained zero reservations; it does not
replace the per-tool canary observation window.

**Completed locally (verified 2026-07-13):**

- [x] Added the `RefundSpendReservationStatus` lifecycle and additive
  `refund_spend_reservations` migration with tenant relation, state/amount
  constraints, operation-key uniqueness, and recovery indexes.
- [x] Applied all 52 migrations successfully to the isolated local test
  database, including the later additive outbound-send claim migration.
- [x] Serialized cap decisions on the organization/day spend row before any
  refund, store-credit, or gift-card provider call.
- [x] Keyed reservations to the stable execution/tool operation identity and
  rejected reuse with a different tool, requested amount, or canonical input.
- [x] Committed verified provider amounts exactly once, released known
  no-side-effect outcomes, and retained `unknown` outcomes against the cap.
- [x] Moved spend accounting out of individual order-tool definitions and into
  the shared executor lifecycle so every capped entry point uses the same
  reserve/finalize contract.
- [x] Added deterministic database coverage for concurrent cap admission,
  unknown-cap retention and release, idempotent commit, and operation-input
  mismatch rejection. The former concurrent $6 + $6 against a $10 cap now
  produces one provider call, one policy block, and $6 committed spend.
- [x] Added explicit UTC day-rollover and provider-success/budget-finalization-
  failure coverage. A finalization failure remains `unknown` and continues to
  hold capacity rather than being reported as success or released.
- [x] Replaced the first-writer Prisma upsert with PostgreSQL
  `INSERT ... ON CONFLICT DO NOTHING` before the daily row lock. Deterministic
  first-use concurrency no longer leaks a unique-key error before cap admission.
- [x] Added `audit:refund-spend-reservations` reporting for status totals,
  stale reservations, and unknown outcomes; its strict local audit passes.
- [x] Re-ran all 1,093 unit tests, 30 Node-script tests, and 843 database-backed
  integration tests (2 existing skips), plus repository typecheck, affected
  lint, and diff validation.

**Still required for P3-02 rollout completion:**

- [x] Deploy the additive migration before the application build in production.
- [ ] Canary refund, store-credit, and gift-card reservations independently and
  observe cap totals plus duplicate suppression against Shopify development
  stores.
- [ ] Assign recovery ownership and prove the runbook/worker that reconciles
  stale or `unknown` reservations to `committed` or `released`.
- [ ] Run the strict reservation audit through the production observation
  window with no unexplained stale or `unknown` rows.

- **Related findings:** AUD-004.
- **Files likely to change:** `packages/db/refund-spend.ts`; Prisma schema/migration for reservations or ledger link; `packages/agent/src/tools/executor.ts`; order registry tools.
- **Proposed implementation:** Atomically reserve cents under the daily cap before external work, keyed to execution/tool intent. Commit/release/reconcile reservation based on known provider outcome.
- **Dependencies:** P1-01 and P3-01 outcome model.
- **Risk / scope:** High / Medium.
- **Tests required:** Concurrent boundary requests, rollover, provider no-op/known failure/unknown/success, fallback from store credit to gift card. **Concurrency, reservation lifecycle, idempotency, identity mismatch, rollover, post-provider finalization failure, and the existing provider-outcome/fallback suites pass; provider canaries and recovery-runbook verification remain.**
- **Rollback considerations:** Shadow-compute reservations first; retain current counter as a reporting value during transition.
- **Acceptance criteria:** Concurrent actions cannot exceed the configured cap, and successful provider spend cannot disappear because a later counter update failed. **Met locally; production canary and recovery evidence remain.**

## Phase 4 — Improve integration and webhook reliability

### P4-01 — Make outbound email claimable, tenant-validated and recoverable

**Status (2026-07-13): Production migration and application deployment complete;
provider canaries and reconciliation runbook pending.** Additive message claim
fields support a conditional `pending -> processing` transition with a claim
token and separate provider-attempt timestamp. The gateway uses the database
claim as the cross-worker correctness boundary and `messageId` as the stable
BullMQ job ID. Retained failed/completed jobs are replaced only for an explicit
retry; active jobs are deduplicated. Queue admission and execution both verify
the organization/message/thread/email-integration relationship. Gmail and
Postmark senders now return their provider message IDs, and async sends carry a
stable per-message RFC `Message-ID` for provider-side correlation.

Postmark's official provider contract does not offer idempotency keys. The
worker therefore does not blindly retry after a provider attempt: transport,
5xx, malformed-success, and interrupted post-acceptance outcomes become
`unknown`; an interrupted pre-attempt claim is the only stale processing state
returned to retryable `failed`. The dashboard renders processing and unknown
states separately and does not offer retry for unknown delivery. Deterministic
coverage proves one provider call under concurrent jobs, no second call after
crash-after-acceptance, stable queue/provider identity, full tenant mismatch
rejection, known configuration failure, ambiguous failure, stale-claim
recovery, and manual retry compatibility. The full local unit, Node-script,
database integration, lint, typecheck, migration, and strict isolated-database
audit gates pass.

**Still required for P4-01 rollout completion:**

- [x] Deploy `20260714000000_add_outbound_send_claims` before the application
  build.
- [ ] Canary Postmark and Gmail independently with duplicate enqueue,
  crash-after-acceptance, stale processing, provider-ID persistence, and manual
  retry observation.
- [ ] Document who checks provider activity and who may resolve an `unknown`
  send; no automatic resend is allowed without positive no-send evidence.
- [ ] Keep the synchronous email rollback rail until the async canary and stale-
  claim observation window are clean.

- **Related findings:** AUD-005, AUD-010, AUD-012.
- **Files likely to change:** dashboard `email-dispatch.ts`, `enqueue-outbound-email.ts`; gateway `internal-queue.ts`, `message-handlers/outbound-email.ts`, `maintenance/outbound-send-sweep.ts`; message schema/migration if status/claim fields change.
- **Proposed implementation:** Use `messageId` as stable BullMQ `jobId`; validate all ownership; atomically claim delivery with a token; generate a stable provider message identity; reconcile stale processing and expose committed/failed/unknown state to the dashboard.
- **Dependencies:** P0-02; provider idempotency decision; coordinate UI with P7-01.
- **Risk / scope:** High / Large.
- **Tests required:** Concurrent jobs, crash after send, mismatched IDs, stale claim, manual retry, sweep, provider-config errors.
- **Rollback considerations:** Keep synchronous email as the explicit rollback rail until async acceptance criteria hold in production.
- **Acceptance criteria:** Repeated enqueue/crash cannot intentionally issue a second provider send, and no cross-tenant ID combination is accepted.

### P4-02 — Replace Stripe claim-before-work with durable event processing

- **Related findings:** AUD-006.
- **Files likely to change:** `apps/dashboard/src/app/api/billing/webhook/route.ts`; Prisma schema/migration; billing tests.
- **Proposed implementation:** Persist Stripe event ID/type/time/status, process idempotently, mark completed only after subscription state commits, and make analytics best-effort/post-commit. Reject stale out-of-order state changes using event/customer/subscription ordering data.
- **Dependencies:** None beyond migration review.
- **Risk / scope:** Medium-high / Medium.
- **Tests required:** Failure at each phase, duplicate, out-of-order events, analytics outage, Redis outage/removal.
- **Rollback considerations:** Additive event table; old Redis key can remain during a transition but must not suppress failed durable events.
- **Acceptance criteria:** A failed event is retried, a completed event is not re-applied, and older events cannot overwrite newer billing state.

### P4-03 — Queue operator-channel messages before acknowledgement

**Status (2026-07-15): Telegram + iMessage implementations complete (flag-gated)
with the recovery sweep; production rollout pending.** A durable `OperatorEvent`
table (migration `20260715020000_add_operator_events`) with a unique
`(channel, providerMessageId)` key and a claim-state CHECK constraint backs the
new path. Behind `OPERATOR_DURABLE_QUEUE_TELEGRAM` / `OPERATOR_DURABLE_QUEUE_IMESSAGE`,
each webhook resolves the binding, persists the event, enqueues
`QUEUE.OPERATOR_EVENT`, and only then acknowledges; the synchronous handler
remains the default fallback per channel. For iMessage the DB unique key replaces
the prior Redis-only dedupe, binding maintenance (connect-code/re-bind/space
refresh) stays synchronous, and ingest failures propagate so Photon redelivers.
The webhook and worker share one `ingestAndEnqueueOperatorEvent` (enqueue-healing)
and one per-channel `sendOperatorEventReply`, so the two channels cannot drift.
The operator-event worker claims each event exactly once (pending→claimed),
re-validates the binding at claim time (P5-01), runs the existing turn, and records
committed/failed with turn commit tracked separately from reply delivery
(`replyText`/`replyDeliveredAt`) so a stuck confirmation can be re-sent without
re-running the side-effectful turn. The unique key absorbs provider redeliveries;
the claim absorbs crash-after-ack (a claimed event is never auto-replayed —
free-form operator turns carry no plan claim, so this is their only single-use
guard).

The `operator-event-sweep` maintenance job (15-min, registered like
`outbound-send-sweep`) is the recovery backstop: it reconciles `claimed` rows
older than 10 min (above the worker stall interval and max turn duration, so it
never races a live turn) to `unknown` — keeping the claim token and setting
`processedAt` to satisfy the terminal-state CHECK — and re-sends committed rows
whose reply never reached the provider (own `processedAt` cutoff to stay clear of
the worker's commit→deliver window). It is channel-agnostic, so it also closes
Telegram's undelivered-reply recovery, and emits `opsAlert: true` when it
reconciles or leaves anything unhealed (the P6-02 monitoring hook, mirroring
`outbound-send-sweep`). Deterministic and database-backed coverage: dedupe,
single-winner claim, claim-token-guarded finalize, crash-after-claim non-replay,
binding revocation, provider reply failure, failed-turn recording, persist-before-ack
ingestion (both channels), iMessage missing-space handling, stale-claim
reconciliation, delivery-window guard, and re-send success/failure. The full
gateway unit + integration suite passes.

**Still required for P4-03 rollout completion:**

- [ ] Document the recovery runbook: who reviews `unknown` operator events. The
  sweep marks a claim `unknown` after 10 min, but until P4-06 external-fetch
  deadlines land a still-hung turn can be reconciled while live — so `unknown`
  means "may have partially acted," not "did nothing." On-call must check
  `replyText`/`replyDeliveredAt` and the `AgentAction` audit trail before
  assuming nothing happened; never blindly re-drive it.
- [ ] Canary Telegram, then iMessage; verify ack timing, duplicate suppression,
  and crash recovery in production before broadening.
- [ ] (Follow-up, optional) Add the `OPERATOR_EVENT` processing queue to
  queue-health monitoring if ingestion-backlog alerts are wanted; today only the
  sweep alerts (matching `outbound-send-sweep`).

- **Related findings:** AUD-001, AUD-007.
- **Files likely to change:** gateway Telegram/Photon webhook routes and handlers; new operator-inbox queue/worker; Prisma schema/migration or durable BullMQ job IDs; presence/reply adapters.
- **Proposed implementation:** After signature and binding resolution, persist/enqueue one provider event with stable ID, then acknowledge. Process through the execution ledger and emit result/failure replies asynchronously.
- **Dependencies:** P1-02/P1-03.
- **Risk / scope:** High / Large.
- **Tests required:** Ack timing, duplicate, crash, ordering, binding revoked after enqueue, partial action, provider reply failure.
- **Rollback considerations:** Roll out per channel, starting with Telegram; retain synchronous handler behind a short-lived flag.
- **Acceptance criteria:** Acknowledged merchant instructions are durably recoverable and each provider message has at most one committed control action.

### P4-04 — Flatten Meta webhook batches

- **Related findings:** AUD-008.
- **Files likely to change:** `apps/gateway/src/routes/webhooks-meta.ts`, `message-handlers/channels.ts`, inbound job types/tests.
- **Proposed implementation:** Normalize all entries/events after signature verification and enqueue one message job per event with stable job/provider IDs.
- **Dependencies:** None; can ship as a quick isolated fix.
- **Risk / scope:** Medium / Small.
- **Tests required:** Multi-entry/multi-message/mixed echo/malformed/different-page payloads and duplicate `mid`.
- **Rollback considerations:** Revert normalization module; inbound database idempotency protects replay during rollback.
- **Acceptance criteria:** Every valid event in a batch is persisted exactly once.

### P4-05 — Apply route-specific body and attachment budgets

- **Related findings:** AUD-009.
- **Files likely to change:** `apps/gateway/src/index.ts`, `routes/webhooks.ts`, provider webhook routes, `routes/webhooks-email.ts`, blob upload helper, runtime config/env examples.
- **Proposed implementation:** Mount small/default JSON parsers per router, provider-sized raw body limits for signed routes, and a separate Postmark parser. Add attachment count, decoded-byte, type and concurrency limits.
- **Dependencies:** Product decision on supported attachment contract.
- **Risk / scope:** Medium / Medium.
- **Tests required:** Boundary sizes for every route, large invalid signature, attachment budget/type, partial upload cleanup.
- **Rollback considerations:** Limits should be configurable for emergency increases; retain metrics on rejected size/type.
- **Acceptance criteria:** Non-email routes cannot allocate a 50 MB parsed body and email payloads exceeding the documented contract fail clearly before upload fan-out.

### P4-06 — Add deadlines and typed timeout classification to external fetches

- **Related findings:** AUD-015.
- **Files likely to change:** `packages/email/src/gmail/client.ts`; gateway `clients/meta-graph.ts`; dashboard OAuth/internal fetch helpers; shared tests/config.
- **Proposed implementation:** Add integration-specific `AbortSignal.timeout`/controller wrappers, typed retryability and duration telemetry. Do not combine this with mutation retries.
- **Dependencies:** None; keep provider changes separate PRs.
- **Risk / scope:** Medium / Medium.
- **Tests required:** Hanging/slow fetch, abort cleanup, safe retry classification, no retry for mutations.
- **Rollback considerations:** Provider-specific timeout env/config can temporarily increase deadlines.
- **Acceptance criteria:** Every production external HTTP call has an explicit deadline and classified timeout behavior.

## Phase 5 — Strengthen validation, authorization and tenant invariants

### P5-01 — Enforce ownership at internal and message-write boundaries

**Status (2026-07-13): Local implementation complete; production mismatch
observation pending.** `createMessage()` always loads the parent thread, derives
its organization, and rejects a conflicting caller-supplied organization.
Dashboard thread tools scope reads and writes by thread plus organization; the
internal provider-send hop derives the organization name from that owned
thread. Gateway outbound-email admission and execution validate the complete
organization/message/thread/integration product before enqueue or provider
access. Database-backed cross-tenant tests prove mismatched replies, status
updates, escalations, message writes, queued sends, and worker jobs produce no
provider call or cross-tenant mutation.

- **Related findings:** AUD-005, AUD-010, AUD-016.
- **Files likely to change:** dashboard internal send route/thread tools; gateway internal queue/outbound worker; `packages/db/index.ts`; related tenant tests.
- **Proposed implementation:** Load root objects with organization predicates, derive downstream organization IDs, assert parent relationships, and reject mismatches. Make `createMessage()` verify or derive organization rather than trusting a redundant caller field.
- **Dependencies:** None; coordinate with P4-01 to avoid duplicate edits.
- **Risk / scope:** Medium / Medium.
- **Tests required:** Full cross-product mismatch matrix and valid same-tenant calls.
- **Rollback considerations:** Add diagnostics before strict rejection if production inconsistency is suspected.
- **Acceptance criteria:** No internal path can combine objects from different organizations, even with a valid service secret.

### P5-02 — Decide and implement the member/admin permission matrix

- **Related findings:** AUD-011.
- **Files likely to change:** `apps/dashboard/src/lib/api/route.ts`/`clerk-route.ts`; org, integration, billing, OAuth and data routes; UI visibility; authorization tests.
- **Proposed implementation:** Product/security owners classify permissions. Add a shared `requirePermission`/role-aware route option and enforce it server-side; UI hiding is secondary.
- **Dependencies:** Explicit product decision and existing-team migration/communication.
- **Risk / scope:** High / Large.
- **Tests required:** Route-by-role matrix, direct requests, stale session role, admin/member UI.
- **Rollback considerations:** Feature flag enforcement for existing organizations if needed; never rely on UI-only rollback.
- **Acceptance criteria:** Every sensitive operation has an explicit documented permission and tests prove server enforcement.

### P5-03 — Audit and then enforce relational tenant consistency

- **Related findings:** AUD-016.
- **Files likely to change:** read-only audit script; Prisma schema; one or more staged SQL migrations; central write helpers.
- **Proposed implementation:** Query production for mismatched parent/tenant pairs, repair through an approved backfill, then add compound foreign keys/check triggers where feasible. Keep migrations table-specific and reversible.
- **Dependencies:** P5-01; database backup/copy; migration review.
- **Risk / scope:** High / Large.
- **Tests required:** Migration against copied production data, cascade/set-null behavior, query plans, cross-tenant insert rejection.
- **Rollback considerations:** Add constraints `NOT VALID`, validate separately, and drop individually if necessary; never delete inconsistent rows automatically.
- **Acceptance criteria:** Consistency audit is clean and the database rejects new mismatches for prioritized high-risk tables (`Message`, `Thread`, `AgentAction`, KB relations).

### P5-04 — Define and correct the active thread/escalation state model

**Status (2026-07-16): Product decision resolved; app layer implemented; historical
backfill staged.** Decision: escalation is an **orthogonal flag, not a `pending`
lifecycle status** — the ticket stays `open`. An additive `escalated_at` column
(`Thread`, migration `20260716000000_add_thread_escalated_at`) records the handoff.
Both `escalateToHuman` sinks (gateway `agent-thread-sink.ts`, dashboard
`lib/agent/tools/thread.ts`) now keep the thread `open` and set `escalated_at`
instead of flipping it to `pending`. Because escalated threads stay `open`,
`inbound-persistence.ts` correlates a customer follow-up to the same ticket (no
second, context-less thread) and it stays visible in the `open` inbox with no
route change; `escalated_at` rides in the existing thread response for the inbox
badge / A5 "Waiting on you" to consume. Gateway unit + dashboard integration
escalation tests updated; a gateway integration test proves the follow-up
correlates to the escalated thread rather than splitting. `escalated_at` is
additive and deploy-safe.

**Still required (staged):**

- [ ] Backfill historical `pending` threads to `open` + `escalated_at`. It is a
  separate, audited migration because a `pending` thread whose customer already
  has an `open` thread would create two open threads and violate the
  `threads_one_open_per_customer` (`WHERE status='open'`) unique index. Run
  `npm run audit:escalation-backfill -- --strict` first; it lists collision
  groups to resolve and exits non-zero while any remain.
- [ ] Retire `pending` from the support-planner surface **with the eval gate**:
  the `update_thread_status` tool still offers `pending`
  (`registry/helpers.ts` `threadStatuses`) and the `escalate_to_human` tool
  description still says "Marks the thread as pending". Both are prompt bytes, so
  they were intentionally left unchanged here (A3 precedent) and need an eval run.
- [x] Escalated threads suppress auto-execute. Because they now stay `open`, a
  customer follow-up would otherwise re-trigger autonomous execution on a ticket
  flagged for a human. `generateThreadPlan` gates auto-execute on
  `!thread.escalated_at` (`requireOrgThread` now selects the field): the merchant
  still gets the plan/notification, but the agent never auto-acts until the flag
  is cleared. Clearing the flag (de-escalation) is a future action, not yet built.

- **Related findings:** AUD-023.
- **Files likely to change:** gateway/dashboard `escalateToHuman` sinks; `inbound-persistence.ts`; `/api/threads/route.ts`; inbox query/presentation types; Prisma schema and the active-thread unique index migration.
- **Proposed implementation:** Product owners define whether `pending` is active-awaiting-merchant or obsolete. If active, correlate inbound messages to open or pending threads, expose pending in the inbox, and enforce one active thread. If escalation is orthogonal, keep the thread open and store escalation state separately. Audit/resolve historical open+pending pairs before constraints.
- **Dependencies:** Product decision; read-only production data audit; coordinate with P5-03 migrations.
- **Risk / scope:** High / Large.
- **Tests required:** Escalate then customer follow-up, list/detail/operator flows, resolve/reopen, historical duplicate handling, concurrent inbound creation.
- **Rollback considerations:** Stage list visibility separately from correlation/constraint changes; retain a reversible mapping for migrated statuses.
- **Acceptance criteria:** An escalated customer follow-up remains in one visible conversation with complete context, and the database prevents a second active thread for the same tenant/customer/channel.

## Phase 6 — Database/query performance and operational visibility

### P6-01 — Correct compound pagination and bound thread-list responses

- **Related findings:** AUD-013.
- **Files likely to change:** `apps/dashboard/src/lib/messaging/thread-list-query.ts`, `/api/threads/route.ts`, `usePaginatedThreads.ts`, types/tests.
- **Proposed implementation:** Introduce a versioned cursor encoding `lastMessageAt` and ID, use matching lexicographic SQL/Prisma predicates, add a default page size, and move full history to thread detail requests.
- **Dependencies:** None.
- **Risk / scope:** Medium / Medium.
- **Tests required:** Random UUIDs, equal timestamps, concurrent insertion, old/invalid cursor, response limits.
- **Rollback considerations:** Accept old ID cursors temporarily or invalidate with an explicit 400/reload path.
- **Acceptance criteria:** Paging returns every row once in stable sort order and no list request returns unbounded histories.

### P6-02 — Monitor every business-critical queue and formalize failed-job recovery

- **Related findings:** AUD-017.
- **Files likely to change:** `apps/gateway/src/maintenance/queue-health.ts`, `workers/failure.ts`, health routes, runbooks, alert verification scripts.
- **Proposed implementation:** Add outbound-email, Gmail sync and order-review queues with tailored thresholds; protect detailed diagnostics; document ownership/replay and connect `opsAlert` evidence to paging.
- **Dependencies:** Idempotent replay behavior from P1/P4 for mutating/sending jobs.
- **Risk / scope:** Low-medium / Medium.
- **Tests required:** Synthetic waiting/failed/stuck jobs per queue, alert windows, auth on detailed health, replay fixture.
- **Rollback considerations:** Disable noisy queue thresholds individually, not the entire health worker.
- **Acceptance criteria:** A stalled customer-facing queue raises an actionable alert and on-call has a safe documented recovery path.

## Phase 7 — Make frontend state reflect backend execution truth

### P7-01 — Replace optimistic “Sent” with committed/failed/partial/unknown states

- **Related findings:** AUD-003, AUD-005, AUD-012.
- **Files likely to change:** `useActionPlanReviewState.ts`, `useConversationAgentFlow.ts`, `conversation-agent-requests.ts`, plan card/body components, agent API response contracts.
- **Proposed implementation:** Make approval callbacks awaitable; render running state; consume ledger/action outcomes; retain recovery context for failed/partial/unknown plans; announce status accessibly.
- **Dependencies:** P1-01/P1-02; provider outcome semantics from P3/P4.
- **Risk / scope:** Medium-high / Medium.
- **Tests required:** All outcome states, double click, reload/navigation, partial tools, screen-reader live region, successful linger behavior.
- **Rollback considerations:** Keep the old card layout while switching its state source; avoid simultaneous visual redesign.
- **Acceptance criteria:** The UI never says sent/done before the server reports committed success and gives a safe next action for every other state.

### P7-02 — Extract frontend orchestration only when behavior work touches it

- **Related findings:** AUD-022.
- **Files likely to change:** onboarding flow hook, `ConversationView`, `OrdersBoard`, cache coordinator as naturally encountered.
- **Proposed implementation:** Extract pure reducers/state machines and request adapters with focused tests. Do not launch a standalone size-based refactor.
- **Dependencies:** Relevant feature task.
- **Risk / scope:** Low-medium / Small per extraction.
- **Tests required:** Existing behavior plus reducer transition tests and visual smoke where needed.
- **Rollback considerations:** One extraction per PR makes revert straightforward.
- **Acceptance criteria:** Each extraction reduces mixed responsibility or duplicated state logic and has a concrete test/maintenance benefit.

## Phase 8 — Low-risk consolidation, dependency and browser hardening

### P8-01 — Remove gateway read-tool source-of-truth duplication

**Status (2026-07-12): Completed.** The canonical registry now exports
`READ_TOOL_NAMES` and `isReadToolName`; gateway ledger and skip numbering use
the predicate, and the hard-coded gateway set is removed. Coverage includes
the formerly omitted product search, tracking, and support-stats reads.

- **Related findings:** AUD-020.
- **Files likely to change:** `apps/gateway/src/constants.ts`, `routes/telegram/pending-plan-commands.ts`, `message-handlers/operator-ledger.ts`; package exports/tests.
- **Proposed implementation:** Import the canonical registry-derived read predicate/list and delete the gateway hard-coded set.
- **Dependencies:** None.
- **Risk / scope:** Low / Small.
- **Tests required:** Registry completeness and mixed-plan skip/ledger tests.
- **Rollback considerations:** Simple revert; unknown tools remain actionable/visible.
- **Acceptance criteria:** Adding a read tool to the agent registry requires no gateway constant update.

### P8-02 — Upgrade Spectrum through a compatibility branch

- **Related findings:** AUD-019.
- **Files likely to change:** `apps/gateway/package.json`, lockfile, Spectrum client/webhook adapters and tests.
- **Proposed implementation:** Follow 4.x-to-9.x migration guidance, update adapters, run all iMessage suites and a real sandbox test, then stage deployment.
- **Dependencies:** Provider sandbox and rollback artifact.
- **Risk / scope:** Medium-high / Medium.
- **Tests required:** Signature/webhook, all content variants, binding, operator/customer sends, graceful shutdown, oversized baggage memory case.
- **Rollback considerations:** Lock prior package/lockfile and make deployment immediately reversible.
- **Acceptance criteria:** `npm audit` no longer reports the OpenTelemetry chain and iMessage contracts pass in sandbox/production canary.

### P8-03 — Stage an enforced CSP

- **Related findings:** AUD-018.
- **Files likely to change:** `apps/dashboard/next.config.js`, instrumentation/layout/script integrations, CSP reporting tests/runbook.
- **Proposed implementation:** Analyze report-only telemetry, remove production `unsafe-eval`, add nonces/hashes, canary enforcement, then switch the header.
- **Dependencies:** Sentry/Clerk/PostHog compatibility testing and violation endpoint/telemetry.
- **Risk / scope:** Medium-high / Medium.
- **Tests required:** Production build Playwright across auth, dashboard, analytics, Sentry and OAuth.
- **Rollback considerations:** Revert to report-only header without removing telemetry.
- **Acceptance criteria:** Enforced CSP blocks an injected script fixture while all supported flows function without unexpected violations.

### P8-04 — Normalize query/status validation without changing stored semantics

- **Related findings:** AUD-014, AUD-021 and consistency observations.
- **Files likely to change:** `/api/threads/route.ts`, shared API validation utilities, status/tag contracts and tests.
- **Proposed implementation:** Parse query enums/limits/cursors with shared schemas and return 400 for invalid values. Inventory free-form persisted statuses before considering database enums.
- **Dependencies:** Coordinate cursor work with P6-01.
- **Risk / scope:** Low / Small.
- **Tests required:** Invalid/valid enum, boundary limits, backward-compatible stored values.
- **Rollback considerations:** Revert parser only; do not combine with database enum migration.
- **Acceptance criteria:** Invalid public/API input cannot reach Prisma/raw SQL as an unchecked cast.

## Phase 9 — Documentation, observability and verified retirement

### P9-01 — Resolve compatibility naming and documentation drift

- **Related findings:** AUD-021.
- **Files likely to change:** `README.md`, environment examples, operator-context comments, production/channel runbooks.
- **Proposed implementation:** Update implemented-channel status and current operator semantics. Clearly label legacy queue IDs as storage/deployment compatibility names.
- **Dependencies:** None for docs.
- **Risk / scope:** Low / Small.
- **Tests required:** Documentation link/env checker where applicable.
- **Rollback considerations:** None beyond revert.
- **Acceptance criteria:** A new engineer can identify current customer/operator channels and understands why legacy identifiers remain.

### P9-02 — Verify and remove only proven dead compatibility code

- **Related findings:** AUD-021 and dead-code candidates.
- **Files likely to change:** Sentry example routes/flag, deprecated URL alias, legacy purge/normalization code, sync email path—only the candidates proven unused.
- **Proposed implementation:** Assign an owner to each candidate, gather production env/data/job evidence, remove one compatibility surface per PR with its tests/docs/config.
- **Dependencies:** Candidate-specific rollout completion; never batch unrelated retirements.
- **Risk / scope:** Variable / Small per candidate.
- **Tests required:** Production config scan, data count, repeatable-job listing or route/runbook confirmation as applicable.
- **Rollback considerations:** Preserve the prior release/config and data migration path; queue renames require explicit old-job removal and recreation.
- **Acceptance criteria:** Every deletion includes positive evidence of non-use and no compatibility candidates are removed by inference alone.

## Quick wins

These can proceed while the durable-execution design is reviewed, provided they remain separate pull requests:

1. P8-01: derive gateway read tools from the canonical registry. **Completed 2026-07-12.**
2. P4-04: process every Meta batch event.
3. P5-01's internal ownership assertions that do not overlap outbound-email state changes.
4. P6-01: fix compound cursor correctness and default list limits.
5. Validate classifier tags and query enum inputs from P2-02/P8-04.
6. Expand queue-health monitoring from P6-02.
7. P9-01: documentation/comment corrections.

“Quick win” does not mean deploy without tests; Meta and tenant-boundary changes still need focused integration coverage.

## Changes that should be grouped together

- P1-01, P1-02 and P1-03 form one architectural safety program. **Implementation completed 2026-07-12; additive staged rollout remains.**
- P3-01 and P3-02 share the action outcome/reservation model, though each provider tool should be a separate rollout unit.
- P4-01 and P7-01 must agree on outbound/execution state semantics.
- P2-01's stale-plan rejection and operator notification recheck ship together. **Implementation completed 2026-07-12; queue canary remains.**
- P5-01 and P5-03 share tenant invariants, but application assertions should precede database constraints.

## Changes that must remain separate

- Spectrum dependency upgrade must not be combined with operator webhook durability or iMessage product changes.
- CSP enforcement must not be combined with general frontend component refactors.
- Queue/job renames must not be bundled with queue-health monitoring.
- Role/permission changes must not be hidden inside route cleanup.
- Escalation/thread-status semantics must not be changed inside an unrelated inbox refactor.
- Shopify retry changes should be separate by mutation family and separate from read-client performance work.
- Dead-code removal candidates should be one PR each, not a bulk deletion.

## Changes that should not be attempted yet

- A broad rewrite of agent orchestration, the dashboard, or the gateway.
- Replacing BullMQ/Prisma/Next.js merely to solve local correctness gaps.
- Removing synchronous email before asynchronous send recovery is proven.
- Renaming live WhatsApp/email legacy queue IDs without repeatable-job migration.
- Removing old operator-context parsing or legacy purge code before production data checks.
- Converting every free-form status field to a database enum in one migration.
- Shared/distributed Shopify rate limiting before telemetry shows provider throttling at current scale.
- Large component extraction based only on line count.

## Product decisions required

- Member versus admin permission matrix (P5-02).
- Supported attachment count, size and content types (P4-05).
- Merchant UX and recovery authority for `unknown` external actions (P1/P3/P7).
- Meaning of `pending` and whether escalation is a thread status or a separate active state (P5-04).
- Whether failed known-no-op plans remain approvable or require regeneration.
- Retention and visibility of execution/webhook inbox records.
- Completion criteria/date for async-email-only operation.
- Whether Sentry diagnostic routes remain part of operations.

## Database migrations required

- Durable plan/action execution ledger (P1-01). **Migration created, locally
  verified, and confirmed applied in production on 2026-07-13.**
- Goodwill/refund reservations (P3-02). **Migration created, locally verified,
  and confirmed applied in production on 2026-07-13.**
- Outbound send claims (P4-01). **Migration
  `20260714000000_add_outbound_send_claims` was applied successfully to the
  isolated local test database and confirmed applied in production on
  2026-07-13.**
- Durable Stripe event processing (P4-02).
- Operator inbox/event persistence (P4-03). **Migration
  `20260715020000_add_operator_events` created and locally verified (Telegram +
  iMessage paths); not yet applied in production.**
- Compound tenant constraints after audit/backfill (P5-03).
- Active-thread constraint/state migration if `pending` remains active (P5-04).

All should be additive first. Destructive cleanup belongs in later releases after application rollback windows close.

## Staged rollout or feature flags required

| Change | Suggested stages |
| --- | --- |
| Execution ledger | `off -> shadow claim/divergence logging -> enforce for dashboard -> enforce operator/auto` |
| Shopify mutation policy | Per-tool canary; reads unchanged; `unknown` reconciliation observed before broad enablement |
| AI coalescing | Stale-write rejection immediately; debounce/coalescing canary with token/latency/quality metrics |
| Operator durable queue | Telegram canary, then iMessage; retain synchronous fallback briefly |
| Outbound email claims | Test tenant/canary, monitor stale-processing recovery, then make async default |
| RBAC | Audit/log denied-would-be actions, communicate, then enforce |
| CSP | Report-only telemetry, canary enforcement, broad enforcement |
| Spectrum upgrade | Sandbox, one gateway canary, broad rollout |

## Recommended next implementation phase

**Progress (2026-07-13):** P0-02, P1-01 through P1-03, P2-01, P3-01/P3-02,
P4-01, and P5-01 have complete local implementations. All 52 migrations are
applied in production, and the cleanup implementation is deployed on commit
`92d9333`. The Vercel dashboard and both Railway gateway services are explicitly
in ledger `shadow` mode and healthy. The first strict 24-hour production audit
passed but contained zero executions, so real-traffic observation, claim/recovery
review, provider and queue canary evidence, and live multi-device verification
remain rollout prerequisites. P4-01 now provides one-winner email delivery
claims, tenant validation, stable queue/provider identity, explicit unknown
delivery, and stale-claim recovery; provider canaries and the provider-activity
runbook remain open. P3-01's shared retry/unknown
outcome contract plus refund, cancellation, order creation/editing, order
address, gift-card, and store-credit handling are locally complete; provider
canaries and durable recovery ownership remain. Run
`npm run audit:plan-executions -- --hours=24` to report repeated shadow
observations, unknown outcomes, and stale claims; `--strict` makes any such
finding fail the command. The production shadow observation window remains open
until the audit includes representative dashboard and gateway executions.

Next:

1. ~~Deploy the additive ledger migration before the enforcing application
   build.~~ **Completed 2026-07-13.**
2. Both hosts are explicitly in `shadow` and the initial strict audit is clean.
   Keep the observation window open until it contains representative executions,
   then review repeated observations before enforcing dashboard.
3. Canary gateway enforcement on Telegram, then iMessage/auto-execution; verify one
   multi-device decision and `unknown` recovery visibility.
4. Canary the AI-summary debounce and confirm newest-message notification plus
   bounded model-call metrics.
5. Sandbox/canary the completed P3-01 refund, cancellation, order-creation,
   order-address, order-editing, gift-card, and store-credit paths, one tool
   family at a time, and define the durable reconciliation owner for outcomes
   that remain `unknown`.
6. The additive goodwill-reservation migration is deployed. Canary
   refund/store-credit/gift-card cap enforcement and monitor
   stale or `unknown` reservations with
   `npm run audit:refund-spend-reservations -- --hours=24 --strict` until their
   recovery procedure is proven.
7. The P4-01 outbound-send claim migration and state machine are deployed.
   Canary Postmark/Gmail while keeping synchronous email as the rollback rail
   until unknown reconciliation and stale-claim monitoring are proven.
8. P4-03 durable operator-event ingestion is implemented for Telegram and
   iMessage (each behind its `OPERATOR_DURABLE_QUEUE_*` flag), with the
   `operator-event-sweep` recovery job reconciling stale claims and re-sending
   undelivered replies. Next: deploy the additive `operator_events` migration,
   canary the Telegram durable path, then the iMessage path, and write the
   `unknown`-event recovery runbook. Do not broaden natural-language ticket sends
   until that rollout and P4-01's are complete.
