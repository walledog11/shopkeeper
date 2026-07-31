# Codebase Cleanup and Optimization Plan

This plan implements the findings in `docs/codebase-audit.md` without turning the application into a conventional helpdesk or changing channel-first product behavior. Tasks are sequenced by merchant/customer risk, not by code aesthetics. Each task should be a small reviewable pull request unless it explicitly says otherwise.

## Sequencing principles

1. Capture the current behavior and failure modes before changing execution semantics.
2. Make irreversible actions single-use before consolidating or renaming surrounding code.
3. Prefer database-enforced correctness over cross-process timing assumptions.
4. Separate provider-specific changes so one integration can roll back independently.
5. Use staged rollout for execution, retry, queue and CSP behavior.
6. Do not remove compatibility code until deployed state/data proves it is unused.

## Closeout status

**Current checkpoint (2026-07-29): implementation is complete for the original
correctness findings. The agent-rollout evidence gates are complete and
dashboard-first ledger enforcement is active; the remaining work is its
observation window, operator/auto enforcement, and the standalone closeout
tracks below.** The Shopify OAuth scope snapshot and P4-05 attachment hardening are
deployed, and the P2-01 reconciliation fix plus rollout harnesses are deployed
from local release `d7d88edc`; Vercel and both Railway services are healthy.
Production has all 62 migrations applied, including the previously missed additive
`20260723000000_add_operator_pending_plans` migration.

The 240-hour production audits are clean for Stripe (one
completed event), Gmail outbound delivery (one sent message with provider
identity), operator events (14 first-claim committed/delivered events: 10
Telegram and 4 iMessage), plan-execution duplication/unknown/stale claims, and
unknown-outcome recovery. The reservation audit is also clean but contains zero
reservations, so it is baseline evidence rather than a canary. The plan-execution
ledger now has eight human-approved rows: six shadow observations remain
`pending`, while the dashboard-enforced internal canary and first representative
reviewed `send_reply` are `committed`. There is no
repeated observation, unknown outcome, or stale claim. Two historical
`search_kb` → `send_reply`
observations are supplemented by host-identified, internal-only dashboard and
gateway canaries. The canonical gateway and dashboard observations each linked
one successful `add_internal_note` AgentAction to one observation-count-1
execution; two earlier gateway harness attempts also executed successfully but
failed only their note-count assertions while the harness distinguished the
tool note from the normal turn-audit note. The two AI-summary jobs that
failed solely because Anthropic credit was exhausted were revalidated against
their still-current source messages and retried in place on 2026-07-28. Both
completed: one classified its thread as filtered without generating a plan, and
one persisted a current cached plan and delivered its merchant notification.
The queue is now 0 waiting, 0 active, and 0 failed, and the authenticated
production verifier is green.

To close this plan:

1. **Agent rollout:** the P2-01 newest-message canary, reversible P2-02
   `enforce` canary, P1-04 renewed long turn, and host-specific dashboard plus
   gateway shadow-ledger canaries are complete. P1-02 dashboard enforcement is
   active and its internal-only claim canary passed. Keep it dashboard-only
   through a clean 24-hour window containing representative reviewed dashboard
   traffic; then enforce the public gateway and worker together and repeat the
   canary/audit sequence. Keep the documented rollback rail and strict audit
   running through each stage.
2. **Shopify safety:** the controlled `cancel_order`,
   `edit_shopify_order`, `update_shopify_order_address`, and fulfilled-order
   `create_return` → `attach_return_label` canaries are complete. Separately
   exercise refund/store-credit/gift-card reservation admission and finish a
   strict observation window containing real reservation rows.
3. **Outbound email:** mailbox receipt and exact-once reconciliation are
   complete. Exercise the documented
   crash-after-acceptance/stale-processing/manual-retry paths without blind
   resend, decide the async-only date, and canary Postmark when a Postmark
   integration exists. Until then, keep the synchronous rollback rail.
4. **Presentation and timeout evidence:** P7-01 authenticated
   committed/known-failure/unknown browser checks are complete. Close P4-06
   after the normal provider-timeout telemetry window.
5. **Standalone security tracks:** complete or move P8-02 Spectrum/OpenTelemetry
   and P8-03 enforced CSP into separately owned plans with their existing
   acceptance criteria. They must not disappear when this document is removed.
   P8-03's nonce migration landed 2026-07-30 and its enforcement blocker was
   resolved and verified the same day (0 violations under an enforced policy);
   what travels with the track is the remaining flip: observe deployed
   report-only telemetry, then set `reportOnly: false`.
6. **Retirement and decisions:** P9-02 backlog is owned in
   [compatibility-retirement-backlog.md](compatibility-retirement-backlog.md);
   first retirement (Sentry example routes) landed 2026-07-30. Continue one
   surface per PR with positive non-use evidence.

This document can be deleted once items 1–4 are complete and items 5–6 are
either complete or copied into owned, durable plans/issues. P7-02 is explicitly
opportunistic guidance and does not block deletion.

## Phase 0 — Safety checks and baseline tests

### P0-01 — Lock the audit baseline into CI

**Status (2026-07-19): Completed, including hosted CI confirmation.**
Pull-request CI now runs the structure and repository/package lint
gates, an explicit repository type-check, unit and Node-script tests, the
database-backed combined coverage suite, production build, and the eight-test
auth-bypass Playwright smoke suite. The full local equivalent passes; the first
hosted run remains the release check.

**Local verification checkpoint (2026-07-20):**

- [x] Structure/repository/package lint and repository type-check pass.
- [x] 1,253 unit tests and 38 Node-script tests pass.
- [x] 993 database-backed integration tests pass; 3 cases are skipped by the
  existing suite configuration.
- [x] All 9 auth-bypass Playwright smoke tests pass, including the focused
  gateway-to-dashboard `send_reply` hop canary.
- [x] The production build passes with Sentry uploads explicitly disabled;
  builds without upload credentials no longer install Sentry's post-compile
  release/upload hook.
- [x] Confirm the hosted workflow gates. Master run `29711158806` completed
  successfully with secret scan, unit/Node tests, lint/audit/typecheck, build,
  integration/coverage, and E2E jobs all green.

- **Related findings:** All; especially AUD-001 through AUD-012.
- **Files likely to change:** root `package.json`; CI workflow files; `scripts/check-critical-coverage.mjs`; possibly test documentation.
- **Proposed implementation:** Ensure pull-request CI runs structure lint, repo/package lint, type-check, unit, Node script, database integration and auth-bypass Playwright smoke tests. Keep live-provider and Clerk-browser suites as separately credentialed release checks.
- **Dependencies:** None.
- **Risk / scope:** Low / Small.
- **Tests required:** The CI commands themselves; prove a deliberately failing fixture is detected before merging the CI change.
- **Rollback considerations:** Revert workflow-only changes if runtime/cost is unacceptable; do not weaken required safety suites silently.
- **Acceptance criteria:** CI reproduces the audit baseline: lint/type-check pass,
  the current legitimate totals of 1,253 unit, 38 script, 993 integration and 8
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

**Current checkpoint (2026-07-29):** the strict 240-hour audit contains six
human-approved shadow observations and no repeated observations, unknown
outcomes, or stale claims. All rows remain `pending`, as expected in shadow.
Controlled production-environment canaries now identify both host paths:
gateway execution `7c2eefca-e62d-423a-b07f-0a04e3fea185` and dashboard
execution `f066c88d-9d91-47bf-8a6f-bd0d50cb2d5a` each persisted one successful
internal-only `add_internal_note` action linked to one observation-count-1
execution, with no model or customer/operator provider call. During this work,
Vercel's ledger variable was found empty (which resolves to `enforce`), replaced
with an explicit non-sensitive `shadow` value, redeployed, and verified alongside
the two Railway hosts. The evidence gate is complete; proceed with dashboard-
first staged enforcement rather than enabling all entry points at once.

**Gateway enforcement stage (2026-07-30):** After pre-promotion verifier and
strict audits passed, both Railway services (`shopkeeper` public gateway and
`Gateway Worker`) were set to `PLAN_EXECUTION_LEDGER_MODE=enforce`. Gateway
canary execution `345be6f6-555e-4cde-9e1e-961fca91cb22` committed with
`observationCount=0`, populated claim/completion timestamps, one linked
successful `add_internal_note` action, and no error. Post-promotion strict
24-hour audits report one `committed` row and no repeated observations,
unknown outcomes, or stale claims. Hold a normal 24-hour observation window with
representative gateway/operator traffic before treating rollout complete;
rollback is configuration-only on each Railway service.

**Dashboard enforcement stage (2026-07-29):** Vercel is explicitly
`PLAN_EXECUTION_LEDGER_MODE=enforce`. Internal-only dashboard execution
`6fdec37f-e92a-4115-b909-c8a226464fe4` atomically claimed and completed as
`committed`, kept `observationCount=0`, populated `claimedAt` and `completedAt`,
recorded no error, and linked one successful `add_internal_note` action. The
post-canary strict audit contains seven human-approved rows (six shadow
`pending`, one enforced `committed`) with no repeated observations, unknown
outcomes, or stale claims; the unknown-outcome audit and production verifier
also pass. The first representative reviewed dashboard execution
`9bbe5f42-4da9-4f89-ad13-e10a7b167d49` then committed one successful
`send_reply` with `observationCount=0`, populated claim/completion timestamps,
and no error. The strict audits now contain eight human-approved rows (six
shadow `pending`, two enforced `committed`) with no blockers before gateway
promotion. The representative execution committed at 2026-07-29 14:46 PDT
(2026-07-29T21:46:25Z); gateway promotion followed on 2026-07-30 after the
documented pre-check audits passed.

- **Related findings:** AUD-001, AUD-002, AUD-012.
- **Files likely to change:** `packages/agent/src/plan-execution.ts`, `turn.ts`; `apps/dashboard/src/app/api/agent/route.ts`, `quick-approve/route.ts`; `apps/gateway/src/message-handlers/execute-operator-agent-turn.ts`, `pending-plan-actions.ts`.
- **Proposed implementation:** Move current-message/plan/hash validation into the execution-claim service. Claim before running any approved tool; reject consumed/stale claims consistently from dashboard, auto-execution, Telegram and iMessage. Stop relying on cache consumption in `finally` as the single-use mechanism.
- **Dependencies:** P1-01.
- **Risk / scope:** High / Large.
- **Tests required:** Dashboard versus gateway race, auto versus human race, stale customer message, changed settings, subset approval, retry after known no-op failure, unknown provider outcome.
- **Rollback considerations:** Feature flag ledger enforcement (`off`, `shadow`, `enforce`). Shadow mode must log divergence without blocking.
- **Acceptance criteria:** All execution entry points use one claim API and a duplicate/stale approval produces no external call.

