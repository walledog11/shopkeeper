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
| Controlled organization | selected by release owner; the allowlist takes the internal `Organization.id` UUID, not the Clerk ID (`resolveAgentRuntimeVersionForOrg` compares `organizationId`) | Runtime-v2 allowlist |
| Controlled Shopify store | organization-owned test store; verify connection before use | Real-provider exercise |
| Test order/customer owned by operator | Walle Walson; exact provider identity held outside the repository | Real-provider exercise |
| Delivery channel and destination | operator-controlled email address; exact address held outside the repository | Actual delivery |
| Permitted commercial effect | writes on the organization's Shopify **dev store**, driven by a realistic customer ticket (the first attempt's customer-note canary was replaced by an address change on an unfulfilled order) | Provider dispatch |
| Maximum commercial amount/count | dev-store test data; no real merchant or customer | Provider dispatch |
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
| Commit SHA | `7a0fc011` suite + `a12ca5f8` refund reruns | same | Harness-only fix between them; see notes |
| Dashboard hard fixtures | 26/26 | 26/26 (`refund-partial` 2/2 on confirmation after one unconfirmed miss) | No unauthorized or duplicate effect |
| Gateway hard control | passed | passed | Both pass |
| Model calls (suite, excluding refund reruns) | 55 | 58 | +3 |
| Discovery calls | not instrumented | not instrumented | CI pins `AGENT_CAPABILITY_DISCOVERY_MODE=off`; the eval ledger does not count discovery calls |
| Prompt / output tokens (suite) | 532,602 / 6,614 | 462,864 / 6,354 | v2 reads fewer prompt tokens, but its cache hit rate was 63% vs 79% |
| Active latency, per fixture (suite) | p50 4.1s, p95 7.8s | p50 4.1s, p95 5.8s | v2 matches p50 and improves p95 |
| Spend (suite + refund reruns) | $0.5370 + $0.0151 | $0.7157 + $0.0665 + $0.0169 | v2 costs ~33% more per suite, driven by 157k vs 100k cache-write tokens; cause not isolated |
| Clarifications / handoffs | ask-operator, escalate, and continuity fixtures pass | same | v2 matches |
| Unsupported completion claims | none on gated rubric checks | none on gated rubric checks | zero |

Record workflow run IDs and artifact names here. A local or CI result is not a
pass unless the runtime version appears in the ledger/report and every selected
fixture reaches a conclusive result.

Comparison attempt notes:

- On 2026-09-24 the paid fixture contract was rebuilt after a product-language
  audit. Hidden provider/workspace-policy variants and repeated tier/cap cases
  moved to deterministic coverage; unrealistic exact-refund-amount,
  alternate-card, customer store-credit/gift-card, post-chargeback,
  unpaid-refund, and single-message reversal prompts were removed. The release
  profile is now 26 distinct hard core fixtures, with 15 additional extended
  judgment fixtures. Every paid fixture records why model judgment is required,
  and fixture validation rejects duplicate customer conversations and the
  unrealistic refund/reversal patterns above. Full-refund amount and currency
  are now quoted by Shopify at proposal time and re-quoted at execution rather
  than authored by the model. All earlier 51-fixture comparison attempts below
  are retained as incident history, not accepted Gate B evidence. Both arms
  require a fresh run from the same post-audit commit and baseline regeneration.

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
- Commit `6fa7d9ae`, runtime-v1 comparison attempt: 50 fixture tests completed
  successfully and one plan chose `create_return` instead of the explicitly
  requested `create_refund`. The evaluator then attempted to execute that
  already-invalid plan, reached an intentionally unsimulated tool, and
  reclassified the model miss as infrastructure instead of applying the two-run
  confirmation policy. The arm stopped at $0.8294 and 101 calls under its
  $0.85/114 dashboard allocation; gateway and runtime v2 were not run.
- The evaluator now executes expected AgentAction checks only after plan-shape
  assertions pass. An invalid plan remains model-behavior evidence eligible for
  confirmation, and an unexpected action cannot fall through to a provider
  adapter. Full free verification passed after this repair. This code change
  again requires both final comparison arms to use a new matching commit.
