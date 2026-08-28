# Milestone 4 evidence — 2026-08-25

Evidence for the **bounded replanning after definite failure** milestone in
[AGENT_AUDIT.md](../AGENT_AUDIT.md). Milestone 4 is **complete
(pre-user close)** as of 2026-08-25.

## Outcome target

A valid multi-step plan can recover **once** from a definite provider rejection
without duplicating completed work or weakening approval requirements. Unknown
provider outcomes never replan — they escalate.

## What shipped

### Outcome classification — `execution-outcome.ts`

| Function | Purpose |
|---|---|
| `isDefinitePlanExecutionFailure` | True for `failed` and `partial` (some steps committed, some failed definitely) |
| `isUnknownPlanExecution` | True when any action has `unknown` status |
| `ledgerStatusForPlanOutcome` | Maps presentation `partial` → durable ledger `failed` |
| `hasUnknownProviderOutcome` | Action-level unknown detector (shared with execution loop) |

### Stop on definite failure — `run-execution.ts`, `run.ts`

Approved-plan execution (`runAgent` with `approvedToolCalls`) sets
`stopOnDefiniteFailure: true`. The tool loop breaks after the first
`error` or `policy_block`, leaving remaining approved steps for the child
replan instead of running them in the failed parent attempt.

### Replan module — `@shopkeeper/agent/plan-failure-replan`

| Function | Purpose |
|---|---|
| `buildFailureReplanPlanningInstruction` | Appends committed steps + failure reason to the base instruction |
| `canAttemptFailureReplan` | Eligibility: definite failure, remaining work, no unknown, no nested replan |
| `childPlanRepeatsCommittedSteps` | Rejects child plans that reuse committed tool-call ids |
| `failureReplanAutonomyAllowed` | Child autonomy rank must not exceed parent |
| `attemptFailureReplanAfterExecution` | Calls `planAgent`, validates, commits child cache + outcome row |
| `escalateThreadForUnknownPlanExecution` | Sets `Thread.escalatedAt` when execution ends in unknown |

Child cache rows carry optional `failureReplan` metadata
(`plan-cache-shape.ts`): parent plan id/hash, committed tool-call ids,
committed action summaries, failure tool, and failure reason. A cached plan
with `failureReplan` set cannot spawn another replan (`failureReplanAllowed:
false` on child execution).

### Execution integration — `plan-execution.ts`

After `executeCurrentCachedHomePlan` completes a parent attempt:

1. **Unknown** → escalate thread, return (no replan).
2. **Definite failure** + `deps.planAgent` + no existing `failureReplan` →
   `attemptFailureReplanAfterExecution`, then recursive
   `executeCurrentCachedHomePlan` with `failureReplanAllowed: false`.
3. Child runs through the same claim, validation, autonomy, and execution
   ledger path as any other cached plan.

Whole-turn throws during execution still map to **unknown** (P3 posture
unchanged) and escalate without replan.

### Host wiring

| Host | Change |
|---|---|
| `apps/gateway/src/message-handlers/agent-turn-deps.ts` | `buildGatewayPlanExecutionDeps` passes `planAgent` |
| `apps/dashboard/src/lib/agent/api/plan-execution.ts` | `buildDashboardPlanExecutionDeps` passes `planAgent` |

Auto-plan (`maybeAutoExecuteCurrentCachedHomePlan`) inherits replan behavior
through `executeCurrentCachedHomePlan`.

### Merchant notification dedup — gateway auto-execution path

When a parent plan partially fails and a child replan completes the remaining
work, the merchant must be notified **once** — not silenced because the child
was a successful safe reply, and not pinged separately for parent failure and
child recovery.