### P1-03 — Give pending operator plans a stable identity and resolve every device

**Status (2026-07-20): Completed; live multi-device dismissal verified.** New
pending-plan JSON carries plan ID, source message ID, plan hash, and instruction
hash while legacy readers remain compatible. Approval and dismissal resolve the
same plan across every organization context with conditional JSON predicates;
newer unrelated parked state is preserved. Stale, duplicate, failed, and unknown
claims are made non-actionable on every device. Database-backed tests cover
same-plan fan-out, newer-plan preservation, legacy conditional cleanup, and
claim rejection. A production canary parked one stable plan identity across the
bound Telegram and iMessage contexts; an iMessage `no` committed on its first
claim, delivered the dismissal reply, cleared both contexts, and created no
`PlanExecution`.

- **Related findings:** AUD-001, AUD-007, AUD-020.
- **Files likely to change:** `apps/gateway/src/operator-context.ts`; `message-handlers/planning-notifications.ts`, `pending-plan-actions.ts`, `operator-ledger.ts`; Telegram/iMessage plan tests; Prisma schema only if normalized references replace JSON.
- **Proposed implementation:** Store `planId`, source message ID and hashes in `PendingPlan`. After claim/decision, clear or mark the same plan resolved in all organization contexts, not only the approving chat. Preserve unrelated newer pending state with conditional updates.
- **Dependencies:** P1-01/P1-02.
- **Risk / scope:** Medium-high / Medium.
- **Tests required:** Three devices, simultaneous approve/reject, newer plan arriving during cleanup, legacy pending-plan JSON parsing.
- **Rollback considerations:** Readers must accept both old and new JSON shapes during rollout. Remove compatibility parsing only after a data audit.
- **Acceptance criteria:** A decision on one device makes the same plan non-actionable everywhere without erasing a newer plan.

### P1-04 — Make locks a shared latency guard with renewal

**Status (2026-07-29): Complete, including the production long-turn
observation.** Both
Upstash and ioredis lock adapters now renew a held lease with a
token-checked Redis script at one-third of its TTL. A failed/unknown renewal
marks the lease lost and emits a warning; release is idempotent and can never
delete a successor's lock. Deterministic tests cover a long-running renewal,
ownership loss, successor-safe release, Redis outage, and fail-open/fail-closed
acquisition. The production runbook now documents the intentional topology:
dashboard Upstash and gateway Railway Redis remain separate latency guards,
while PostgreSQL execution/event/reservation claims own cross-host correctness.
No shared Redis migration is required. Release `ca72dcbe` is live on the Vercel
dashboard, Railway public gateway, and Railway worker with healthy service
checks. A controlled 36-second turn through the production ioredis adapter
observed TTL 90 at acquisition and TTL 88 after the 30-second renewal point,
blocked a contender, removed the key on release, and allowed a successor.

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

**Status (2026-07-29): Complete, including the production queue canary.** Inbound
summary jobs carry the source customer-message ID and use BullMQ debounce mode
per thread, replacing a delayed job with the newest payload while retaining a
trailing run behind an active worker. Plan writes use one SQL conditional update
that accepts only the latest non-note customer message; operator notification
rechecks the stable cached-plan identity, and stale planners are discarded before
publish, auto-execution, or notification. Deterministic and database-backed tests
cover out-of-order planners, superseded jobs, newest-source commits, and handled
threads. The production canary deliberately enqueued an older source-message
payload after the newer message. It exposed a worker-replica ordering gap: the
stale-write guard prevented a wrong plan but could leave the newest request
without a plan. The worker now reconciles a queued source ID to the latest
persisted customer message before planning. In the repeat canary, job `109`
carried the older ID, the deployed worker logged the reconciliation, and the
only cached plan referenced the newer ID.

- **Related findings:** AUD-002, AUD-014.
- **Files likely to change:** `apps/gateway/src/message-handlers/inbound-persistence.ts`, `generate-thread-plan.ts`, `ai-summary-flow.ts`; `workers/ai-summary.ts`; queue constants/types/tests.
- **Proposed implementation:** Put source message ID/cache generation in job data, use a stable per-thread job identity or explicit trailing-edge coalescer, and conditionally update/notify only if the expected source message remains current. Recheck immediately before auto-execution/notification.
- **Dependencies:** P0-02; preferably P1-02 before enabling auto-execution changes.
- **Risk / scope:** Medium-high / Medium.
- **Tests required:** Blocked first plan plus second inbound, out-of-order completion, burst of messages, worker replicas, failed job followed by trailing job, business-hours branches.
- **Rollback considerations:** Feature flag coalescing separately from conditional stale-write rejection; stale rejection is safe to keep.
- **Acceptance criteria:** Only the newest customer message can produce a cached/notified/executed plan, and bursts produce at most the defined bounded model calls.

### P2-02 — Bound intelligence context and validate classifier output

**Status (2026-07-29): Complete through the reversible production `enforce`
canary; all three hosts are restored to `shadow`.** The canonical classifier
contract now owns the five
allowed tags, exact two-letter language normalization, and explicit title,
summary, and reason character limits. Gateway parsing rejects unknown tags,
invalid classifications, missing/non-string core fields, and prevents oversized
model text from reaching persisted thread fields. Existing leniency remains for
additive intent/language signals: malformed optional values safely normalize to
empty/all-false rather than dropping an otherwise valid classification.

`AGENT_CONTEXT_BUDGET_MODE=off|shadow|enforce` now gates shared hard budgets for
recent messages, prior summaries, KB articles/search results, store/brand/sample
context, order context, operator ledger, classifier input, and instructions.
Shadow mode preserves legacy prompts while logging privacy-safe character/token
estimates by purpose; enforce mode supplies only bounded context. Unit and
database-backed long-thread/article tests pass. A real-model long-thread eval
preserved the expected plan and reduced prompt tokens by at least the required
20%. The production runbook defines aligned dashboard/gateway/worker shadow,
long-thread canary, and rollback steps. The full committed eval-suite check and
deployed shadow observation are rollout gates rather than missing implementation.

**Eval/production checkpoint (2026-07-28):** credit-dependent evaluation is
complete without updating the committed baseline. Two fresh real-model
legacy-versus-enforce comparisons preserved the expected plan and reduced
prompt tokens by 70.8% (76,629 → 22,353) and 41.5% (76,721 → 44,897),
comfortably above the required 20%. The first completed three-repeat cadence
scored 217/222 (97.7%), above the committed 216/222 (97.3%) baseline, but exposed
contradictory tracking guidance when `brand-voice-cheers-signoff` made an
unnecessary read in all three attempts. The support/operator prompts and
tracking-tool contract now require both a fulfilled order and an explicit need
for tracking detail; focused unit tests pass 116/116 and the fixture passes 3/3.

The post-fix complete cadence again scored 217/222 (97.7%), with hard-gated
fixtures at 175/177 (98.9%), advisory fixtures at 42/45 (93.3%), brand voice at
6/6, and no provider-credit failures. Vitest originally reported a false timeout
after an otherwise-passing 3/3 failure-injection fixture spent 943 seconds in
provider backoff; its per-repeat allowance is now 360 seconds, and a focused
three-repeat confirmation passes. The only full-cadence misses were stochastic:
one conservative exchange escalation, one watch-tier classification, and three
non-blocking full-tier cancellation advisory attempts that added an unwanted
refund.

**Production canary (2026-07-29):** equivalent 61-message synthetic threads in
the isolated E2E organization produced the same one-step `send_reply` plan with
the same instruction hash in `shadow` and `enforce`. Bounded classifier input
retained the prior summary and newest customer request. Thread-intelligence
input fell 65.3% (11,395 → 3,958 tokens), and planning input fell 61.8%
(14,385 → 5,496 tokens). The Vercel dashboard, Railway public gateway, and
Railway worker were aligned during the canary, passed the production verifier,
then were restored to aligned `shadow` and passed it again.

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

**Status (2026-07-29): Implementation deployed; live-schema validation and all
planned provider mutation-family canaries complete.** The shared Shopify client now retries
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
of minting another card. Local unit, lint, and repository type checks pass.
**Durable follow-up recovery is now implemented (2026-07-21):** the
`unknown-outcome-sweep` maintenance job read-probes ambiguous mutations left in
`unknown`, moves proven committed/no-effect outcomes to terminal states, and
reconciles stale `claimed` executions — never replaying an approved plan. The
P3-01 provider rollout gate is complete.

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

- [x] Verify every currently executable canary family and validate the Shopify
  document registry against the live schema. **Completed 2026-07-26:** all five
  staged families pass on `palette-dev` with agreeing reconciliation probes:
  `gift_card`, partial `refund` (`#1005`), `refund_full` (`#1006`, committed
  total matched the order), `store_credit`, and `order_creation` (`#1009`).
  All ten mutation documents are schema-valid through the no-side-effect
  `@skip(if: true)` validation path, and the query registry/source completeness
  guard is committed in `query-documents.test.ts`. The canaries exposed and
  drove fixes for four always-failing provider paths and three incorrect
  reconciliation probes; the detailed incident history remains in
  `docs/archive/agent-behavior-and-expansion-plan-2026-07.md`.
- [x] Complete provider rollout evidence for `cancel_order`,
  `edit_shopify_order`, `update_shopify_order_address`, and fulfilled-order
  `create_return` + `attach_return_label`. **Completed 2026-07-29:** the harness
  gained a `--test-orders-only` safety mode that requires an explicit supported
  `--only` family, creates a fresh `test: true` order, and never selects a live
  or pre-existing order. Separate runs passed on `palette-dev`: cancellation
  (`#1013`), remove-only edit with one retained line (`#1014`), order plus
  customer-default-address synchronization (`#1015`), and fulfilled return plus
  attached label/tracking (`#1016`). Every tool returned `ok`, every independent
  probe returned `committed`, the customer address matched, and the two-step
  return family ran both steps. The no-side-effect live-schema pass also
  validated all 12 mutation cases and 11 registered query documents.
- [x] Persist the granted scope set at install. **Deployed 2026-07-28:** the
  Shopify token exchange normalizes the returned `scope` set into
  `Integration.metadata.oauthScopes`. Reconnects replace that scope snapshot
  while preserving unrelated metadata, and an omitted scope field does not
  erase a prior snapshot. Existing installs remain unknown until refreshed or
  probed. Focused callback integration tests pass 5/5, with dashboard typecheck
  and lint clean. Dashboard release `ca72dcbe` now persists the snapshot for new
  installs and reconnects. Not required for P3-01 rollout; recorded here because
  P3-01 exposed it.
