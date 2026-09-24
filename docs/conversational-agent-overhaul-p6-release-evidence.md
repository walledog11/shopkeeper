# Conversational agent Package 6 release evidence

Status: preparation in progress. This file is the execution record for Package
6 of the [overhaul plan](conversational-agent-overhaul-plan.md). It records
release inputs and evidence; it does not authorize a production effect by
itself.

Started 2026-09-23 from commit `c2195343` (`Close conversational agent overhaul
package 5`).

## Current production posture

- Railway project `proud-dream`, production environment, has the `shopkeeper`
  and `Gateway Worker` services online.
- On 2026-09-23, neither service declared `AGENT_RUNTIME_VERSION`,
  `AGENT_RUNTIME_V2_ORG_IDS`, `AGENT_PROPOSAL_SUSPENSION_MODE`, or
  `AGENT_CAPABILITY_DISCOVERY_MODE`. The code defaults therefore keep new tasks
  on runtime v1 with the compatibility feature flags off.
- Both services have the model and database configuration needed by the
  existing application. Values were not copied into this document.
- No production routing variable has been changed and no external effect or
  customer delivery has been attempted for Package 6.

## Required controlled-release inputs

The release owner must fill these before a paid or effectful step. Use a test
workspace and destination owned by the release operator; never select a merchant
or customer from production data merely because it is available.

| Input | Selected value | Required before |
| --- | --- | --- |
| Release owner | Rajbir Sambi | Any production change |
| Controlled Clerk organization ID | selected by release owner; exact value held outside the repository | Runtime-v2 allowlist |
| Controlled Shopify store | organization-owned test store; verify connection before use | Real-provider exercise |
| Test order/customer owned by operator | Walle Walson; exact provider identity held outside the repository | Real-provider exercise |
| Delivery channel and destination | operator-controlled email address; exact address held outside the repository | Actual delivery |
| Permitted commercial effect | append one explicit canary note to the selected test customer | Provider dispatch |
| Maximum commercial amount/count | one customer-note mutation; no financial effect | Provider dispatch |
| v1 eval ceiling | $0.90 / 120 model calls | Paid v1 comparison |
| v2 eval ceiling | $0.90 / 120 model calls | Paid v2 comparison |
| Rollout observation window and operator | pending | Routing change |

## Gate A — comparison tooling and free verification

- [x] Add an explicit `EVAL_AGENT_RUNTIME_VERSION=1|2` selector to the dashboard
  eval runner without changing the unset/default behavior.
- [x] Record the selected runtime in the eval ledger and isolate reusable result
  caches by runtime.
- [x] Add the same selector to the manual eval workflow and its artifact cache
  keys. Keep legacy compatibility flags off during an explicit comparison.
- [x] Pass focused eval-control tests.
- [x] Pass the free deterministic eval preflight.
- [x] Pass `npm run verify:pr` on the comparison-tooling diff.

Stop if fixture validation, runtime selection, cache isolation, deterministic
effect counts, or the aggregate gate fails. Do not compensate with a paid run.

## Gate B — v1/v2 model comparison

Run both arms from the same commit with identical fixture selection, model
settings, repeats, judge settings, and separately approved ceilings. The gateway
fraud-review eval is a runtime-independent control and should not be interpreted
as v1/v2 support-planner evidence.

Recommended first comparison is the one-repeat release set. If it passes, run
the full three-repeat drift set only with a separately approved larger budget.
For GitHub Actions, dispatch `.github/workflows/evals.yml` twice with all inputs
identical except `runtime_version` (`1`, then `2`). Download both evidence
artifacts and record:

| Measure | Runtime v1 | Runtime v2 | Decision |
| --- | ---: | ---: | --- |
| Commit SHA | pending | pending | must match |
| Dashboard hard fixtures | pending | pending | no unauthorized/duplicate effect |
| Gateway hard control | pending | pending | both pass |
| Model calls | pending | pending | explain delta |
| Discovery calls | pending | pending | explain delta |
| Input/output tokens | pending | pending | explain delta |
| Active latency | pending | pending | within approved release budget |
| Spend | pending | pending | within explicit ceiling |
| Clarifications / handoffs | pending | pending | v2 matches or improves |
| Unsupported completion claims | pending | pending | zero |