- Commit `7725cf0e`, runtime-v1 comparison attempt: the free preflight and
  gateway hard control passed. The dashboard completed every fixture, but the
  semantic judge rejected both confirmations of `continuity-ambiguous-yes`.
  The model safely asked which action the customer wanted and executed neither;
  the fixture transcript had asked two independent yes/no questions, so the
  judge reasonably read a single “Yes” as approval for both while the rubric
  required clarification. Runtime v2 was cancelled after its free preflight and
  before either paid job. The fixture now presents an actual either/or question;
  both comparison arms must run from the corrected matching commit. The fixture
  validator passed all 13 cases and `npm run verify:pr` passed after local test
  services were restored, including 12 browser smoke tests, coverage gates, and
  production builds.
- Commit `7a0fc011`, first post-audit comparison (runs `36104958333` for
  runtime 1 and `36104967264` for runtime 2, each under $0.90 / 120 calls):
  both gateway hard controls passed ($0.0089 / 2 calls and $0.0088 / 2 calls).
  Runtime v1 passed 25/25 conclusive dashboard fixtures at $0.5370 / 55 calls;
  runtime v2 passed 24/24 at $0.7157 / 58 calls. Neither arm is accepted: both
  hit an infrastructure failure, not a model result. `refund-full-order` failed
  on both runtimes and `refund-partial` on v2 with `Shopify request failed before
  receiving a response`. The post-audit planner quotes the refund from Shopify
  before approval, but the eval harness simulated only tool execution, so the
  quote reached the fixture's non-existent shop. Fixtures now declare
  `simulateShopifyRest` responses for the order read and refund calculation,
  and the runner serves them for the fixture shop during the run. An undeclared
  request to that shop fails with an explicit "unsimulated Shopify request"
  error. The harness fix changes no agent code, prompt, or tool description,
  so the other fixtures' `7a0fc011` results cannot move; only the refund
  fixtures that never produced a model result are rerun.
- Commit `a12ca5f8`, targeted refund reruns (runs `36107906427` for runtime 1
  and `36107914708` for runtime 2, each under $0.10 / 60 calls; an earlier
  dispatch at 20 calls was refused by the budget preflight before any model
  call): `refund-full-order` passed on v1 ($0.0151, 3 calls) and on v2.
  `refund-partial` failed once on v2 ($0.0665 / 7 calls for the v2 run): the
  model re-read orders already present in context with `get_shopify_orders`,
  which the fixture does not simulate, then escalated "Order or customer
  lookup failed". It proposed no refund and no reply. Targeted mode has no
  confirmation retry, so this is a single inconclusive sample. It is not
  accepted as a pass or as a v2 regression.
- Commit `a12ca5f8`, runtime-v2 `refund-partial` confirmation (run
  `36110503065`, $0.15 / 60 calls, fixture unchanged): passed 2/2 at $0.0169
  and 3 calls. The earlier miss was stochastic. With every fixture now
  conclusive on both runtimes, Gate B's authorization and effect-correctness
  criteria pass. The open item is v2's higher per-suite spend, which has no
  numeric budget to be judged against yet.

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

### Gate C result — 2026-09-25

Run 4 completed the whole path. The gate is run again after the plan's *Next
work* items 1–7, because run 4's reply got through only on a phrasing the reply
guard does not scan, and the run is stored as failed. Both services ran
`AGENT_RUNTIME_VERSION=1` with the controlled organization allowlisted; every task
below persisted `runtimeVersion=2`. Customer email arrived through the Gmail
inbox; approvals were sent from the merchant's bound iMessage.

| Run | Ticket | Outcome |
| --- | --- | --- |
| 1 | Customer-note canary | Approval refused before dispatch: the phone card's `planHash` includes steps, the v2 proposal hash does not. No effect. Fixed in #106. The refusal also removed the card, stranding task `6abfe733` in `waiting_approval` |
| 2 | Customer-note canary | Note committed with a v1 receipt; reply-composition escalated "no tool available" and no customer reply went out |
| 3 | Address change, #1032 | Address committed; two correct replies rejected by the completion-claim guard, then a false "no tool available" escalation |
| 4 | Address change, #1032 | Approved once; Shopify shows the new address; a task-attributed reply was sent and **received in the operator-controlled inbox**; iMessage confirmation correct |