- [x] Revalidate production Shopify connectivity read-only. The connected store
  identifies itself as `palette-dev` but reports Shopify plan `basic`; at the
  time, its four recent orders contained no `test: true` order.
  **Resolved 2026-07-20:** the
  operator confirmed `palette-dev` is the development store with test orders used
  to exercise the app, so store availability no longer blocks the mutating
  canaries — running them (the first unchecked item above) is the remaining
  rollout step.
- [x] Define recovery ownership and durable follow-up reconciliation for
  outcomes that remain `unknown` after the immediate retry/read. **Done
  2026-07-21** — `unknown-outcome-sweep` (gateway maintenance) +
  `unknown-outcome-reconciliation` / `shopify/reconciliation-probes` (agent
  core); read-only probes and terminal ledger updates only, no plan replay.
- [x] Run the remaining tool families' deterministic commit-before-response,
  connection-loss, 429/5xx, provider-error, replay, and partial-operation tests.

P3-01 is complete for local code and deterministic-test purposes. Do not mark
its rollout complete until the remaining unchecked provider-evidence item above
is complete.

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
- **Verification remaining:** Controlled provider canaries for cancellation,
  order editing, order-address updates, and the fulfilled-order return/label
  workflow. Recovery-worker tests and operational ownership are complete.
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

**Current checkpoint (2026-07-28):** the strict 240-hour production audit still
contains zero reservations and no unknown or stale rows. This is clean baseline
evidence only; refund/store-credit/gift-card reservation canaries remain open.

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
- [~] Assign recovery ownership and prove the runbook/worker that reconciles
  stale or `unknown` reservations to `committed` or `released`. **Worker
  implemented 2026-07-21** — `unknown-outcome-sweep` reconciles `unknown`
  reservations via read probes (commit verified amount / release no-effect) and
  releases stale `reserved` rows past the reservation window. Proving it against
  production traffic remains a rollout gate.
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

**Status (2026-07-30): Gmail queue, provider, deduplication, and mailbox
confirmation clean; recovery exercises and broad flag rollout pending.** The
strict `audit:outbound-email` rollout check and
provider-activity recovery runbook are now implemented. The first strict
24-hour production baseline is clean but contains zero async sends, and
`OUTBOUND_EMAIL_ASYNC` is not currently configured on the production dashboard;
provider-specific evidence still requires a deliberate canary. **The 2026-07-19
strict 24-hour audit is also clean with zero rows and no blockers, so this gate
remains open.** Additive message claim
fields support a conditional `pending -> processing` transition with a claim
token and separate provider-attempt timestamp. The gateway uses the database
claim as the cross-worker correctness boundary and `messageId` as the stable
BullMQ job ID. Retained failed/completed jobs are replaced only for an explicit
retry; active jobs are deduplicated. Queue admission and execution both verify
the organization/message/thread/email-integration relationship. Gmail and
Postmark senders now return their provider message IDs, and async sends carry a
stable per-message RFC `Message-ID` for provider-side correlation.

**Deadline follow-up completed 2026-07-19:** the dashboard→gateway queue-admission
hop now has a 15-second deadline and a three-way result (`enqueued`/`failed`/
`unknown`). A timeout or connection loss is never collapsed into retryable
`failed`: the dashboard conditionally marks a still-pending message `unknown`,
while a worker that already won the `pending -> processing` claim keeps control
of the row. Gmail sends use the same 15-second boundary with a typed timeout;
Postmark's client is explicitly configured to 15 seconds. Both still inherit
the existing worker rule that any failure after provider-attempt recording is
an ambiguous outcome and cannot be automatically retried.

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

**2026-07-19 Gmail canary evidence:** one harmless message to the connected
account's own Gmail plus-address was admitted to the production queue, claimed,
accepted by Gmail, and committed with a provider message ID. Re-enqueuing the
same stable message ID returned `deduplicated: true`; the strict one-hour
required-Gmail audit reports one sent row and no failed, unknown, stale,
missing-provider-ID, or duplicate-provider-ID blockers. Manual mailbox receipt
confirmation was completed by sanitized Gmail API reconciliation on 2026-07-30.
No Postmark integration is configured for a provider-specific Postmark canary.

**Current checkpoint (2026-07-30):** the strict 240-hour required-Gmail audit
contains one `sent` Gmail row with provider identity and no failed, unknown,
stale, missing-provider-ID, or duplicate-provider-ID blockers. Gmail returned
exactly one mailbox match for the canary's parsed RFC `Message-ID`, with the
expected provider identity and unique subject. This closes the observation
window and mailbox-confirmation portions of the Gmail gate, but not the
documented recovery exercises. Postmark remains conditional on configuring a
Postmark integration.

**Still required for P4-01 rollout completion:**

- [x] Deploy `20260714000000_add_outbound_send_claims` before the application
  build.
- [x] Canary Gmail queue admission, provider-ID persistence, and duplicate
  enqueue suppression.
- [x] Confirm the Gmail canary arrived exactly once in the recipient mailbox.
- [ ] Exercise crash-after-acceptance/stale-processing/manual-retry recovery
  under the documented no-resend rules.
- [ ] Canary Postmark when a Postmark integration is configured.
- [x] Document that the launch owner/on-call checks provider activity using the
  stored provider ID and stable RFC `Message-ID`, and may resolve/retry an
  `unknown` send only with positive no-send evidence.
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

**Status (2026-07-28): Completed in production.**
The migration-first rollout is complete on commit `c8aa4c73`. Signed events now
enter a PostgreSQL ledger before work begins. A
transactional claim admits one processor, active claims return a retryable
response, failed claims can be reclaimed, and the event reaches `completed`
only in the same transaction that commits organization billing state. Redis is
no longer part of Stripe deduplication. Per-organization event time plus a
deterministic same-second event-ID tie-break prevents older deliveries from
overwriting newer state; customer and subscription identity guards prevent a
different or one-off invoice from changing the current subscription. Existing
billed organizations receive a migration-time ordering watermark so a
historical Stripe retry cannot regress pre-migration state. Analytics runs
post-commit and remains best-effort.

**Completed locally:**

- [x] Add the durable event table, claim-state constraint, recovery indexes,
  organization ordering fields, and pre-existing-state rollout watermark.
- [x] Replace Redis claim-before-work with durable claim/reclaim/completion and
  retryable active/failed handling.
- [x] Commit billing state and event completion atomically; keep analytics
  outside the transaction and best-effort.
- [x] Add the privacy-safe `audit:stripe-webhooks` strict rollout gate for
  failed, stale-pending, stale-processing, retried, and required-completion
  evidence.
- [x] Pass 17 focused database-backed tests covering signature validation,
  duplicate/concurrent delivery, active and stale claims, failed-attempt retry,
  out-of-order events, subscription identity, one-off invoices, unknown event
  types, and analytics failure.
- [x] Rebuild the isolated test database successfully from all 57 migrations;
  the empty strict local Stripe audit passes.

**Still required for rollout completion:**

- [x] Apply `20260720000000_add_stripe_webhook_events` before deploying the
  dashboard build that reads the new columns/table. Production now reports all
  57 migrations applied; the first strict 24-hour audit is clean with zero
  pre-deployment rows.
- [x] Deliver a signed non-mutating Stripe test event and replay the exact event.
  The first request committed and the replay returned `duplicate: true`; the
  one-hour strict required-completion audit reports one completed event and no
  failed, pending, stale, or recovery blockers.
- [x] Observe the strict audit through the normal window with no failed or
  stale claims before declaring the Redis rollback path removable.
  **Completed 2026-07-28:** the strict 240-hour audit contains one completed
  `invoice.payment_succeeded` event and no failed, stale-pending, or
  stale-processing records.

- **Related findings:** AUD-006.
- **Files likely to change:** `apps/dashboard/src/app/api/billing/webhook/route.ts`; Prisma schema/migration; billing tests.
- **Proposed implementation:** Persist Stripe event ID/type/time/status, process idempotently, mark completed only after subscription state commits, and make analytics best-effort/post-commit. Reject stale out-of-order state changes using event/customer/subscription ordering data.
- **Dependencies:** None beyond migration review.
- **Risk / scope:** Medium-high / Medium.
- **Tests required:** Failure at each phase, duplicate, out-of-order events, analytics outage, Redis outage/removal.
- **Rollback considerations:** Additive event table; old Redis key can remain during a transition but must not suppress failed durable events.
- **Acceptance criteria:** A failed event is retried, a completed event is not re-applied, and older events cannot overwrite newer billing state.

### P4-03 — Queue operator-channel messages before acknowledgement