| Piece | Purpose |
|---|---|
| `FailureReplanRecovery` on `executeCurrentCachedHomePlan` | Parent failure context attached to a successful child execution |
| `buildAutoExecutionResult` (`generate-thread-plan.ts`) | Sets `failureReplanRecovered`, merges parent + child actions, passes failure tool/reason |
| `shouldNotifyAutoExecution` (`planning-types.ts`) | Fans out one notification when recovery happened, even for `safe_reply` + `success` |
| `formatAutoExecutionMessage` (`planning-notifications.ts`) | Combined copy: partial failure + recovery in one message |
| `autoExecutionNotificationIdempotencyKey` | Same instruction-scoped key for the whole episode (retry-safe) |

The gap before this slice: a three-step mutative plan whose middle step failed
definitely and whose child finished with only `send_reply` looked like a routine
safe-reply success, so `ai-summary-flow` sent **no** operator notification and
the merchant never learned the refund (or other step) failed.

## Deterministic coverage

| Suite | What it proves |
|---|---|
| `plan-failure-replan.test.ts` | Remaining-step derivation, unknown rejection, autonomy rank guard, instruction shape |
| `execution-outcome.test.ts` | Definite vs unknown classification; partial → failed ledger mapping |
| `plan-execution.integration.test.ts` → `bounded failure replan` | Three-step partial failure → one replan → child completes; `failureReplanRecovery` set; unknown → no replan + `escalatedAt` |
| `generate-thread-plan.test.ts` | Recovery flags and merged actions on auto-execution result |
| `ai-summary-flow.unit.test.ts` | One auto-execution notification when recovery finishes with a safe reply |
| `planning-notifications.test.ts` | Combined recovery copy in operator message |

Run:

```bash
cd packages/agent && npm run test:unit -- src/plan-failure-replan.test.ts src/execution-outcome.test.ts
cd packages/agent && node ../../scripts/with-test-env.mjs npm run test:integration -- src/plan-execution.integration.test.ts
cd apps/gateway && node ../../scripts/with-test-env.mjs npx vitest run src/message-handlers/generate-thread-plan.test.ts src/message-handlers/planning-notifications.test.ts
cd apps/gateway && npm run test:unit -- src/message-handlers/ai-summary-flow.unit.test.ts
```

## Acceptance status

| Criterion | Status |
|---|---|
| Three-step fixture: step two fails definitely, remaining work succeeds once | **Met** — integration test with mocked `planAgent` + sequential `runAgent` |
| Three-step fixture: merchant notified once | **Met** — `shouldNotifyAutoExecution` + recovery metadata; gateway unit tests assert one fan-out |
| Unknown-outcome fixture: no replan | **Met** — `planAgent` not called; cache consumed |
| Unknown-outcome fixture: escalation occurs | **Met** — `Thread.escalatedAt` set |
| Unknown-outcome fixture: no duplicate side effect | **Met** — existing unknown skip semantics; single `runAgent` call |

## Completion gate (pre-user)

| Gate | Evidence |
|---|---|
| Outcome | One bounded child replan after definite failure; unknown escalates; merchant notified once on recovery |
| Compatibility | Optional `failureReplan` JSON on existing cache column; no migration |
| Deterministic coverage | Agent integration + gateway notification tests (see above) |
| Model evidence | None owed — replan instruction unchanged; targeted eval when prompt or pin changes |
| Production canary | Deferred pre-user — auto-plan replan path covered by integration tests |
| Rollback | Revert commits; omit `planAgent` from host deps to disable replan |
| Documentation | This plan and the evidence report |

## Deferred to first customer launch

- **Failure-replan prompt tuning** with real `planAgent` calls (targeted eval when instruction or model pin changes).
- **Production canary** on the live auto-plan replan path.

## Rollback

Revert application commits. No schema migration. `failureReplan` is optional
JSON on the existing `threads.cached_plan` column; older readers ignore it.
Disabling replan without revert: omit `planAgent` from host `PlanExecutionDeps`
(plan-execution skips replan when `deps.planAgent` is absent).

## Model / paid eval evidence

None owed for this plumbing slice: integration tests mock `planAgent`. A paid
eval is owed only when the failure-replan planning instruction or model pin
changes — use `targeted` mode on the replan-affected fixtures per
[agent-eval-gates.md](agent-eval-gates.md).
