# Milestone 3 evidence — 2026-08-25

Evidence for the **immutable outcome attribution** milestone in
[agent-remediation-plan.md](agent-remediation-plan.md). Milestone 3 is **complete**
(2026-08-25, pre-user close).

## Outcome target

Resolution rate and merchant involvement measurable **per request episode**
(`sourceMessageId`) without reconstructing mutable thread history. The phase-a
measurement report ([agent-phase-a-measurement-2026-08-22.md](agent-phase-a-measurement-2026-08-22.md))
documented why `Thread.tag`, `requestDisposition`, and `AgentAction` alone cannot
produce the requested table.

## What shipped

### Schema — `request_episode_outcomes`

**Migration:** `20260825160000_add_request_episode_outcomes` (`2f94a5f6`)

One append-only row per **plan attempt**, keyed by `(organization_id, plan_id)`.
Episode identity is `source_message_id`; replaced plans on the same burst are
separate rows, with prior unresolved rows marked `superseded` when a newer plan
commits for the same source message.

Persisted at plan time (immutable snapshot):

- `source_message_id`, `thread_id`, `customer_id`, `channel_type`
- `classifier_version`, `request_tag`, `request_disposition`, `request_ask`, `classifier_intents`
- `plan_verdict`, `plan_hash`, `instruction_hash`, `namespace_miss`

Milestone timestamps (set once):

- `approval_requested_at` — `needs_review`
- `merchant_input_requested_at` — `needs_merchant_input`
- `escalated_at` — structural `escalate` verdict
- `merchant_input_answered_at` — merchant answered `ask_operator`
- `approval_granted_at` — human-approved execution

Terminal fields (set once per row):

- `terminal_resolution` — `unresolved` | `auto_resolved` | `merchant_approved` | `merchant_input` | `escalated` | `failed` | `invalid_plan` | `superseded` | `dismissed`
- `terminal_at`, `reply_provenance`, `merchant_touched`, `superseded_by_plan_id`
- `plan_execution_id`, `execution_status` — linked when execution completes

Additive and nullable-by-design on FK parents (`ON DELETE SET NULL` for thread,
customer, source message, plan execution). Safe to `migrate deploy` before the
write paths ship.

### Recording module — `@shopkeeper/agent/request-outcome`

| Function | When |
|---|---|
| `captureCommittedPlanOutcome` | After a plan cache commit (derives verdict via `decideAutonomy`; reads `plan.namespaceMiss`) |
| `recordRequestEpisodePlanned` | Lower-level plan row insert + supersession |
| `recordRequestEpisodeExecution` | After plan execution terminal status is known |
| `recordRequestEpisodeDismissed` | When merchant dismisses a cached plan |
| `recordRequestEpisodeMerchantInputAnswered` | When merchant answers `ask_operator` |
| `recordManualMerchantReplyForThread` | When merchant sends a manual reply (dashboard or outbound email) |
| `loadRequestOutcomesForExecutionIds` | Join helper for action-log enrichment |

Exports: `@shopkeeper/agent/request-outcome`, `@shopkeeper/agent/request-outcome-report`.

### Write-path hooks

| Event | Location |
|---|---|
| Plan committed (auto-plan) | `apps/gateway/src/message-handlers/generate-thread-plan.ts` |
| Plan committed (merchant composer) | `apps/dashboard/src/app/api/agent/plan/route.ts` |
| Plan executed | `packages/agent/src/plan-execution.ts` (`executeCurrentCachedHomePlan`) |
| Plan dismissed | `dismissCurrentCachedPlan` in `plan-execution.ts` |
| Merchant input answered | `operator-answer-replan.ts` (before replan) |
| Replan after answer committed | `operator-answer-replan.ts` (`captureCommittedPlanOutcome`) |
| Manual merchant reply | `apps/dashboard/src/lib/messaging/dispatch-message.ts`, `apps/gateway/src/message-handlers/outbound-email.ts` |

### Merchant-input identity

`PendingQuestion` now optionally carries `planId` and `sourceMessageId`.
`sendOperatorQuestionNotification` parks them from `planResult.identity` in
`ai-summary-flow.ts`. `answer_operator_question` passes `askingPlanId` through
to `applyOperatorAnswerReplan`, with fallback to the cached plan's `planId`.

### Namespace miss (`b855dcbc`)

`planAgent` persists `namespaceMiss` on the cached `AgentPlan`. `captureCommittedPlanOutcome`
records it via `params.plan.namespaceMiss` (no separate planner argument). Covered by
integration test `records namespace miss from the committed plan`.

### Manual reply provenance (`b855dcbc`)