**Status (2026-07-20): Completed.** Telegram and iMessage durable ingestion is the
only path; the synchronous webhook fallback has been removed. The
Telegram + iMessage implementations, recovery sweep, strict rollout audit, and
`unknown`-event recovery runbook are complete. Migration status reports all 57
migrations applied in production; the public gateway and separate worker are
both deployed on commit `1240d597`, with durable Telegram and iMessage ingestion
enabled on both services. The first strict 24-hour audit found
two Telegram events, both committed on their first claim with delivered replies.
The fresh one-hour required-traffic check then passed with another first-claim
committed/delivered event; the follow-up 24-hour strict audit reports three clean
Telegram events and no failed, unknown, stale, undelivered, or repeated-claim
records. A later `help` command also passed its one-hour strict audit on the first
claim with a delivered reply and no surrounding gateway/worker warnings or
errors. A fresh Telegram pending-plan `no` then committed on its first claim,
delivered its dismissal, and passed the required-channel strict audit without
blockers. After enabling iMessage, a new stable-identity plan was parked across
both bound channels; the iMessage `no` also committed on its first claim,
delivered its dismissal, cleared the plan from both contexts, and created no
execution. The resulting strict 24-hour audit contains one Telegram and one
iMessage event, both first-claim committed with delivered replies and no failed,
unknown, stale, undelivered, or repeated-claim records. A durable `OperatorEvent`
table (migration `20260715020000_add_operator_events`) with a unique
`(channel, providerMessageId)` key and a claim-state CHECK constraint backs the
new path. Each webhook resolves the binding, persists the event, enqueues
`QUEUE.OPERATOR_EVENT`, and only then acknowledges. For iMessage the DB unique key
replaces the prior Redis-only dedupe; binding maintenance (connect-code/re-bind/space
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

**Deadline follow-up completed 2026-07-19:** Telegram provider calls now have a
15-second typed deadline. A connection loss or timeout during reply delivery is
recorded on the committed event as an ambiguous delivery outcome; it remains a
strict-audit blocker for manual provider review and is excluded from the
automatic confirmation-resend query. This prevents the recovery sweep from
blindly duplicating a reply that Telegram or Photon may already have accepted.

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
reconciliation, delivery-window guard, re-send success/failure, and ambiguous
reply delivery suppression. The full
gateway unit + integration suite passes.

**Still required for P4-03 rollout completion:**

- [x] Document the recovery runbook: the launch owner/on-call reviews `failed`
  and `unknown` events, correlates `AgentAction` rows by durable turn ID, checks
  provider truth, and never blindly re-drives an ambiguous turn. See
  `docs/production/runbook.md`.
- [x] Complete the Telegram observation window with fresh representative
  pending-plan traffic, then canary iMessage. **The 2026-07-20 Telegram and
  iMessage pending-plan dismissals each committed on their first claim with a
  delivered reply and no strict-audit blockers; the stable iMessage decision
  cleared both bound contexts without creating an execution. Enqueue-before-ack,
  duplicate suppression, and crash recovery remain covered by deterministic
  integration tests rather than an unsafe production crash injection.**
- [x] Keep both durable-channel flags enabled through a mixed-channel observation
  window, then retire the synchronous fallback only after a fresh 24-hour strict
  audit remains clean. **Completed 2026-07-20:** mixed-channel observation passed;
  the synchronous fallback and per-channel rollout flags are removed — durable
  ingestion is the only path for Telegram and iMessage operator messages.
- [x] Add the `OPERATOR_EVENT` processing queue to queue-health monitoring with
  a per-queue waiting threshold (P6-02, PR #26).

- **Related findings:** AUD-001, AUD-007.
- **Files likely to change:** gateway Telegram/Photon webhook routes and handlers; new operator-inbox queue/worker; Prisma schema/migration or durable BullMQ job IDs; presence/reply adapters.
- **Proposed implementation:** After signature and binding resolution, persist/enqueue one provider event with stable ID, then acknowledge. Process through the execution ledger and emit result/failure replies asynchronously.
- **Dependencies:** P1-02/P1-03.
- **Risk / scope:** High / Large.
- **Tests required:** Ack timing, duplicate, crash, ordering, binding revoked after enqueue, partial action, provider reply failure.
- **Rollback considerations:** Roll out per channel, starting with Telegram; retain synchronous handler behind a short-lived flag.
- **Acceptance criteria:** Acknowledged merchant instructions are durably recoverable and each provider message has at most one committed control action.

### P4-04 — Flatten Meta webhook batches

**Status (2026-07-17): Completed by the Instagram Login integration work.** `webhooks-meta.ts`
iterates every `entry` and normalizes every `messaging` event, enqueuing one `IG_DM` job per
message keyed on `externalMessageId` (`mid`) so inbound dedupe persists each event exactly once.
Only non-DM `changes` events remain unhandled, which is out of scope for the DM path. No further
work required.

- **Related findings:** AUD-008.
- **Files likely to change:** `apps/gateway/src/routes/webhooks-meta.ts`, `message-handlers/channels.ts`, inbound job types/tests.
- **Proposed implementation:** Normalize all entries/events after signature verification and enqueue one message job per event with stable job/provider IDs.
- **Dependencies:** None; can ship as a quick isolated fix.
- **Risk / scope:** Medium / Small.
- **Tests required:** Multi-entry/multi-message/mixed echo/malformed/different-page payloads and duplicate `mid`.
- **Rollback considerations:** Revert normalization module; inbound database idempotency protects replay during rollback.
- **Acceptance criteria:** Every valid event in a batch is persisted exactly once.

### P4-05 — Apply route-specific body and attachment budgets

**Status (2026-07-28): Completed and deployed.**
Shipped in two parts. Body budgets: the application-wide 50 MB JSON/urlencoded
parsers are gone, and each route mounts its own budget through
`routes/body-parsers.ts` — 2 MB for signed provider webhooks, 1 MB for internal
routes, 50 MB for Postmark inbound email only. Raw-body capture stays on the
signed webhooks that verify over it and is dropped from the email parser, which
authenticates with basic auth and no longer holds a second copy of an
attachment-sized payload. Rejections answer 413 JSON and log path, content type,
rejected length and limit. Attachment contract: count (10), combined decoded
bytes (25 MB) and upload concurrency (3) are enforced at ingestion in
`storage/attachment-budget.ts`, before anything is queued or uploaded, so
over-budget base64 no longer reaches Redis; the existing per-attachment 10 MB
cap now reads from the same config. All seven limits are env-overridable
(`GATEWAY_BODY_LIMIT_*`, `GATEWAY_ATTACHMENT_*`) for an emergency increase.
Coverage: per-route boundary sizes including a large invalid signature, the
413 handler's log and pass-through branches, budget trimming at the email route,
and the concurrency runner's ordering/ceiling.

**Decisions taken.** An over-budget *attachment* is
dropped while the customer's message is still delivered — a support ticket that
arrives without its photo is recoverable, one that never arrives is not; only a
request over the *body* limit fails outright, which is the DoS boundary. The
supported content-type contract deliberately retains a direct-executable
denylist rather than a restrictive allowlist, so legitimate support attachments
such as `.heic`, `.docx`, and `.zip` remain accepted. Declared MIME types are
normalized before policy and storage; common executable/script extensions and
MIME types are rejected even when filename and MIME disagree. At delivery, only
passive raster images whose MIME and extension agree render inline. HTML, SVG,
PDF, mismatched, unknown, and every other retained type use
`Content-Disposition: attachment`, so broad compatibility does not turn
customer-controlled content into active same-origin browser content.

**Deployment checkpoint (2026-07-28):** the gateway attachment suite
passes all 24 cases, including MIME parameters, filename/MIME disagreement,
script and executable types, malformed MIME fallback, size limits and upload
failure. The authenticated dashboard attachment route passes all 10 cases,
including inline passive images plus forced download for HTML, SVG, PDF,
mismatches and unknown types. Dashboard and gateway typechecks and lints pass;
`git diff --check` is clean. Commits `0381cce1`, `52270fd1`, and `ca72dcbe`
were deployed to Vercel and both Railway services; dashboard and gateway health
return 200, the worker heartbeat is healthy, and the Photon route is configured.

- **Related findings:** AUD-009.
- **Files likely to change:** `apps/gateway/src/index.ts`, `routes/webhooks.ts`, provider webhook routes, `routes/webhooks-email.ts`, blob upload helper, runtime config/env examples.
- **Proposed implementation:** Mount small/default JSON parsers per router, provider-sized raw body limits for signed routes, and a separate Postmark parser. Add attachment count, decoded-byte, type and concurrency limits.
- **Dependencies:** None; the supported attachment contract is decided.
- **Risk / scope:** Medium / Medium.
- **Tests required:** Boundary sizes for every route, large invalid signature, attachment budget/type, partial upload cleanup.
- **Rollback considerations:** Limits should be configurable for emergency increases; retain metrics on rejected size/type.
- **Acceptance criteria:** Non-email routes cannot allocate a 50 MB parsed body
  and email payloads exceeding the documented contract fail clearly before
  upload fan-out. Retained customer-controlled content cannot execute inline
  from the dashboard origin. **Met in production.**

### P4-06 — Add deadlines and typed timeout classification to external fetches

**Status (2026-07-19): Deployed; production observation in progress.** The
repository's first-party production HTTP calls have explicit
deadlines and classified timeout behavior. The existing Gmail sync/OAuth,
Shopify, and Instagram clients remain bounded. Shared 15-second wrappers now
cover dashboard OAuth, dashboard→gateway webhook/internal hops, gateway→dashboard
internal calls, Clerk, legacy Meta, Telegram, TikTok Shop token refresh, and
email-token health. USPS tracking and Gmail sends carry explicit 15-second
signals; Postmark's SDK client is explicitly configured to 15 seconds. The only
remaining raw-fetch match without a fixed deadline is the non-production
realtime smoke script, whose caller-owned abort lifecycle is its test control.

Mutation timeouts are not treated like failed reads: TikTok Shop sends return an
unknown delivery outcome; outbound-email queue admission returns `unknown` and
conditionally preserves a worker claim; gateway→dashboard customer sends return
an unknown tool result; ambiguous Telegram/iMessage confirmations are withheld
from automatic resend and remain visible to the strict operator-event audit.
No mutation gained an automatic retry.

The initial post-deploy telemetry snapshot is clean: neither Railway gateway
service logged a timeout/abort match in the preceding four hours, and neither
logged a warning or error in the first 30 minutes after the final deployment.
This is deployment evidence, not a substitute for provider traffic across the
full observation window.

**Completed locally (verified 2026-07-19):**

- [x] Inventory every first-party production raw HTTP call and bound each call
  or retain its existing explicit deadline.
- [x] Classify provider deadlines with typed errors/results and keep OAuth/read
  timeouts distinct from invalid credentials and provider rejections.
- [x] Preserve `unknown` for customer-send, queue-admission, and operator-reply
  mutations whose provider or downstream commit cannot be disproved.
- [x] Prevent the operator-event sweep from automatically resending an
  ambiguously delivered confirmation.
- [x] Pass repository lint and typecheck, 1,192 unit tests, 37 Node-script tests,
  and 977 database-backed tests (2 existing skips).

**Still required for rollout completion:**

- [x] Deploy the deadline changes to the Vercel dashboard and both Railway
  gateway services; the full production health/deep/queue/webhook verifier
  passes after deployment.
- [ ] Observe provider-timeout/error telemetry through the normal canary
  windows; keep provider-specific rollback controls.

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

**Status (2026-07-28): Completed in production.** `createMessage()` always loads
the parent thread, derives
its organization, and rejects a conflicting caller-supplied organization.
Dashboard thread tools scope reads and writes by thread plus organization; the
internal provider-send hop derives the organization name from that owned
thread. Gateway outbound-email admission and execution validate the complete
organization/message/thread/integration product before enqueue or provider
access. Database-backed cross-tenant tests prove mismatched replies, status
updates, escalations, message writes, queued sends, and worker jobs produce no
provider call or cross-tenant mutation. The later P5-03 strict production audit
found zero mismatches across the prioritized relationships, and all 14 compound
tenant constraints are validated, closing the production-observation gate.

- **Related findings:** AUD-005, AUD-010, AUD-016.
- **Files likely to change:** dashboard internal send route/thread tools; gateway internal queue/outbound worker; `packages/db/index.ts`; related tenant tests.
- **Proposed implementation:** Load root objects with organization predicates, derive downstream organization IDs, assert parent relationships, and reject mismatches. Make `createMessage()` verify or derive organization rather than trusting a redundant caller field.
- **Dependencies:** None; coordinate with P4-01 to avoid duplicate edits.
- **Risk / scope:** Medium / Medium.
- **Tests required:** Full cross-product mismatch matrix and valid same-tenant calls.
- **Rollback considerations:** Add diagnostics before strict rejection if production inconsistency is suspected.
- **Acceptance criteria:** No internal path can combine objects from different organizations, even with a valid service secret.

### P5-02 — Decide and implement the member/admin permission matrix

**Status (2026-07-24): Decided and implemented; enforced from the first deploy.**
The matrix is admin = the operations that change what the agent may do on its own,
move money, hold provider credentials, or destroy data; member = everything a
teammate does day to day. Before this, `withOrgRoute` — the wrapper on nearly
every API route — had no role concept at all, and `requireAdmin` existed only on
`withClerkOrgRoute` (3 handlers). Any member could raise `maxRefundAmount`, flip
`autonomyTier`/`autoExecuteMode` to live, disconnect Shopify, or clear all ticket
history.

Admin-only now: `PATCH /api/org` (the agent settings blob), `DELETE /api/org`,
`DELETE /api/org/data`, `POST /api/billing/checkout`, `POST /api/billing/portal`,
`POST /api/integrations`, `PATCH`/`DELETE /api/integrations/[id]`,
`PATCH /api/integrations/email/default`, team invite/remove, and OAuth connect
initiation for all four providers. Members keep tickets, agent runs and
approvals, messages, KB, Shopify customer writes, and binding their own
Telegram/iMessage device.

- `lib/api/permissions.ts` holds `isOrgAdmin`/`assertOrgAdmin` and the denial
  copy; the E2E bypass identity is treated as its workspace's admin so the
  auth-bypass smoke suite is unaffected.
- `withOrgRoute` gained `requireAdmin`, checked after org resolution but before
  the billing gate and rate limit, so a denied caller neither learns the org's
  billing state nor spends its budget.
- `requireAuthenticatedOAuthSession` is the single chokepoint for Shopify,
  Gmail, Instagram and TikTok connect; it now returns a result union so a member
  gets a 403 with the admin message rather than a misleading 401.
- UI follows the server, not the reverse: the danger zone is hidden from
  members, billing portal buttons are admin-only, the agent-settings save bar
  explains why it is disabled, and the integrations page states the rule while
  leaving own-device binding available.
- Coverage: `lib/api/permissions.unit.test.ts` (roles, unset role, custom role,
  bypass), `app/api/admin-permissions.unit.test.ts` (8 admin-only routes × member
  and unset-role callers denied 403 with the role message, and admins let
  through), plus a DB-backed `PATCH /api/org` pair proving a member cannot widen
  the refund cap or autonomy tier and an admin can. Suites that exercise admin
  operations now authenticate as admins so a role 403 can never mask a 402/404
  assertion.

Rollout: enforcement is immediate, not audit-first. The plan's audit-then-enforce
sequence exists to avoid breaking established teams; there are no onboarded
merchants yet, so a log-only mode would be code written to be deleted.

- **Related findings:** AUD-011.
- **Files likely to change:** `apps/dashboard/src/lib/api/route.ts`/`clerk-route.ts`; org, integration, billing, OAuth and data routes; UI visibility; authorization tests.
- **Proposed implementation:** Product/security owners classify permissions. Add a shared `requirePermission`/role-aware route option and enforce it server-side; UI hiding is secondary.
- **Dependencies:** Explicit product decision and existing-team migration/communication.
- **Risk / scope:** High / Large.
- **Tests required:** Route-by-role matrix, direct requests, stale session role, admin/member UI.
- **Rollback considerations:** Feature flag enforcement for existing organizations if needed; never rely on UI-only rollback.
- **Acceptance criteria:** Every sensitive operation has an explicit documented permission and tests prove server enforcement.

### P5-03 — Audit and then enforce relational tenant consistency

**Status (2026-07-21): COMPLETE in production.** Migration
`20260720010000_add_tenant_consistency_constraints` was applied to production on
2026-07-21T00:34 UTC and all 14 tenant foreign keys are validated
(`convalidated = true`); the strict consistency audit is clean over real
production data. Verified 2026-07-21 against a copy-on-write Neon branch of the
`production` branch (see Production verification below). Controlled
validation/verification tooling (`npm run validate:tenant-constraints`) landed
alongside. `npm run
audit:tenant-consistency -- --strict` checks 13 high-risk relationships spanning
thread/customer/reply integration/cached message, message/thread/integration,
agent action/thread/customer/execution, plan execution/thread/source message,
and KB article/citation parents. It reports total counts plus bounded UUID-only
samples and never emits message, customer, article, or KB content. Strict mode
fails on any mismatch; `--sample-limit` is bounded to 1–1,000. Database-backed
coverage deliberately creates every supported cross-tenant relationship and
proves each is detected, while unit coverage proves aggregation, clean-state,
sample limiting, and strict-gate inputs. The strict production audit returned
zero mismatches across every check, so no data repair is currently required.

Migration `20260720010000_add_tenant_consistency_constraints` adds supporting
compound unique indexes and 14 table-specific compound foreign keys as `NOT
VALID`. The additional source-message/thread constraint proves a plan source
belongs to its claimed thread as well as its tenant. PostgreSQL 17 column-targeted
`SET NULL` preserves tenant IDs for nullable references. The migration rebuilds
successfully in the isolated database, and database-backed tests prove same-
tenant writes remain valid while new cross-tenant writes are rejected across
the prioritized relationships. It was applied to production on 2026-07-21T00:34
UTC (`_prisma_migrations.finished_at`, no rollback).

**Validation tooling (2026-07-21):** `npm run validate:tenant-constraints`
(`scripts/validate-tenant-consistency-constraints.mjs`) runs the deferred
`VALIDATE CONSTRAINT` step as a controlled, inspect-only-by-default script — not
the "later migration" the migration comment anticipated. Prisma wraps a
migration file in one transaction, so a migration would validate all 14
constraints all-or-nothing under a single `SHARE UPDATE EXCLUSIVE` hold, on every
`migrate deploy`; running each `VALIDATE` as its own autocommitted statement is
what actually delivers "validate separately / keep each constraint independently
removable / a later controlled step." Inspect mode reports each constraint's
installed/validated state; `--execute` refuses unless `computeTenantConsistencyReport`
is clean (a dirty audit means a `VALIDATE` would error mid-run) and every
constraint is installed, validates each pending constraint independently,
skips already-validated ones, and names the exact constraint on failure.
Exercised end to end against the local test database with all 60 migrations
applied: inspect detects the 14 installed-but-unvalidated constraints, `--execute`
validates all 14 (exit 0), and re-running `--execute` is an idempotent no-op.

**Lock-timing review (two distinct DDL profiles):**

- *NOT VALID migration `20260720010000` (applied to production 2026-07-21).* Its
  non-concurrent `CREATE UNIQUE INDEX`/`CREATE INDEX` builds take a `SHARE` lock
  that blocks writes (not reads) for the build — Prisma's per-file transaction
  rules out `CONCURRENTLY`. Confirmed empirically harmless: the production copy
  carries only hundreds of rows per table (13 orgs, 105 threads, 459 messages,
  178 agent actions), so the builds were sub-millisecond. The write-blocking
  window would grow with table size, which is why the migration comment flags
  reviewing it against a production copy before any future large-table deploy. The
  `ADD CONSTRAINT … NOT VALID` statements take only a brief metadata lock with no
  table scan. This review attaches to deploying *that* migration.
- *This VALIDATE step.* `ALTER TABLE … VALIDATE CONSTRAINT` takes a `SHARE UPDATE
  EXCLUSIVE` lock — it does not block reads or writes, only concurrent DDL/VACUUM
  on the same table — and performs a full-table scan whose cost scales with size
  but is concurrency-safe against live traffic. Each of the 14 runs as its own
  autocommitted statement, so the lock is held one constraint at a time.

**Production rollout procedure (this is the pattern; the production run already
happened on 2026-07-21).** For reference and for any future large-table redeploy:

1. On a current production copy (restored Neon branch/snapshot), apply migration
   `20260720010000`, time the index builds, and confirm the write-blocking
   window is acceptable at real table sizes. Then run `npm run
   validate:tenant-constraints` (inspect) and `--execute` against the copy;
   confirm all 14 validate cleanly and the re-run is a no-op.
2. Immediately before deploying, re-run `npm run audit:tenant-consistency --
   --strict` against production; it must be clean.
3. Deploy migration `20260720010000` to production separately (`npm run
   db:migrate:deploy`), not bundled with other schema work. New writes are then
   protected.
4. Soak.
5. In a later controlled step, run `npm run validate:tenant-constraints --
   --execute` against production; each constraint validates independently and a
   failure names the exact constraint while leaving the others validated. Confirm
   inspect mode then reports all 14 `already_validated`.

**Production verification (2026-07-21):** created a copy-on-write Neon branch off
the `production` branch (Neon project `shopkeeper`, single `production` branch)
and confirmed via two independent catalog signals — `_prisma_migrations` shows the
migration applied 2026-07-21T00:34 UTC with no rollback, and all 14 tenant foreign
keys report `convalidated = true` in `pg_constraint` — plus `npm run
validate:tenant-constraints` (inspect) as a third read of the same state (all 14
`already_validated`, audit clean, 0 mismatches over the real production data). The
branch was deleted after verification. The 2026-07-21 deploy and validation were
never recorded here, so this section read "not applied" until the copy proved
otherwise.

**Still required: none.** Note: validation is a per-environment post-deploy step,
not something the migration carries — the committed migration installs the
constraints `NOT VALID`, which already enforce new writes, but any environment
rebuilt by replaying migrations onto an empty database starts unvalidated until
`npm run validate:tenant-constraints -- --execute` runs (only historical-row
checking and planner trust are deferred until then). That recurring step is why
the tooling and procedure above are kept rather than deleted as now-redundant.
History:

- [x] Run the strict audit against production and preserve reviewed evidence.
- [x] Review whether repair is required. The audit is clean; if a future
  pre-deploy audit finds mismatches, determine ownership and repair them through an
  approved, separately reviewed backfill; never delete inconsistent rows
  automatically.
- [x] Add table-specific compound foreign keys as `NOT VALID` and prove new
  mismatch rejection in the isolated database.
- [x] Review index lock timing (documented above) and build the controlled,
  independently-removable `VALIDATE CONSTRAINT` tooling
  (`npm run validate:tenant-constraints`), verified against a real database.
- [x] Migration `20260720010000` applied to production and all 14 constraints
  validated; verified 2026-07-21 against a Neon production-copy branch (migration
  record, `pg_constraint.convalidated`, and `validate:tenant-constraints` inspect
  all agree; audit clean).

- **Related findings:** AUD-016.
- **Files likely to change:** read-only audit script; Prisma schema; one or more staged SQL migrations; central write helpers.
- **Proposed implementation:** Query production for mismatched parent/tenant pairs, repair through an approved backfill, then add compound foreign keys/check triggers where feasible. Keep migrations table-specific and reversible.
- **Dependencies:** P5-01; database backup/copy; migration review.
- **Risk / scope:** High / Large.
- **Tests required:** Migration against copied production data, cascade/set-null behavior, query plans, cross-tenant insert rejection.
- **Rollback considerations:** Add constraints `NOT VALID`, validate separately, and drop individually if necessary; never delete inconsistent rows automatically.
- **Acceptance criteria:** Consistency audit is clean and the database rejects new mismatches for prioritized high-risk tables (`Message`, `Thread`, `AgentAction`, KB relations).

### P5-04 — Define and correct the active thread/escalation state model

**Status (2026-07-20): App model deployed; production compatibility audit clean;
planner-surface cleanup merged to master.**
Product decision resolved and the app layer is implemented; the historical
backfill is staged but the production audit shows it is a no-op (see below).
Decision: escalation is an **orthogonal flag, not a `pending`
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

- [x] Audit/backfill historical `pending` threads to `open` + `escalated_at`.
  **Backfill code is written and staged; the production audit returned 0 pending threads and
  0 collisions, so the run is currently a no-op — re-audit before running rather
  than assuming rows appeared.** `npm run backfill:escalation`
  is dry-run by default and requires `--execute` to write; it flips live pending
  threads (`deleted_at IS NULL AND archived_at IS NULL`) to `open` and stamps
  `escalated_at = COALESCE(escalated_at, updated_at)`, and **refuses to write while
  any collision exists** (re-checked inside the write transaction). A backfill is
  a collision risk because flipping would create a second `status='open'` row for a
  `(org, customer, channel)` group, violating the `threads_one_open_per_customer`
  (`WHERE status='open'`) unique index. Collision detection is shared with the
  audit via `scripts/escalation-backfill-lib.mjs`. **Correctness fix:** the
  originally-shipped audit only flagged the open≥1 ∧ pending≥1 case; it missed the
  **zero-open ∧ ≥2-pending** case (two split escalations for one customer —
  reachable via exactly the pre-P5-04 split bug this column fixes), which also
  violates the index. The shared classifier now flags any group where
  `flipCount ≥ 1 ∧ existingOpen + flipCount ≥ 2` and counts existing opens matching
  the index predicate literally (`status='open'`, no delete/archive filter). Run
  `npm run audit:escalation-backfill -- --strict` first; it lists collision groups
  to resolve and exits non-zero while any remain. The classifier is unit-tested
  (`scripts/backfill-escalation.test.mjs`); the raw SQL aggregation is not
  DB-exercised (pre-launch, no rows) — validate against a data copy before the
  prod run.
- [x] Retire `pending` from the support-planner surface with the eval gate.
  Production compatibility queries found zero pending cached
  `update_thread_status` plans, zero historical pending tool actions, and zero
  pending threads. `update_thread_status` now offers only `open` and `closed`;
  `escalate_to_human` describes the orthogonal escalation flag while
  keeping the ticket open. Legacy database values remain readable.
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

**Status (2026-07-17): Completed (PR #24).** Opaque base64url cursor over
`(last_message_at, id)` with a matching row-value SQL predicate (microsecond precision
preserved via `to_char(...'US')` + `::timestamptz`); both list paths unified through the
SQL-filter query, removing the second millisecond-precision Prisma cursor that skipped rows
at sub-millisecond boundaries; default page size 50; malformed/legacy cursors return 400.
19 route + 5 codec tests.

- **Related findings:** AUD-013.
- **Files likely to change:** `apps/dashboard/src/lib/messaging/thread-list-query.ts`, `/api/threads/route.ts`, `usePaginatedThreads.ts`, types/tests.
- **Proposed implementation:** Introduce a versioned cursor encoding `lastMessageAt` and ID, use matching lexicographic SQL/Prisma predicates, add a default page size, and move full history to thread detail requests.
- **Dependencies:** None.
- **Risk / scope:** Medium / Medium.
- **Tests required:** Random UUIDs, equal timestamps, concurrent insertion, old/invalid cursor, response limits.
- **Rollback considerations:** Accept old ID cursors temporarily or invalidate with an explicit 400/reload path.
- **Acceptance criteria:** Paging returns every row once in stable sort order and no list request returns unbounded histories.

### P6-02 — Monitor every business-critical queue and formalize failed-job recovery

**Status (2026-07-27): Completed, including the controlled production recovery
exercise.** Queue-health now covers outbound-email, gmail-sync,
order-review and operator-event with per-queue SLO thresholds falling back to the global
config (PR #26). Detailed diagnostics are gated (PR #27): `/health/deep` stays public but
coarse (per-check `status` only, matching the dashboard `/api/health` contract), and
`/health/queues` — which exposes queue counts, worker PID and failed-job tenant identifiers —
now requires the internal secret. The production runbook has a privacy-safe
inspection command and a per-queue recovery matrix. It permits replay only when
the queue's durable identity/state proves it safe, explicitly forbids generic
replay for outbound email and claimed/terminal operator turns, and preserves
PostgreSQL truth when stale BullMQ evidence is removed.
The 2026-07-19 production verifier was corrected to authenticate its detailed
queue request. It identified 11 historical inbound failures from the already-
resolved `escalated_at` migration gap and 7 older AI-summary parse failures;
all were idle for more than 24 hours with no active/waiting work. Their sanitized
root-cause evidence was captured and the stale BullMQ records were removed. The
authenticated queue check and full production verifier now pass with zero
failed jobs.

The controlled recovery exercise and operator walkthrough of the non-replay
paths are now complete.

**Operational checkpoint (2026-07-26):** the production worker heartbeat was
healthy and a direct, read-only Redis inspection found every monitored launch
queue idle/clean except `ai-summary` job `79`. That job exhausted its retries on
the unavailable Anthropic credit balance. Its stable source thread has since
been deleted, so the runbook correctly classified it as non-replayable; its
sanitized identity/failure evidence was captured, then only that failed BullMQ
record was removed through the state-checking internal endpoint. PostgreSQL was
not changed, and authenticated queue health returned zero failures afterward.
At this checkpoint, the result proved the triage/refusal/housekeeping path and
identified a safely staged successful replay as the remaining exercise.

The same walkthrough found that authenticated `/health/queues` exposed only
`inbound` and `aiSummary`, even though the maintenance monitor owns seven launch
queues. Commit `693ced7c` now exposes all seven queue counts plus only the stable
message/integration/order/event/source identifiers needed by the recovery
matrix; it never exposes message content. Focused route tests, the full gateway
unit suite, gateway typecheck, lint, build, script syntax, and diff validation
pass. The seven-day operator-event audits are clean with nine first-claim
committed/delivered events (five Telegram, four iMessage). The outbound-email
audit is clean but contains zero sends, so it does not close that provider path.

**Operational completion (2026-07-27):** commit `693ced7c` deployed successfully
to the Railway public gateway (`8538cdbf-d9c6-4785-a52f-817e0ba1b38c`) and
worker (`d08a49ff-a512-4b27-93e5-c6b7e147c41a`). Authenticated production
diagnostics reported a healthy worker and all seven queues — inbound, AI
summary, outbound email, Gmail sync, Gmail watch maintenance, order review, and
operator event — with zero failures before the exercise. The side-effect-free
order-review canary
`queue-recovery-canary-798b8ee4-a4e7-42dc-9f63-be82785b99fc` then failed its
first attempt with the exact controlled reason and appeared in diagnostics with
sanitized stable identity metadata. Retrying that same BullMQ job identity
completed on attempt two. Worker logs captured both transitions; the canary
branch made no database, provider, model, or customer-facing call. The exact
completed canary record was removed afterward, and the worker plus all seven
queues returned healthy with zero failures.

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

**Status (2026-07-30): Completed.**
Commit `54d82bbb` is live on the canonical Vercel dashboard and both Railway
gateway services. The reviewed-plan API now returns the durable execution ID plus an
explicit presentation outcome derived from the server's per-action truth.
`partial` distinguishes mixed committed/failed actions in the UI while mapping
to the ledger's existing terminal `failed` state; any ambiguous action or
interrupted 5xx/network hop remains `unknown`. The composer awaits approval,
locks synchronously against double clicks, renders a running state, and only
shows Sent/Done after the server reports committed success. Confirmed success
lingers for 500 ms before dismissal. Failed, partial, and unknown cards remain
mounted with the reviewed steps and safe recovery guidance; the plan is pinned
locally even after the server consumes its cache, and outcome state is keyed to
the ticket/plan so navigation cannot leak it to another conversation. Visible
status notices use live-region semantics, with assertive announcement reserved
for unknown provider outcomes.

**Completed locally:**

- [x] Return `{ id, status }` execution truth from `/api/agent` and share one
  committed/failed/partial/unknown classifier between the ledger and browser.
- [x] Make approval callbacks awaitable, render running state immediately, and
  suppress duplicate approval clicks before React can re-render.
- [x] Show Sent/Done only for server-confirmed committed success and preserve the
  existing short successful linger.
- [x] Retain failed/partial/unknown plan context with outcome-specific safe next
  actions; never offer a blind retry for an unknown provider result.
- [x] Scope recovery state to the current ticket and plan, pin it across cache
  refresh/navigation, and clean up the success timer on unmount.
- [x] Announce running and terminal states accessibly with polite/assertive live
  regions as appropriate.
- [x] Pass the 1,200-test repository unit suite, 37 Node-script tests, repository
  typecheck, dashboard/agent lint, structure lint, and the 15 affected
  database-backed approval/ledger tests.
- [x] Add authenticated browser canaries for committed, known-failure, and
  unknown server-authoritative outcomes. The 2026-07-30 focused Clerk run passed
  all five selected tests: the existing real recorded-delivery approval plus
  the three controlled presentation outcomes and Clerk setup. The committed
  card showed `Sent` only after the response; failed and unknown cards stayed
  mounted with safe guidance; unknown used an assertive live region. Controlled
  terminal responses prevented the failure canaries from manufacturing a
  customer/provider side effect.

**Still required for rollout completion:**

- [x] Deploy the dashboard/API change and pass production dashboard, database,
  Redis, worker, queue, retired-route, and Photon webhook verification.
- [x] Spot-check committed, known-failure, and unknown recovery presentation in
  an authenticated canary session.

- **Related findings:** AUD-003, AUD-005, AUD-012.
- **Files likely to change:** `useActionPlanReviewState.ts`, `useConversationAgentFlow.ts`, `conversation-agent-requests.ts`, plan card/body components, agent API response contracts.
- **Proposed implementation:** Make approval callbacks awaitable; render running state; consume ledger/action outcomes; retain recovery context for failed/partial/unknown plans; announce status accessibly.
- **Dependencies:** P1-01/P1-02; provider outcome semantics from P3/P4.
- **Risk / scope:** Medium-high / Medium.
- **Tests required:** All outcome states, double click, reload/navigation, partial tools, screen-reader live region, successful linger behavior.
- **Rollback considerations:** Keep the old card layout while switching its state source; avoid simultaneous visual redesign.
- **Acceptance criteria:** The UI never says sent/done before the server reports committed success and gives a safe next action for every other state. **Met locally; deployment spot-check remains.**

### P7-02 — Extract frontend orchestration only when behavior work touches it

**Status:** Ongoing engineering guidance; not a standalone cleanup deliverable
and not a plan-deletion blocker.

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

**Status (2026-07-29): Local upgrade complete; production deployment and
provider canary remain.** The gateway now pins `spectrum-ts@12.6.0`, the
dashboard pins Next `16.2.12`, and the vulnerable exporter path resolves
`@opentelemetry/core@2.8.0`; Photon's own telemetry package retains its
compatible `2.10.0` core. `npm audit --omit=dev` reports zero production
vulnerabilities. The existing `Spectrum`, iMessage provider, webhook,
space/send, reconnect, shutdown, and content-normalization adapters required no
API rewrite.

The full audit still reports 11 development-only advisories in the ESLint
`minimatch`/`brace-expansion` chain and the shadcn MCP
`@modelcontextprotocol/sdk`/Hono chain. Neither remaining chain is reachable
from the shipped gateway or dashboard, and the prior Spectrum/OpenTelemetry
production advisory chain is gone.

The upgrade PR gate passes with 1,472 unit tests, 38 Node-script tests, 9
Playwright smoke tests, all coverage thresholds, lint, and all production
builds. The final gateway coverage suite, including the guarded Gmail canary
added during rollout verification, passes 870 tests with 1 skipped;
96 focused Spectrum/iMessage integration tests and a runtime import probe also
pass. The deployed production verifier confirms the current iMessage
configuration, deep health, queue health, and reachable Photon webhook.

The dependency upgrade is not deployed yet, so production health is not a
12.6 provider canary. The stored Photon CLI session expired during verification
and device authorization was not approved; after deploying the exact tested
lockfile, re-authenticate the CLI, run one controlled bound-device send/receive,
inspect telemetry, and verify graceful shutdown before broad rollout. Preserve
the prior release as the rollback artifact.

- **Related findings:** AUD-019.
- **Files likely to change:** `apps/gateway/package.json`, lockfile, Spectrum client/webhook adapters and tests.
- **Proposed implementation:** Deploy the tested 12.6 lockfile, run the controlled Photon canary, then stage broad rollout.
- **Dependencies:** Provider sandbox and rollback artifact.
- **Risk / scope:** Medium-high / Medium.
- **Tests required:** Signature/webhook, all content variants, binding, operator/customer sends, graceful shutdown, oversized baggage memory case.
- **Rollback considerations:** Lock prior package/lockfile and make deployment immediately reversible.
- **Acceptance criteria:** `npm audit` no longer reports the OpenTelemetry chain and iMessage contracts pass in sandbox/production canary.

### P8-03 — Stage an enforced CSP

**Status (2026-07-30): Report-only collector deployed, nonce migration done, and
the enforcement blocker resolved and verified under an enforced policy. Only
deployed-traffic observation and the header flip remain.**
The global report-only
policy now advertises both legacy `report-uri` and Reporting API `report-to`
delivery to `/api/security/csp-report`. The unauthenticated collector accepts
both browser formats, caps bodies at 16 KiB and batches at five violations,
rate-limits a non-logged hashed client fingerprint, and logs only directives,
status, and URL origins. Paths, queries, fragments, samples, and raw report bodies
are never logged. Focused tests cover legacy and Reporting API payloads, privacy
sanitization, malformed/oversized input, batch bounds, and rate limiting.

**Nonce migration (2026-07-30).** The policy moved out of
`apps/dashboard/next.config.js` — a static `headers()` entry cannot carry a
per-request nonce — into Clerk's native `contentSecurityPolicy` middleware option
in `apps/dashboard/src/proxy.ts`, with the directive set in
`src/proxy/content-security-policy.ts`. Clerk `strict: true` deletes
`http:`/`https:` from `script-src` and adds the nonce plus `'strict-dynamic'`;
`unsafe-eval` is now dev-only. Two properties of Clerk's implementation are
load-bearing and must not be "corrected": its directive merge is a **union** with
its own defaults, so a Clerk default cannot be removed by omitting it; and the
surviving `'unsafe-inline'` is the deliberate CSP2 fallback that
`'strict-dynamic'` makes CSP3 browsers ignore. `Reporting-Endpoints` is now
emitted by Clerk's `reportTo` and was removed from `next.config.js` to avoid a
duplicate header. Next 16.2 reads the nonce from
`content-security-policy-report-only` as well as the enforced header
(`app-render.js:167`), so propagation is verifiable before enforcement. The
policy remains report-only; this slice still does not claim enforcement.

**Blocker resolved 2026-07-30 — and the original diagnosis was too narrow.** The
recorded symptom ("Clerk's `clerk.browser.js` is the one un-nonced tag; 51 of 52
nonced") came from a dynamic route and hid the real failure. Measured against a
production build with `reportOnly: false`, `/` produced **44 CSP violations and
zero nonced script tags** — every Next chunk blocked, not just Clerk's — and
`window.Clerk` never loaded. Cause: `/` and `/sign-in` were **statically
prerendered** (`○` in the route table), and prerendered HTML cannot carry a
per-request nonce, so `'strict-dynamic'` rejected the entire bundle.

**Fix.** `app/layout.tsx` reads `x-nonce` from `headers()` and threads it to
`ClerkProvider` through a `nonce` prop on `app/providers.tsx`. The prop is
required because `providers.tsx` is `"use client"`: that resolves to the
**client** `ClerkProvider`, which renders `ClerkScripts` and takes the nonce from
provider options, and which cannot read request headers. The `dynamic` prop is
read only by the **server** provider
(`@clerk/nextjs` `app-router/server/ClerkProvider.js`, which renders
`DynamicClerkScripts` in a Suspense boundary) — a `"use client"` `providers.tsx`
never reaches it. That is precisely why the earlier `dynamic` attempt failed;
Clerk's own docs saying the nonce "requires the `dynamic` prop" is what misled
it. `style-src`/`font-src` additionally gained
`fonts.googleapis.com`/`fonts.gstatic.com`, a second real blocker from the
`globals.css` `@import`s that only surfaced once scripts stopped failing.

**Verified.** Enforced-CSP production build, headless Chromium: `/` and
`/sign-in` both at **0 violations with `window.Clerk: true`** (from 44 and 31
violations with Clerk dead). Proxy unit tests 17/17.

**Accepted cost.** `headers()` in the root layout flips every route from static
to dynamic (`○ /` → `ƒ /`). This is inherent — a per-request nonce and static
prerendering are mutually exclusive — not a regression to chase. The alternative
that preserves static rendering is Clerk's Suspense-isolated
`DynamicClerkScripts`, which requires converting `providers.tsx` to a server
component.

- **Related findings:** AUD-018.
- **Files likely to change:** `apps/dashboard/src/proxy.ts` and `src/proxy/content-security-policy.ts` (the policy now lives here), `apps/dashboard/next.config.js`, instrumentation/layout/script integrations, CSP reporting tests/runbook.
- **Proposed implementation:** ~~Remove production `unsafe-eval`, add nonces/hashes~~ **done 2026-07-30.** ~~Resolve the un-nonced Clerk script tag~~ **done 2026-07-30.** Remaining: analyze report-only telemetry from deployed traffic, canary enforcement, then flip `reportOnly` to `false` in `apps/dashboard/src/proxy.ts`.
- **Dependencies:** Sentry/Clerk/PostHog compatibility testing and violation endpoint/telemetry.
- **Risk / scope:** Medium-high / Medium.
- **Tests required:** Production build Playwright across auth, dashboard, analytics, Sentry and OAuth.
- **Rollback considerations:** Revert to report-only header without removing telemetry.
- **Acceptance criteria:** Enforced CSP blocks an injected script fixture while all supported flows function without unexpected violations.

### P8-04 — Normalize query/status validation without changing stored semantics

**Status (2026-07-20): Merged to master.** `/api/threads` now uses
one query parser for status, filter status, booleans, tag, channel type, limit,
and compound cursor. Only documented enum values reach the SQL filter builder;
malformed booleans, unknown enums/tags/channels, non-integer or out-of-range
limits, and invalid cursors return typed 400 responses instead of silently
falling back or reaching PostgreSQL. The SQL filter type now carries the Prisma
channel enum rather than an unchecked string. Parser unit tests cover defaults,
valid boundaries, and malformed values; database-backed route tests prove the
HTTP 400 contract. Dashboard/agent/gateway typechecks and affected lint pass.

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

**Status (2026-07-20): Local documentation cleanup complete.** The README now
states that Telegram and iMessage operator channels are implemented, escalation
tool text matches the active open-plus-flag model, and channel/operator comments
no longer describe Telegram as the only active surface. Legacy storage/deployment
identifiers remain intentionally unchanged and are labeled as compatibility
names where they are discussed. Environment examples include the new bounded-
context rollout rail, and the production environment checker covers it.

- **Related findings:** AUD-021.
- **Files likely to change:** `README.md`, environment examples, operator-context comments, production/channel runbooks.
- **Proposed implementation:** Update implemented-channel status and current operator semantics. Clearly label legacy queue IDs as storage/deployment compatibility names.
- **Dependencies:** None for docs.
- **Risk / scope:** Low / Small.
- **Tests required:** Documentation link/env checker where applicable.
- **Rollback considerations:** None beyond revert.
- **Acceptance criteria:** A new engineer can identify current customer/operator channels and understands why legacy identifiers remain.

### P9-02 — Verify and remove only proven dead compatibility code

**Status (2026-07-30):** Owned backlog in
[compatibility-retirement-backlog.md](compatibility-retirement-backlog.md).
First retirement complete: Sentry example page/API and `SENTRY_EXAMPLE_PAGE_ENABLED`
(not in operational runbooks). Remaining candidates have assigned owners and
evidence gates in that file.

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
   **Completed locally 2026-07-20; bounded context and its dedicated real-model
   eval are also complete, with staged rollout remaining.**
6. Expand queue-health monitoring from P6-02. **Completed 2026-07-27:** all
   seven queues are visible in authenticated production diagnostics, and a
   side-effect-free failed job was recovered by exact identity.
7. P9-01: documentation/comment corrections. **Completed locally 2026-07-20.**

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

- ~~Member versus admin permission matrix (P5-02).~~ **Decided 2026-07-24:**
  admin owns agent settings, billing, integration connect/disconnect and data
  destruction; members own the daily ticket work. See P5-02.
- ~~Supported attachment count, size and content types (P4-05).~~ **Decided
  2026-07-27:** broad compatibility with a direct-executable denylist; only
  MIME/extension-matched passive raster images render inline.
- Merchant UX and recovery authority for `unknown` external actions (P1/P3/P7).
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
- Durable Stripe event processing (P4-02). **Migration
  `20260720000000_add_stripe_webhook_events` was rebuilt successfully in the
  isolated test database and applied to production before the application
  deployment on 2026-07-19.**
- Operator inbox/event persistence (P4-03). **Migration
  `20260715020000_add_operator_events` is applied in production. Telegram and
  iMessage are enabled on both gateway services; both live dismissal canaries
  passed on their first claim with delivered replies.**
- Compound tenant constraints after audit/backfill (P5-03). **The production
  audit is clean; migration
  `20260720010000_add_tenant_consistency_constraints` is applied in production,
  and all 14 compound foreign keys are validated.**
- Operator pending-plan queue (A6/P1 compatibility). **The additive
  `20260723000000_add_operator_pending_plans` migration and its legacy
  single-slot backfill were applied on 2026-07-28 after release verification
  exposed the migration lag. Production now reports all 62 migrations applied.**
- Active-thread constraint/state migration if `pending` remains active (P5-04).
  **No longer required: escalation is orthogonal, the additive `escalated_at`
  migration is deployed, and production has zero legacy pending rows.**

All should be additive first. Destructive cleanup belongs in later releases after application rollback windows close.

## Staged rollout or feature flags required

| Change | Suggested stages |
| --- | --- |
| Execution ledger | `off -> shadow claim/divergence logging -> enforce for dashboard -> enforce operator/auto` |
| Shopify mutation policy | Per-tool canary; reads unchanged; `unknown` reconciliation observed before broad enablement |
| AI coalescing | Stale-write rejection immediately; debounce/coalescing canary with token/latency/quality metrics |
| Bounded AI context | Dedicated eval, aligned host `shadow`, one long-thread `enforce` canary, then normal observation |
| Operator durable queue | Always on (P4-03 complete 2026-07-20) |
| Outbound email claims | Test tenant/canary, monitor stale-processing recovery, then make async default |
| RBAC | Enforced from first deploy (P5-02, 2026-07-24) — no onboarded merchants to break, so the audit-first stage was skipped |
| CSP | Report-only telemetry, canary enforcement, broad enforcement |
| Spectrum upgrade | Sandbox, one gateway canary, broad rollout |

## Historical implementation progress

**Progress (2026-07-13):** P0-02, P1-01 through P1-03, P2-01, P3-01/P3-02,
P4-01, and P5-01 have complete local implementations. All 52 migrations are
applied in production, and the cleanup implementation is deployed on commit
`92d9333`. The Vercel dashboard and both Railway gateway services are explicitly
in ledger `shadow` mode and healthy. The first strict 24-hour production audit
passed but contained zero executions, so real-traffic observation, claim/recovery
review, and provider and queue canary evidence remain rollout prerequisites;
P1-03 live multi-device dismissal is now verified. P4-01 now provides one-winner
email delivery
claims, tenant validation, stable queue/provider identity, explicit unknown
delivery, and stale-claim recovery; its provider-activity runbook and strict
audit are implemented, while provider canaries remain open. P3-01's shared retry/unknown
outcome contract plus refund, cancellation, order creation/editing, order
address, gift-card, and store-credit handling are locally complete; durable
recovery ownership landed 2026-07-21 (`unknown-outcome-sweep`), and provider
canaries remain. Run
`npm run audit:plan-executions -- --hours=24` to report repeated shadow
observations, unknown outcomes, and stale claims; `--strict` makes any such
finding fail the command. The production shadow observation window remains open
until the audit includes representative dashboard and gateway executions.

**Progress (2026-07-19):** Unblocked pure-code cleanup has advanced independently of the
rollout gates above. Previously merged work includes P4-04 (verified already complete), P6-01
(PR #24), the Gmail slice of P4-06 (PR #25), and both P6-02 slices — queue-health monitoring
(PR #26) and health-diagnostics auth (PR #27). See each item's Status line for detail.
P7-01 is complete after authenticated committed/failed/unknown presentation
canaries. P4-06 remains deployed with only provider telemetry observation open.
P4-02's durable Stripe event
implementation, additive migration, application deployment, signed-event
replay, and first strict production canary are complete; its longer observation
window remains open.

**Progress (2026-07-20, historical checkpoint):** P1-04 renewable latency-guard locks, P2-02 bounded
context and its dedicated quality/token eval, P5-04 planner-surface retirement,
P6-02's per-queue recovery guard, P8-03 report-only CSP collection, and P8-04
query validation were merged to master. At that checkpoint P5-03's audit plus
`NOT VALID` enforcement migration was awaiting production-copy validation; it
was subsequently applied and fully validated on 2026-07-21. This P9-01
documentation update was the final merge of the batch. Read-only production
audits are clean: tenant consistency has zero mismatches across 13 checks;
plan-execution and refund-reservation audits have zero traffic; the Stripe audit
has one completed event; outbound email has one Gmail send with provider ID;
operator events have one Telegram and one iMessage event, both first-claim
committed/delivered; and escalation compatibility has zero pending rows/plans/
actions. The full enforced-context eval reached 67/77 passing before Anthropic
credit exhaustion caused nine explicit provider errors; one additional
brand-voice fixture missed its expected no-read behavior. Treat that aggregate
run as inconclusive. The independent long-thread comparison passed both quality
checks and the required 20% token-reduction gate.

**Audit refresh (2026-07-28):** the strict 240-hour operator-event audit reports
14/14 first-claim committed events with delivered replies (10 Telegram, 4
iMessage) and no failed, unknown, stale, undelivered, or repeated-claim rows.
The strict Stripe audit reports one completed event and no blockers, closing
P4-02's observation window. The strict Gmail audit reports one sent message and
no blockers. Plan execution has two clean human-approved shadow observations;
refund reservations remain at zero. Queue diagnostics contain two preserved
AI-summary failures for open threads, both explicitly caused by exhausted
Anthropic credit. **Resolved later on 2026-07-28:** both source identities were
revalidated and retried in place, both jobs completed, the queue has zero failed
jobs, and authenticated production verification passes.

**Progress (2026-07-20):** P4-03 is complete — durable operator ingestion is the
only path for Telegram and iMessage; the synchronous webhook fallback and
per-channel rollout flags are removed. Operator nudge parity (Telegram/iMessage)
and live phone verification of the operator turn are complete.

**Progress (2026-07-21):** The P3-01/P3-02 durable reconciliation owner is
implemented and merged to master — a 15-min `unknown-outcome-sweep` maintenance
job plus the agent-core `unknown-outcome-reconciliation` /
`shopify/reconciliation-probes` modules read-probe ambiguous Shopify mutations,
drive `unknown` executions/reservations/actions terminal, and reconcile stale
`claimed`/`reserved` rows — all read-only probes and terminal ledger updates,
never a plan replay. Ships with the read-only `audit:unknown-outcomes` rollout
gate and guarded `canary:shopify-mutations` harness; reuses existing
models (no migration). The provider canary gate completed on 2026-07-29 with
fresh test-order-only fixtures and agreeing reconciliation probes. Separately,
vision-audit §2.2 is fixed: `updateContext`
is now an atomic per-slot write (no read-modify-write), so concurrent
plan-card/operator-turn writes to different pending slots can no longer clobber
one another.

**Progress (2026-07-21):** P5-03 is complete in production. A production-copy
Neon branch confirmed migration `20260720010000` was applied 2026-07-21T00:34 UTC
and all 14 tenant foreign keys are validated, with a clean consistency audit over
real production data — the section previously read "not applied" because the
2026-07-21 deploy/validation was never recorded here. Controlled
validation/verification tooling (`npm run validate:tenant-constraints`,
inspect-only by default) landed alongside and is exercised against a real DB.

**Progress (2026-07-28):** The two remaining no-credit/no-traffic code gaps are
complete and deployed. Shopify OAuth now persists a normalized granted-scope
snapshot without erasing unrelated reconnect metadata; its five callback
integration tests, dashboard typecheck and dashboard lint pass. P4-05's
attachment contract is decided and implemented: broad support remains, direct
executables/scripts are rejected after MIME normalization, and only
MIME/extension-matched passive raster images render inline while every other
retained type downloads. The 24 gateway attachment tests and 10 authenticated
dashboard attachment-route tests pass, as do gateway/dashboard typechecks,
lints and diff validation. Commits `0381cce1`, `52270fd1`, and `ca72dcbe` are
live on Vercel and both Railway services; public health checks pass. Release
verification also found and applied the previously missed additive pending-plan
migration, bringing production current across all 62 migrations.

The canonical remaining-work list is now the **Closeout status** section at the
top of this document. Historical progress entries remain here only as rollout
evidence; do not derive current priorities from an older checkpoint.

**Credit-restoration closeout (2026-07-28):** the two credit-exhausted
AI-summary jobs were safely recovered, the production queue and authenticated
health verifier are green, the long-thread quality/token gate passed twice, and
the full committed three-repeat cadence completed above baseline. The cadence
also drove a deterministic tracking-guidance correction and an evidence-based
eval timeout increase; focused model checks now pass. No standalone
credit-blocked item remains. The remaining agent gates require controlled or
representative production traffic and are listed in **Closeout status**.