Record workflow run IDs and artifact names here. A local or CI result is not a
pass unless the runtime version appears in the ledger/report and every selected
fixture reaches a conclusive result.

Comparison attempt notes:

- Commit `ffa00508`, runtime v1: all 51 dashboard core fixtures passed in one
  repeat, using $0.8428 and 104 model calls under the $0.85/114 dashboard
  allocation. The gateway hard control also passed under its $0.05/6
  allocation.
- The first runtime-v2 attempt was stopped after the first mutative mismatch.
  The model correctly suspended at `update_shopify_order_address`; the legacy
  fixture incorrectly required the speculative `send_reply` that runtime v2 is
  designed to omit. The run was interrupted rather than spending the rest of
  its budget on structurally invalid assertions.
- The runner now treats a v2 action-only plan as a suspended write proposal:
  proposal inputs and forbidden actions remain gated, while speculative reply
  and reply-action expectations are omitted. Provider/execution correctness
  remains covered by deterministic receipt and host tests rather than being
  conflated with this model-decision comparison.
- `ffa00508` is preliminary v1 evidence, not the final comparison arm, because
  the assertion repair changes the evidence-producing commit. Both arms must be
  rerun from the repair commit before Gate B can pass.
- Commit `81732848`, runtime v1: all 51 dashboard fixtures passed with runtime
  `1` recorded, using $0.5024 and 106 model calls under the $0.85/114 dashboard
  allocation. The bounded gateway hard control passed.
- Commit `81732848`, runtime v2: the run was stopped after
  `storefront-guest-product-search` failed both confirmation attempts. The
  planner performed the product read but emitted no `send_reply`, causing
  autonomy to fall back to review. The v2 gateway control was not run after the
  dashboard blocker. Because the process was interrupted immediately, it did
  not emit a trustworthy aggregate spend/call summary; both hard caps remained
  active throughout the run.
- Root cause: proposal suspension also disabled the normal one-time terminal
  reprompt for read-and-reply support turns. The repair keeps immediate write
  suspension while restoring that reprompt whenever no write or terminal tool
  was proposed. This code change requires another same-commit comparison; no
  pre-repair arm is final Gate B evidence.
- Commit `c772602f`, targeted runtime-v2 repair check: the previously failing
  `storefront-guest-product-search` fixture passed 1/1 with runtime `2`
  recorded, using $0.0072 and 2 model calls under the approved $0.07/20 ceiling.
  A fresh commit-specific result cache prevented reuse of pre-fix evidence.

## Gate C — controlled real-provider and delivery exercise

Preconditions:

- Gate A passes; Gate B has no authorization or effect-correctness regression.
- The controlled inputs above are complete.
- Dashboard and gateway are deployed from the same accepted commit and have
  matching runtime variables.
- The chosen task has one exact expected effect, a bounded amount/count, and a
  test destination. Capture provider state before starting.

Sequence:

1. Keep `AGENT_RUNTIME_VERSION=1` and set
   `AGENT_RUNTIME_V2_ORG_IDS=<controlled-org-id>` on both services.
2. Submit a new request after the deployment; confirm its persisted task has
   `runtimeVersion=2` before approval.
3. Review the exact proposal target, inputs, destination, and displayed draft.
4. Approve once. Record the proposal, execution, action, stable operation, and
   provider reference in redacted form.
5. Confirm the typed receipt from storage and the actual provider state.
6. Confirm the attributed response row and actual test-destination delivery.
7. Retry only a deliberately induced definite delivery failure, if one is part
   of the approved exercise. Confirm that retrying delivery does not repeat the
   commercial action.

Stop immediately for an unauthorized or duplicate effect, mismatched target or
amount, an unsupported success claim, an unexplained unknown outcome, or a
response lacking the task identity. Preserve uncertain operations for
reconciliation; never retry the write merely to make the exercise green.

## Gate D — observation and rollback rehearsal

During the agreed observation window, record at least:

- accepted, queued, running, waiting, reconciling, and stuck task counts;
- action outcomes and age of unknown operations;
- duplicate operation-key groups and repeated execution observations;
- response delivery states and age of pending/failed/unknown rows;
- calls, tokens, spend, and active latency for completed tasks.

Rollback rehearsal changes routing only for newly-created tasks:

1. Clear `AGENT_RUNTIME_V2_ORG_IDS` on both services while leaving
   `AGENT_RUNTIME_VERSION=1`.
2. Confirm a new controlled request persists runtime v1.
3. Confirm the earlier runtime-v2 task remains pinned to v2 and can still be
   read, delivered, completed, or reconciled by the v2 worker.
4. Restore the allowlist only if the release decision is to continue staging.

Do not roll back the additive schema, rewrite task versions, or resubmit an
uncertain provider operation.

## Gate E — persisted-state inventory and deletion

Before deleting each v1 responsibility, rerun the read-only conversational
overhaul inventory and name the active caller/record count, replacement, and
historical reader that remains. Candidate responsibilities are:

- forced speculative completion drafting;
- full-registry widening;
- active result-text completion-fact extraction;
- duplicated channel approval/policy branches;
- obsolete runtime adapters and cached-plan recovery paths.

Deletion is complete only when no actionable v1 record or active caller needs
the responsibility, `npm run lint:knip` and `npm run verify:pr` pass, and the
architecture/product documentation describes the single active runtime.

## Evidence log

| Time (UTC) | Evidence | Result |
| --- | --- | --- |
| 2026-09-24 | Railway service status and rollout-variable name check | Both services online; rollout variables absent; no mutation performed |
| 2026-09-24 | Focused eval controls | Dashboard selection/cache tests 7 passed; eval-ledger Node test passed; dashboard typecheck, structure/docs checks, and `git diff --check` passed |
| 2026-09-24 | Free eval preflight | Agent unit tests 1,232 passed; dashboard eval-control tests 34 passed; all fixtures loaded/validated without model calls; gateway deterministic pre-filter passed |
| 2026-09-24 | Production read-only inventory, complete UTC window 2026-09-10 through 2026-09-23 | No unknown action, stale claim, duplicate operation key, or unresolved reservation. Compatibility inventory: 37 cached plans, 10 pending executions, 247 actions without execution IDs, 730 without operation keys; one failed and one unknown historical email delivery remain |
| 2026-09-24 | `npm run verify:pr` with local socket access | Passed static checks, all unit and Node contract tests, 12 browser smoke tests, coverage gates, and production builds. The first attempt stopped at browser startup only because local services had been shut down and sandbox socket access was denied |
| 2026-09-24 | Release-owner authorization | Controlled organization/customer/destination selected; one non-financial customer-note mutation approved; v1 and v2 comparison arms approved at $0.90 / 120 calls each |
| 2026-09-24 | Preliminary runtime-v1 release eval on `ffa00508` | Dashboard 51/51, $0.8428, 104 calls; gateway hard control passed. Superseded as final comparison evidence by the v2 assertion repair |
| 2026-09-24 | First runtime-v2 comparison attempt | Stopped on an evaluator contract mismatch: v2 correctly suspended at the write proposal while the fixture still demanded a speculative reply. No production/provider action occurred |
| 2026-09-24 | Runtime-v2 assertion repair verification | `npm run verify:pr` passed static checks, all unit and Node contract tests, 12 browser smoke tests, coverage gates, and all production builds; the dashboard suite includes 810 unit tests and the proposal-specific focused tests passed |
| 2026-09-24 | Controlled-target read-only preflight | Supplied organization is active with exactly one active Shopify integration; the redacted customer identity resolves to exactly one non-deleted local record and one provider customer. The provider note before-state is empty; no mutation performed |
| 2026-09-24 | Same-commit comparison attempt on `81732848` | Runtime v1 dashboard passed 51/51 at $0.5024 and 106 calls; gateway control passed. Runtime v2 exposed a confirmed read-and-reply regression and was stopped before completion or gateway. No production/provider action occurred |
| 2026-09-24 | Runtime-v2 read-and-reply repair verification | Focused planner/eval tests passed, followed by full `npm run verify:pr`: static checks, typechecks, all unit and Node contract tests, 12 browser smoke tests, coverage gates, and production builds passed |
| 2026-09-24 | Targeted runtime-v2 repair check on `c772602f` | `storefront-guest-product-search` passed 1/1 with runtime `2`, $0.0072 spend, and 2 model calls. No confirmation retry, production action, or provider mutation occurred |