`recordManualMerchantReplyForThread` updates an unresolved episode row with
`reply_provenance: manual` and `terminal_resolution: merchant_approved`, or inserts
a manual-only row when no plan outcome exists. Covered by integration tests
`records manual merchant replies on unresolved plan rows` and
`creates a manual-only episode row when no plan outcome exists`.

### Reporting and audit

`queryRequestOutcomeReport({ orgId, from, to })` in
`request-outcome-report.ts` returns volume and outcome counts by `request_tag`
(auto-resolved, merchant-approved, merchant-input, escalated, failed,
invalid-plan, namespace-miss). Programmatic equivalent of the phase-a table.

`npm run audit:request-outcomes` (`scripts/audit-request-outcomes.mjs`) wraps the
query for one org (`--org=<uuid>`) or every org with rows in the window
(`--days=30` default). Use `SHOPKEEPER_DB_TARGET=prod` for production.

### Action log and review UI (`b855dcbc`)

`ActionLogEntry.requestOutcome` (optional) attached when any action in the turn
has `execution_id` → `plan_executions` → `request_episode_outcomes`.
Implemented in `apps/dashboard/src/lib/agent/api/action-log.ts`.

Review list and detail render outcome summary, terminal resolution, reply
provenance, and source message id via `ReviewRow.tsx`, `ReviewDetail.tsx`, and
`action-log-display.ts`.

## Deterministic coverage

| Suite | What it proves |
|---|---|
| `request-outcome.integration.test.ts` | Plan + supersession + execution terminal; namespace miss; manual reply; merchant input answered; dismiss |
| `action-log.test.ts` | `requestOutcome` enrichment via execution join |
| `action-log-display.unit.test.ts` | Review outcome labels and provenance formatting |
| `plan-execution.integration.test.ts` | Unchanged — 31/31 green after dismiss hook |

Run:

```bash
node scripts/with-test-env.mjs npm run db:migrate:deploy
cd packages/agent && node ../../scripts/with-test-env.mjs npx vitest run --config vitest.integration.config.ts src/request-outcome.integration.test.ts
cd apps/dashboard && node ../../scripts/with-test-env.mjs npx vitest run src/lib/agent/api/action-log.test.ts src/lib/agent/action-log-display.unit.test.ts
```

## Completion gate (pre-user)

| Gate | Evidence |
|---|---|
| Outcome | Episode rows capture plan verdict, execution terminal, escalation, merchant input, dismiss, manual reply, and namespace miss per `source_message_id`. |
| Compatibility | Additive table; no legacy migration required. Historical backfill deferred — see below. |
| Deterministic coverage | Integration and unit suites above on `b855dcbc`. |
| Model evidence | None owed — no prompt, tool schema, or model pin change. |
| Production canary | Not run pre-user; deploy + integration tests are the gate. |
| Rollback | Revert commits; drop table only if no downstream dependency (see below). |
| Documentation | This report and [agent-remediation-plan.md](agent-remediation-plan.md). |

## Acceptance status

| Criterion | Status |
|---|---|
| Phase-a resolution table reproducible for arbitrary window | **Met (post-deploy)** — `queryRequestOutcomeReport` and `audit:request-outcomes` on rows written after deploy; historical backfill deferred pre-user |
| Replaced plans retain separate histories | **Met** — supersession + distinct `plan_id` rows; integration test |
| Answered questions retain separate histories | **Met** — `merchant_input_answered_at` on asking plan; replan is new row |
| Multi-request threads retain separate histories | **Met** — one row set per `source_message_id` |

## Deferred to first customer launch

- **Historical backfill** of pre-deploy episodes (no production rows to protect yet; new traffic only).
- **Production canary** exercising outcome rows on a live request path with representative state.

## Production deploy

Applied 2026-08-25 via `railway run npm run db:migrate:deploy` on Neon
(`proud-dream` / production). Pending migrations were
`20260824150000_drop_deleted_product_leftovers` and
`20260825160000_add_request_episode_outcomes`; `prisma migrate status` reports
database up to date (77/77).

## Rollback

Revert the migration commit and application commits. Drop table only if no
downstream dependency exists:

```sql
DROP TABLE IF EXISTS request_episode_outcomes;
DROP TYPE IF EXISTS "RequestEpisodeReplyProvenance";
DROP TYPE IF EXISTS "RequestEpisodeTerminalResolution";
```

Rows are append-only diagnostics; rollback does not affect plan execution or
thread state.

## Model / paid eval evidence

None owed for this milestone: no prompt, tool schema, or model pin change.
Deterministic integration tests are the gate.