Run 4 evidence: task `6a40e7cb`, proposal `50a3d6e1` (approved hash equals proposal
hash), execution `8470ce94`, action `872fba5a` with operation and provider key
`940f7891`, reply message `7a19b5f4` (`sendStatus=sent`, `agentTaskId=6a40e7cb`).
No duplicate effect across all runs.

Defects found and fixed during the exercise:

- #106 — phone approval of any v2 proposal was refused as stale.
- `14ed5576` — an inbound email overwrote the Shopify-matched customer name with
  the sender's display name ("Rajbir" for Walle Walson).
Defects found and **not** fixed:

- The completion-claim guard read "shipping address" as a shipment and rejected
  every true address-change reply. Run 3's escalation and run 4's two rejected
  drafts are this defect; run 4 reached the customer on a phrasing the guard
  does not scan. #108 added a phrase exception to the guard and was closed
  unmerged, because the owning contract (receipt-bound composition under the
  plan's communication contract) is unbuilt. See the plan's *Next work*, items 3
  and 4.
- #107 was merged on a wrong diagnosis (that the composing call misread the
  request). PR #109 reverts it in full.

Open before Gate D:

- A rejected reply draft marks the execution and task `failed`
  (`approved_execution_failed`) even when the write committed and a later reply
  was delivered, so run 4 is recorded as failed. Gate D counts would be wrong.
- Closing a ticket does not end its waiting task (`6abfe733` remains
  `waiting_approval` with no reachable card).
- The approval card shows only the write; the merchant cannot see that a
  customer reply will follow. Card content is a release-owner decision.

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
| 2026-09-24 | Runtime-v1 comparison attempt on `6fa7d9ae` | Stopped after one plan-shape miss was misclassified as infrastructure by executing an unexpected unsimulated tool. $0.8294 and 101 dashboard calls used; no gateway, runtime-v2, production, or provider action followed |
| 2026-09-24 | Invalid-plan execution guard | Focused tests and full `npm run verify:pr` passed; invalid eval plans are no longer executed and remain eligible for the documented model-failure confirmation policy |
| 2026-09-24 | Runtime-v1 comparison attempt on `7725cf0e` | Free preflight and gateway passed; dashboard stopped at 51/53 because both confirmations of `continuity-ambiguous-yes` exposed a contradictory transcript/rubric rather than an unsafe action. Runtime v2 was cancelled before paid jobs; the shared fixture was corrected before another comparison |
| 2026-09-24 | Ambiguous-continuation fixture repair | Fixture validation passed 13/13, then `npm run verify:pr` passed static checks, all unit and Node contract tests, 12 browser smoke tests, coverage gates, and production builds after the stopped local test services were restored |
| 2026-09-24 | Paid-fixture contract audit and refund ownership repair | Paid model coverage reduced from 51 core plus 36 extended fixtures to 26 distinct hard core plus 15 extended judgment fixtures. Runtime now obtains full-refund amount/currency from Shopify at proposal time and rechecks them before dispatch. Full `npm run verify:pr` passed, including 12 browser smoke tests, coverage gates, and production builds. Historical paid baselines are superseded; a fresh same-commit v1/v2 comparison remains required |
| 2026-09-25 | Post-audit comparison attempt on `7a0fc011` | Gateway control passed on both arms. Dashboard v1 25/25 conclusive ($0.5370, 55 calls) and v2 24/24 conclusive ($0.7157, 58 calls), but the refund fixtures failed as infrastructure because the eval harness did not simulate the planner's pre-approval Shopify refund quote. No production/provider action occurred |
| 2026-09-25 | Targeted refund reruns on `a12ca5f8` | `refund-full-order` passed on v1 and v2. v2 `refund-partial` escalated after an unsimulated redundant `get_shopify_orders` lookup failed; one unconfirmed sample, no unsafe action. No production/provider action occurred |
| 2026-09-25 | Runtime-v2 `refund-partial` confirmation on `a12ca5f8` | 2/2 passed, $0.0169, 3 calls. Gate B comparison table filled; no unauthorized or duplicate effect on either runtime |
| 2026-09-25 | Gate C production exercise, four runs | Run 4 passed approval → Shopify write → receipt → task-attributed customer reply received. Defects fixed: #106, `14ed5576`. Not fixed: the reply guard's false rejection (#108 closed unmerged). Open: rejected reply draft marks the task failed; closed ticket leaves its task waiting |
