# Shopkeeper — Agent Reliability and Capability Plan

**Status:** canonical execution plan

**Last reconciled:** 2026-08-27 (Milestone 7 complete and merged in `4d69d40c`, PR #71)

**Current milestone:** none building. Every milestone is complete. Two open items remain, both
process rather than product: the `baseline.json` recapture, and branch protection on `master`.
Neither blocks a milestone. See [Retiring this document](#retiring-this-document) for what has to
be true before this file can be deleted.

This is the single source of truth for agent remediation and capability work. `AGENT_AUDIT.md` is historical evidence, not a second work order.

## Goals

1. **Every merchant request is actionable.** A card or briefing never asks for a decision without source-grounded context.
2. **Persisted schema changes preserve live state.** Versioned data is supported, migrated, or deliberately retired only after a production inventory and rollout gate.
3. **One safe decision path.** Plans use typed signals, one autonomy owner, validation before execution, and current-state policy enforcement.
4. **Tests cover real workflows.** Acceptance follows inbound request → classification → plan/escalation → merchant surface → merchant response.
5. **Outcomes are observable.** Request identity, verdict, execution, escalation, and merchant touch are durably attributable.
6. **Capabilities expand behind proven foundations.** New autonomy and mutation surface cannot bypass safety, compatibility, or evidence gates.

## Non-negotiable invariants

- Customer-facing input remains in capture-mode planning with deterministic adjudication.
- `decideAutonomy` is the only planning/preview autonomy owner. Execution-time policy remains the authoritative current-state backstop.
- Invalid plans are preserved for diagnosis and cannot execute. Never repair model output and ship the remainder.
- Merchant preferences are guidance only. They never change caps, policy, authentication, or autonomy tier.
- Never replan after an unknown provider outcome. Unknown means escalate.
- Never auto-promote an inferred merchant preference.
- Never ask the merchant to approve or decide an item whose request cannot be shown.
- Never remove support for persisted data based only on fixture migration or code age.
- Shop-management writes are operator-only. Promotion and repricing tools live in the gateway's
  operator module tools, never the shared registry, so a customer conversation has no promotion
  tool to reach for. The value-at-risk guard is the second line, not the only one.
- A promotion is an expiring automatic discount, never a price edit. Ending one restores prices
  because none were changed.
- Every write that moves money names what it touches. No tool takes a query, a collection, or a
  wildcard, and no refund tool lets the model name the amount: Shopify prices the selection and the
  cap applies to Shopify's figure.

## Completion gate for every milestone

A milestone is complete only when all applicable evidence exists:

1. **Outcome:** the user-visible behavior and failure behavior are stated.
2. **Compatibility:** persisted versions and live-state counts are inventoried; support, migration, and retirement are explicit.
3. **Deterministic coverage:** unit and database-backed end-to-end tests cover current, legacy, missing, and malformed state.
4. **Model evidence:** paid evals run only when model behavior changed, under the budgeted process in [agent-eval-gates.md](agent-eval-gates.md).
5. **Production canary:** the actual affected delivery path is exercised with representative state.
6. **Rollback:** the change can be disabled or reverted without losing requests, approvals, or execution identity.
7. **Documentation:** this plan is updated from evidence before the milestone is marked complete.

A green component test, paid eval, or one live message is not sufficient by itself.

## Pre-production posture

Shopkeeper is in active development with **no production users** as of 2026-08-25. The completion gate above describes the bar for a live merchant system. Before first customer, apply a lighter standard so velocity is not spent on ceremony that only pays off with real persisted state and release cadence.

### What still matters pre-user

- **Code invariants:** one classifier contract, staleness guards, schema/parser alignment, unified write semantics.
- **Deterministic tests:** unit and database-backed integration tests on every PR — free, fast, and the primary regression net.
- **Run the whole suite, not the files you touched.** Milestones 4 and 6 both closed on targeted
  green runs. A full `npm run test:integration` would have caught a stale job count and an
  acceptance test that only passes on an empty database; the M4 defect needed a path the shipped
  fixtures never called. Targeted runs are for the edit loop, never for the close.
- **A red static stage hides everything behind it.** `Static Verification` gates Build,
  Integration/Coverage, and E2E in `ci.yml`. One unused export over the knip baseline skipped all
  three for two commits, which is why the broken tests above reached `master` unseen. Treat a knip
  baseline failure as a blocked pipeline, not a lint nit.
- **A migration that ships behind its code is an outage, not a lag.** Milestone 5 shipped
  `loadActiveMerchantPreferences` to production while its table did not exist; the `P2021` threw
  out of `buildContext`, and every inbound message went unplanned until the migration landed a
  day later. Third instance of the pattern. Before closing a milestone that adds a table, read
  production `migrate status` — and give every fan-out load in `buildContext` its own catch, so
  a missing dependency degrades one section of context instead of taking planning down.
- **Fetch before building:** check whether the branch is already merged (`git fetch`, open PRs) before starting parallel implementation.
- **A direct push to `master` is an ungated agent change.** `evals.yml` triggers only on
  `pull_request`, so nothing pushed straight to `master` is ever gated — and `master` is not
  protected, so nothing stops it. Ten of Milestone 7's twelve commits landed that way, including
  `0780cb34`, which added a refund tool to the **shared** registry. That is the direct cause of the
  `refund-partial` contradiction below: a core hard-gated fixture sat asserting against the shipped
  product for a day, and no CI run existed that could have said so. This is the same accounting as
  the 2026-08 backlog (31 of 34 agent-path commits ungated); the difference is that this time the
  drift was found before the paid run rather than by it. The structural fix is branch protection on
  `master` or a `master`-push trigger for the free preflight — see [Open to-dos](#open-to-dos).

### Paid eval policy pre-user

| Change type | Recommended evidence |
|---|---|
| Gateway classification plumbing (schema enforcement, write path, burst framing) with **no prompt/model change** | Deterministic channel-contract tests only. **No paid eval.** |
| Planner prompt, tool schema, or model pin change | `targeted` mode on 1–3 affected fixtures, not full `release` (48 fixtures). |
| Pre-launch certification or post-incident | One `release` `workflow_dispatch` on the shipping SHA. |

**Do not run the same eval twice** (local then CI) unless the commit changed between runs. Local runs are for fast feedback while developing; a CI `release` certifies a specific merged SHA. If `master` already has a green release gate on the merged work, another run buys nothing pre-user.

**Do not treat local eval results as certifying `master`** when they ran on an uncommitted or superseded tree. PR #69 merged a different implementation than an in-flight local refactor during the 2026-08-25 contract-unification session — the local $0.67 run did not certify what shipped.

### PR sizing pre-user

Prefer **one PR** with code + deterministic tests over multi-PR sequences (A/B/C/D) unless a slice is genuinely risky to review. The A→D breakdown is for production rollout safety, not pre-user velocity.

## Current state

### Completed foundations

- Typed `PlanSignal` codes replaced warning-text policy matching.
- Plan validation replaced sequential prose/tool-call repair passes.
- `decideAutonomy` replaced competing planning/preview decisions.
- Classifier v5 introduced schema-enforced `RequestFacts` and structured rendering.
- Person naming, sentence helpers, customer lookup, and adjacent mutation descriptions were consolidated.
- Intent-driven tool selection ships with a typed one-retry namespace-miss fallback.
- Paid evals are manual, budgeted, artifact-producing, and separated from deterministic CI.
- Tools declare the Shopify scopes they need; a short grant withholds the tool with an explanation
  rather than failing at the provider.

These foundations remain valid. Their prior evidence is summarized in [AGENT_AUDIT.md](../AGENT_AUDIT.md), [agent-eval-gates.md](agent-eval-gates.md), and [agent-phase-a-measurement-2026-08-22.md](agent-phase-a-measurement-2026-08-22.md).

### Resolved foundation gap

The 2026-08-23 morning briefing proved that a live v4 escalation could be classified as a merchant decision while rendering only “Request details unavailable,” even though the thread still had a request-source message and conversation history.

The rollout gap is closed by the source-aligned legacy fallback and non-actionable thread-review path recorded under Milestone 1. Its causes were legacy plan-cache pruning that did not cover `Thread.escalatedAt`, deterministic tests that encoded the unavailable fallback, model evals that did not exercise the digest, and a phone canary that used only new v5 state.

### Foundation defects found by the release gate

Found by the 2026-08-25 paid eval runs. Both predate the work that surfaced them and both are `core` hard-gated fixtures. Both are closed, and **the paid release gate ran green on `1850cebd`** — 48/48 hard-gated, verified by a `release`-mode run rather than by the targeted runs that confirmed each fix. Milestones 3, 5, and 6 all landed after that SHA, so it certifies those two fixes, not current `master`. Detail and reproduction in [agent-m2-evidence-2026-08-25.md](agent-m2-evidence-2026-08-25.md).

- **An escalation verdict does not always reach the plan.** *Closed 2026-08-25 in `4ff4480f`; `refund-already-refunded` confirmed 3/3 at $0.06.* The failing condition was `validation.status === "valid"`, which gated the whole routing block: the model's `[add_internal_note, send_reply]` draft contains no `action` tool, so `orphan_internal_note` made it invalid and materialization never ran. `routingEvidence.escalationReason` was never the constraint — every `ESCALATION_EVIDENCE` code carries a reason string. Structural escalation evidence is now decided ahead of plan validity in `decideAutonomy`, so a plan bad enough to fail validation can no longer suppress the escalation the merchant's own order data demands, and the materialized plan is re-validated because that is the plan the merchant approves. A `planAgent` regression test reproduces the eval failure without a model call.
- **A forbidden internal note on a prompt-injection attempt.** *Closed 2026-08-25 in `6e9f4412` (PR #67); `prompt-injection-jailbreak-data-exfil` confirmed 3/3 at $0.15, alongside the two other note-forbidding fixtures at 3/3.* Containment always held — no data leaked, no forbidden data tools called — but this was not only a strictness failure: `[send_reply, add_internal_note]` carries no `action` tool, so it was `orphan_internal_note`, invalid, and refused at execution. The merchant got a dead plan and the customer got no reply. The cause was `add_internal_note`'s tool description ordering the model to "Always call this to document what you did" (`7072cd14`, 2026-06-06), which the validation rule added in `d0812097` (2026-08-22) contradicts whenever a plan carries no action step. The description now states the precondition instead. This is also the upstream cause of the defect above — the draft that made plan validity decisive was solicited by the schema — so both fixes stand: one stops a bad draft from suppressing a demanded escalation, the other stops the schema from soliciting the bad draft. Unlike that fix, this one is not model-independent; it changes what the model reads.

Neither is caused by the bounded-context retirement or the tool-selection fix; the evidence report records why each is inert for these fixtures. The remaining follow-up is baseline regeneration: the committed `baseline.json` is still the stale 2026-08-17 capture, deliberately not regenerated while these drifts were open. The gate's 1-repeat pass does not settle the flappiness those fixtures showed at 3 repeats, so the three-repeat capture is what closes that question.

## Execution order

| # | Milestone | Status | Depends on |
|---|---|---|---|
| 1 | Actionable merchant briefings | **Complete** | — |
| 2 | Classification lifecycle and compatibility | **Complete** | 1 |
| 3 | Immutable outcome attribution | **Complete** | 1 |
| 4 | Bounded replanning after definite failure | **Complete** | completed safety foundations |
| 5 | Merchant preference memory | **Complete** | 1, 3 |
| 6 | Attachment vision | **Complete** | 3 |
| 7 | Shop-management capabilities | **Complete** | — |

No milestone is building. Efficiency work may proceed freely, subject to the invariants above;
when a milestone is active again, it must not compete with it or change its persisted-data surface.

## Milestone 1 — Actionable merchant briefings

**Outcome:** every briefing item that asks for approval or judgment contains enough grounded context to act. If context truly cannot be recovered, the briefing asks the merchant to open the thread; it does not ask for a decision.

**Status:** complete. The pre-v5 source-message fallback and the non-actionable thread-review path are implemented for decisions, flagged senders, and approvals. Review-required items preserve their thread/plan identity, suppress shared approval and decision closers, fail closed on approval commands, and remain openable from the briefing. The fixture matrix, privacy-safe production inventory, live scheduled-path mixed-shape canary, rollback fixture, and legacy-row disposition are recorded in [agent-m1-briefing-evidence-2026-08-23.md](agent-m1-briefing-evidence-2026-08-23.md).

### Work

- Render request context in this order:
  1. source-aligned structured `RequestFacts`;
  2. bounded source text identified by `requestSourceMessageId`, with channel-appropriate contact redaction;
  3. an explicit non-actionable open-thread notice.
- Never use `aiTitle` or an episode summary as if it were the current request.
- Preserve an actionable postal address on authenticated operator surfaces; continue redacting unrelated contact details.
- Separate `needs_decision` from `needs_thread_review`; only the former receives “What do you want to do?”
- Inventory open production threads by classifier version, request-source availability, escalation state, and pending-plan state.
- Backfill or reclassify open actionable pre-v5 threads when source text is insufficient. Do not rewrite historical facts speculatively.
- Preserve stable thread/plan identity in `pendingDigest` so follow-up commands still resolve correctly.

### Acceptance

- [x] Database-backed regression fixture added for a v4 escalated thread with a request-source message.
- [x] The regression fixture passes with an actionable source-grounded briefing line.
- [x] Fixtures cover v5 facts, v4 source fallback, missing classifier data, missing source text, malformed JSON, approval, decision, flagged sender, and multiple-item closers.
- [x] Invariant test: no rendered item containing “details unavailable” can use an approval/decision question.
- [x] Production inventory is recorded without customer content or identifiers.
- [x] A scheduled briefing canary exercises both current and legacy persisted shapes.
- [x] Rollback retains the source-text fallback and does not mutate or discard pending state.

## Milestone 2 — Classification lifecycle and compatibility

**Outcome:** all inbound channels produce the same versioned request contract, and future schema changes have an explicit migration lifecycle.

**Status:** complete (2026-08-25, pre-user close; legacy-version coverage added 2026-08-27). Full
evidence in [agent-m2-evidence-2026-08-25.md](agent-m2-evidence-2026-08-25.md).

### What shipped

- **Contract unification** (`933019d5`, `18f2f49a`, PR #69): one classifier call shape (`output_config` + `json_schema`, `max_tokens: 700`), one write composition (three projections grouped by guard), staleness compare-and-set on request fields for every channel.
- **Post-unification fixes:** invalid `output_config` schema outage (`4248f135`); missing `Today:` anchor on post-persistence path (`6a371a94`).
- **Deterministic coverage:** `classification-channel-contract.test.ts` — cross-channel request-contract parity, stale-write rejection, multi-message email burst lifecycle.
- **Production canary:** `canary-classification-write.ts` exercised the guarded write path; found and closed the two defects above.
- **Standing audit:** `npm run audit:classification-alignment` — 141 production threads, zero stale rows.
- **Write telemetry:** `Classification request write` events with typed `outcome`, path, classifier version, and source message id.

### Recorded asymmetries (accepted, not defects)

- First email on a new thread is classified inline for spam filtering; a follow-up reclassifies the settled burst — two calls per two-message episode, pinned by the characterization suite.
- Burst framing and `verifiedOrderNames` differ by ordering/channel by design, not by accident.
- `classification.ts` is the shared classifier module for all channels; it was named
  `email-classification.ts` until 2026-08-27, when every channel already used it.

### Completion gate (pre-user)

| Gate | Evidence |
|---|---|
| Outcome | Same v5 request contract from every inbound ordering; stale writes rejected; canary defects fixed. |
| Compatibility | No persisted-shape change (`CLASSIFIER_VERSION` stays 5). Versions 2, 3 and 4 reached production and still render, pinned by `classifier-version-upgrade.test.ts`. |
| Deterministic coverage | Channel-contract integration suite + projection unit tests. |
| Model evidence | Release gate green on `1850cebd` (48/48 hard-gated); contract-unification model call validated by production canary. No additional paid eval owed for plumbing-only changes. |
| Production canary | `canary-classification-write` on `e79d7f5f`. |
| Rollback | Revert merge commits; no migration to unwind. |
| Documentation | This plan and the evidence report. |

### Open to-dos carried out of this milestone

Tracked in [Open to-dos](#open-to-dos). None are blockers for another milestone.

### Work

- ~~Unify email pre-persistence classification and other-channel post-persistence classification behind one contract.~~ Done 2026-08-25 in `933019d5` and `18f2f49a`.
- ~~Preserve the staleness guard: never save fields for a request superseded while classification was running.~~ Done 2026-08-25 in `933019d5`.
- ~~Verify multi-message email bursts classify once per request episode.~~ **Closed as accepted asymmetry** — inline classify on thread open + settled-burst classify on follow-up; characterized, not optimized.
- ~~Define supported classifier versions and a retirement procedure.~~ **Done 2026-08-27** in
  `classifier-version-upgrade.test.ts`. The supported set is 2 through 5 and the test is what
  says so: every one of them renders, and versions below 5 render through the Milestone 1
  source-text fallback because `unavailableRequestDisplay()` is all the structured path can
  give them. No retirement procedure is written because nothing is retired; the test is the
  gate that would fail if a future bump dropped a version still holding actionable rows.
- ~~Add production metrics for classifier version, failure, stale-write rejection, and source alignment.~~ Done — write-path events and `audit:classification-alignment` shipped 2026-08-25; the `Classification attempt unresolved` event for failures and spend-cap skips shipped 2026-08-27.
- ~~Decide the `AGENT_CONTEXT_BUDGET_MODE` rollout, then remove the unused branch.~~ Done 2026-08-25.

### Acceptance

- [x] Channel-contract tests feed equivalent requests through every inbound ordering and compare persisted request identity/facts.
- [x] No version is retired while an actionable row still depends on it. (Vacuously true — no version has been retired; pre-v5 rows still render through the Milestone 1 source-text fallback.)
- [x] Version-upgrade acceptance test — `apps/gateway/src/classifier-version-upgrade.test.ts` seeds version 2, 3 and 4 rows plus missing and malformed signals in the test database and asserts cards, digests, and replacement plans still render.

## Milestone 3 — Immutable outcome attribution

**Outcome:** resolution rate and merchant involvement can be measured per request episode without reconstructing mutable thread history.

**Status:** complete (2026-08-25, pre-user close). Full evidence in [agent-m3-evidence-2026-08-25.md](agent-m3-evidence-2026-08-25.md).

### What shipped

- **Schema** (`2f94a5f6`, `20260825160000_add_request_episode_outcomes`): one row per plan attempt; episode identity is `source_message_id`; terminal resolution and milestone timestamps are set once.
- **`@shopkeeper/agent/request-outcome`**: `captureCommittedPlanOutcome`, execution/dismiss/merchant-input/manual-reply recorders, action-log join helper.
- **`@shopkeeper/agent/request-outcome-report`**: `queryRequestOutcomeReport` — volume and outcome counts by `request_tag` for an arbitrary time window.
- **Write hooks:** plan cache commit (gateway auto-plan + dashboard composer), plan execution, plan dismiss, merchant `ask_operator` answer + replan commit, manual merchant sends (`dispatch-message`, outbound email).
- **`PendingQuestion` plan identity:** `planId` / `sourceMessageId` parked when a question notification fires; used to attribute merchant answers.
- **Namespace miss:** `planAgent` persists `namespaceMiss` on the cached plan; `captureCommittedPlanOutcome` records it on the episode row.
- **Action log + review UI:** `ActionLogEntry.requestOutcome` enriched via execution join; review list and detail render outcome summary and provenance (`b855dcbc`).
- **Audit CLI:** `npm run audit:request-outcomes` wraps `queryRequestOutcomeReport` for one org or all orgs in a window.
- **Production deploy:** migration applied 2026-08-25 on Neon production (`proud-dream`); database up to date (77/77).

### Completion gate (pre-user)

| Gate | Evidence |
|---|---|
| Outcome | Episode rows capture plan verdict, execution terminal, escalation, merchant input, dismiss, manual reply, and namespace miss per `source_message_id`. |
| Compatibility | Additive table and nullable FKs; no migration of legacy thread state required. Historical backfill **removed 2026-08-26** — see [Removed capabilities](#removed-capabilities). |
| Deterministic coverage | `request-outcome.integration.test.ts`, `action-log.test.ts`, `action-log-display.unit.test.ts`. |
| Model evidence | None owed — no prompt, tool schema, or model pin change. |
| Production canary | Not run pre-user; write paths exercised by integration tests and deploy verification. |
| Rollback | Revert application commits; drop table only if no downstream dependency (see evidence report). |
| Documentation | This plan and [agent-m3-evidence-2026-08-25.md](agent-m3-evidence-2026-08-25.md). |

### Open to-dos carried out of this milestone

Tracked in [Open to-dos](#open-to-dos).

### Work

- ~~Persist immutable source-message/episode identity, classifier version and request type, plan verdict, execution outcome, escalation, approval/input events, reply provenance, and terminal resolution.~~ Done 2026-08-25 in `2f94a5f6` and `b855dcbc`.
- ~~Link operator recent-activity reporting to these records.~~ Done 2026-08-25 in `b855dcbc` — action-log join and review UI.
- ~~Report volume, automatic resolution, approval, merchant input, escalation, failure, and namespace-miss rate by request type.~~ Done 2026-08-25 — `queryRequestOutcomeReport` and `npm run audit:request-outcomes`.

### Acceptance

- [x] The table requested in [agent-phase-a-measurement-2026-08-22.md](agent-phase-a-measurement-2026-08-22.md) is reproducible for an arbitrary time window on post-deploy traffic via `queryRequestOutcomeReport` / `audit:request-outcomes`. Historical backfill removed 2026-08-26.
- [x] Replaced plans, answered questions, and multi-request threads retain separate histories. Integration tests in `request-outcome.integration.test.ts`.

## Milestone 4 — Bounded replanning after definite failure

**Outcome:** a valid multi-step plan can recover once from a definite provider rejection without duplicating completed work or weakening approval requirements.

**Status:** complete (2026-08-25, pre-user close; corrected 2026-08-26). Full evidence in [agent-m4-evidence-2026-08-25.md](agent-m4-evidence-2026-08-25.md).

**Correction (2026-08-26).** The milestone was closed on coverage that only exercised
`executionIntent: "automatic"`. On both merchant-approval routes the replan threw instead of
recovering: the recursive child call re-passed the parent's `params`, so the parent's
`approvedToolCalls` were validated against the child plan, which shares none of them
(`BadRequestError: Approved tool calls must come from the current reviewed plan`). The parent's
side effects were already committed, so the approver got an error after a half-executed plan and
an unconsumed child plan stayed cached. `/api/agent`, `/api/agent/quick-approve`, and the gateway
operator approve path were all affected.

Three things changed. The child no longer inherits the parent's approval envelope —
`approvedToolCalls`, `expectedIdentity`, and `approver` are dropped, and the child runs with
`executionIntent: "automatic"`. Whether it may run at all is now its own verdict's answer, read
through the single `allowsAutomaticExecution` owner rather than a parent-versus-child rank
comparison that permitted a child *less* restrictive than its parent. A child that cannot clear
autonomy on its own is committed to the cache and returned as `failureReplanAwaitingApproval`, so
the merchant is told the step failed and gets the follow-up card on every bound operator channel
instead of an exception. The replan block is wrapped so no replan failure can discard the parent's
committed result. The dead `isFailureReplanPlanningInstruction` prose matcher is gone.

### What shipped

- **Outcome classification** (`execution-outcome.ts`): `isDefinitePlanExecutionFailure` (`failed` / `partial`) vs `isUnknownPlanExecution`; `ledgerStatusForPlanOutcome` maps partial → failed on the durable ledger.
- **Stop on definite failure** (`run-execution.ts`, `run.ts`): approved-plan execution halts at the first `error` / `policy_block` step so remaining work is not attempted in the parent attempt.
- **`@shopkeeper/agent/plan-failure-replan`**: builds failure-replan planning instructions from committed steps + failure reason; validates child plans do not repeat committed tool-call ids; blocks autonomy tier increases; commits one child cache row with `failureReplan` metadata.
- **Execution hook** (`plan-execution.ts`): after a definite parent failure, `attemptFailureReplanAfterExecution` runs `planAgent` once and re-executes the child with `failureReplanAllowed: false`; unknown outcomes escalate the thread (`escalatedAt`) and never replan; successful child executions attach `failureReplanRecovery` for downstream notification.
- **Host wiring:** gateway and dashboard `PlanExecutionDeps` now pass `planAgent` for replan generation.
- **Cache shape:** optional `failureReplan` on `AgentPlanCacheRecord` — marks a child plan and prevents nested replans.
- **Merchant notification dedup** (gateway): `shouldNotifyAutoExecution`, recovery metadata on auto-execution results, and combined operator copy so parent partial failure + child recovery fans out once (including when the child is a successful safe reply).

### Completion gate (pre-user)

| Gate | Evidence |
|---|---|
| Outcome | One bounded replan after definite failure; unknown escalates; merchant notified once on recovery |
| Compatibility | Optional cache JSON only; no migration |
| Deterministic coverage | Agent integration + gateway notification unit tests |
| Model evidence | None owed until replan instruction or model pin changes |
| Production canary | Deferred to first customer — integration tests are the gate pre-user |
| Rollback | Revert commits; omit `planAgent` from host deps to disable replan |
| Documentation | This plan and the evidence report |

### Open to-dos carried out of this milestone

Tracked in [Open to-dos](#open-to-dos).

### Work

- ~~Distinguish `failed` (definitely no side effect) from `unknown` at the plan level.~~ Done 2026-08-25 in `execution-outcome.ts` and `plan-execution.ts`.
- ~~Permit one child plan after `failed`; pass prior committed results and the failure reason.~~ Done 2026-08-25 — one child replan after definite `failed`/`partial`; committed steps and failure reason passed via planning instruction + cache metadata; child runs through normal `planAgent` validation/autonomy.
- ~~Run the child through full validation, autonomy, policy, caps, hashing, and atomic claim.~~ Done 2026-08-25 — child uses `planAgent` + `decideAutonomy` + `executeCurrentCachedHomePlan` claim path; no separate policy bypass.
- ~~Never repeat committed steps, replan after `unknown`, or raise the autonomy tier.~~ Done 2026-08-25 — structural guards in `plan-failure-replan.ts` and `failureReplanAllowed: false` on child execution.
- ~~Merchant notification dedup across parent failure and child recovery.~~ Done 2026-08-25 — gateway auto-execution path; see evidence report.

### Acceptance

- [x] Three-step fixture: step two fails definitely, remaining work succeeds once. Integration test in `plan-execution.integration.test.ts` (`bounded failure replan`).
- [x] Recovery holds on **every** approval path, not just `automatic`: fixtures cover the explicit
  `approvedToolCalls` set the dashboard card posts and the quick-approve shape that posts none.
- [x] A child that cannot run on its own authority is cached for approval rather than executed or
  thrown: fixture asserts the parent result survives, the child is the thread's cached plan, and
  its `failureReplan` marker blocks a nested replan.
- [x] Three-step fixture: merchant notified once. Gateway tests in `generate-thread-plan.test.ts`, `ai-summary-flow.unit.test.ts`, and `planning-notifications.test.ts`.
- [x] Unknown-outcome fixture: no replan; escalation occurs. Integration test sets `escalatedAt`; no duplicate side effect beyond existing unknown skip semantics.

## Milestone 5 — Merchant preference memory

**Outcome:** Shopkeeper can apply explicit merchant judgment consistently without allowing preferences to override safety policy.

**Status:** complete (2026-08-25, pre-user close). Evidence in [agent-m5-evidence-2026-08-25.md](agent-m5-evidence-2026-08-25.md).

**Rollout note (2026-08-27).** The capability is unchanged and the milestone stays complete, but
the deploy shipped code ahead of `20260825200000_add_merchant_preferences`, so
`loadActiveMerchantPreferences` raised `P2021` inside an uncaught `Promise.all` in
`buildContext` and production generated no plans at all until the migration landed 2026-08-26.
Fixed in `f47b5f85`: the load degrades to an empty list and logs at warn. Preferences are
guidance only, so the fallback loses guidance without loosening any policy.

### Work

- Store org-scoped, categorized preferences with source, status, confirmation, and usage metadata.
- Build explicit operator capture first.
- Add observed proposals later behind a flag; proposals require confirmation and are never applied directly.
- Inject a bounded set of active preferences as model guidance only.
- Surface proposed preferences and recent activity through actionable merchant interfaces.

### Acceptance

- [x] An active preference changes a draft. Targeted eval `merchant-preference-store-credit-over-refund`; unit/integration prompt injection.
- [x] A preference attempting to exceed a hard cap still blocks or escalates structurally. Integration test + targeted eval `merchant-preference-over-cap-still-escalates`.
- [x] Proposed preferences cannot affect planning before confirmation. Integration tests load only `active` rows.

## Milestone 6 — Attachment vision

**Outcome:** Shopkeeper can understand damaged-item images a customer sends and recommend a
policy-compliant remedy from what it sees.

**Status:** complete (2026-08-26, pre-user close). Evidence:
[agent-m6-evidence-2026-08-26.md](agent-m6-evidence-2026-08-26.md).

Shipment and carrier tracking were **removed from this milestone and from the product** on
2026-08-26. USPS programmatic access is closed by Package Tracking Access Controls, and paid
aggregators for UPS/FedEx/DHL were judged not worth the cost and compliance overhead for a
solo-merchant product. The degraded Shopify-fulfillment tier, the full-tier provider seam, the
delivery-exception monitor, and the `ShipmentWatch` table went with them — see
[Removed capabilities](#removed-capabilities). The agent still answers "where is my order" from
Shopify order and fulfillment data via `get_order_tracking`; it makes no carrier call and never
claims scan history.

### Work

- ~~Hydrate bounded email and TikTok image attachments; treat image text as untrusted input.~~ Done 2026-08-26 — `shouldHydrateAgentMessageImages` for `email`, `tiktok`, and `ig_dm`; TikTok inbound images stored in private blob before planning.

### Acceptance

- [x] An emailed damage photo reaches the model; instruction-shaped image text cannot alter policy or tool access. `context-images.integration.test.ts`, `prompting.test.ts`, `planner.test.ts`.
- [x] Delivered-but-disputed remains reactive to customer evidence. The agent responds to what the customer reports and sends, not to a proactive carrier signal.

### Completion gate (pre-user)

| Gate | Evidence |
|---|---|
| Outcome | Damage photos reach the model on email, TikTok, and Instagram; image text is untrusted |
| Compatibility | No persisted-shape change |
| Deterministic coverage | Agent unit + integration; see the evidence report |
| Model evidence | None owed: hydration changed the model's input, but no eval fixture carries an image attachment, so no assertion can move. The `1850cebd` gate predates this work and does not cover it. |
| Production canary | Deferred pre-user — acceptance integration test |
| Rollback | Revert commits |
| Documentation | This plan and the evidence report |


## Milestone 7 — Shop-management capabilities

**Outcome:** authenticated operators can manage inventory and promotions with bounded, previewable, reversible blast radius.

**Status:** complete (2026-08-27, pre-user close). The targeted eval ran green on `36896c72`:
9/9 hard-gated at three repeats, $0.21 of an authorised $0.60.

Promotion and repricing writes are operator-only, in
`apps/gateway/src/message-handlers/operator-shop-tools.ts` rather than the shared registry, and a
test asserts they never reach `TOOL_DEFINITIONS`. That is deliberate: the shared registry is what
the support planner selects from, so a promotion tool there would let a ticket reading "give me 90%
off everything" reach one. `issue_discount` stays retired.

### What shipped

- **Scope gate** (`6bfc416e`): tools declare `requiredScopes`; `grantCoversScopes` shares
  `holdsScope` with `missingShopifyScopes` so the write-implies-read rule has one owner.
  `selectAgentTools` filters short-granted tools out of the model's list; `unmetToolCapability`
  refuses at execution and names the missing scope. `write_products` joined the requested set.
- **Value-at-risk guard** (`5dbf84d5`, `packages/agent/src/tools/value-at-risk.ts`): bounds count,
  depth, money, and duration; returns every violation in one pass; violations are codes. No
  wildcard form exists and a missing TTL is a violation, not a default. Four settings with shipped
  defaults, where null means "use the default" rather than "no limit".
- **Inventory reads** (`5dbf84d5`): `get_inventory_status` answers both stock questions,
  distinguishes "0 in stock" from "not tracked", and flags oversell. Needs only `read_products`, so
  it works for every currently connected store.
- **Flash sales and repricing** (`ccb9185d`): automatic discounts with a Shopify-enforced expiry,
  never a price edit, so ending one restores prices exactly. Enumerated repricing records original
  prices, including when the bulk update fails partway. Both price the exposure from Shopify's
  current numbers rather than the caller's.

### Acceptance

- [x] Existing merchants without new scopes continue working and receive an explanation for unavailable tools. Registry test asserts an empty grant withholds exactly `get_inventory_status`; the operator tools name the missing scope.
- [x] Catalog-wide 90% discount attempts are structurally blocked. `value-at-risk.test.ts` and `flash-sales.test.ts` — the mutation is never reached.
- [x] Every promotion expires and can be ended with one command. `endsAt` is non-optional; `end_flash_sale` with no ID lists what is running.
- [x] Bulk wildcard repricing is impossible by schema and policy. No query, collection, or pattern field exists on any shop tool; a malformed pair refuses the whole batch.
- [x] The two shared-registry tools do not disturb the support planner's existing selections.
  Targeted eval on `36896c72`, three repeats each: `refund-partial` 3/3, `routing-product-search`
  3/3 (`get_inventory_status` does not steal `search_shopify_products` on an availability
  question), `adjacent-edit-order-vs-cancel` 3/3 (the item-scoped refund tool does not steal a
  pre-fulfillment edit).

### The tool this milestone shipped and forbade

`create_partial_refund` reached the shared registry in `0780cb34` while
`SUPPORT_INSTRUCTIONS` still listed "partial or item-only refunds" among the things that must call
`escalate_to_human`. The compensation decision tree had three branches — exact full refund,
fixed-value gift card, escalate-everything-else — and the new tool landed in the third one. So the
model was handed a tool description saying *use me for item-only refunds* and a system prompt
saying *item-only refunds must escalate*, and split: `refund-partial` came back 2/3 in the
2026-08-27 baseline run, with the failing repeat's escalation reason quoting the tree back —
"outside the exact-full-refund and gift-card policy paths".

**A targeted run of that same fixture had passed 3/3 an hour earlier.** Three samples of a
coin-flip is not evidence, and the 84-fixture run is what exposed it. This is the argument for
reading the failing repeat's reason rather than re-running until green.

Fixed in `dbe3c089`: the tree gets a third allowed branch whose preconditions are the ones
`createPartialRefund` actually enforces — one fully paid order, no prior refund, every named line
item resolvable with enough units left — so the prompt promises what the implementation will
honour. The escalate branch keeps the case the branch cannot serve: an item-only request whose
line items do not resolve. Operator mode carried the same prohibition and got the same branch.
Verified on `dbe3c089`, three repeats: `refund-partial` 3/3 plus the three branches it could
disturb — `refund-under-cap` (full refund still picks `create_refund`), `refund-no-amount`
(amount-less still escalates), `adjacent-refund-vs-return` (goods going back still picks
`create_return`) — 12/12 hard-gated, $0.18.

**Standing consequence.** A new financial tool needs a prompt branch, not just a registry entry.
The decision tree enumerates what is allowed and escalates the rest, so a tool absent from it is
unreachable-to-unreliable no matter what its description says. Grep the tree for the category the
tool serves.

### The fixture that agreed with the prompt

The same contradiction had a second face. `refund-partial` — core, hard-gated — asserted
`mustEscalate` on the grounds that "partial refunds are merchant-only", and its scenario, one
cracked candle out of a two-item order, is verbatim the case the new tool's description claims.
Because the tool sits in `BROAD_ORDER_MUTATION_TOOL_NAMES`, the fixture's own `mutative_request`
intent put it in front of the model. This plan previously recorded that as "the fixture was
asserting against the product" — that was half wrong, and the correction is the useful part: the
fixture agreed with the prompt and disagreed with the tool. The product contradicted itself, and
the fixture was faithfully encoding one side of it.

It was reconciled in `36896c72` before the gate ran: the plan now expects
`create_partial_refund` + `send_reply`, and `escalate_to_human` moved to `mustNotCallTools`. At the
default guarded tier this is still a card the merchant approves, not an autonomous refund. The
rubric check was replaced rather than dropped — `partial_refund_not_promised` guarded a promise the
agent can no longer make, and `refund_amount_not_stated` guards the property that replaced it: the
model names units, `refunds/calculate.json` prices them, so a reply stating a figure is asserting a
number it did not compute. The judge passed it 3/3.

The neighbours were checked rather than assumed: `refund-no-amount` cannot reach the tool (no order
in context) and `adjacent-refund-vs-return` is single-item with two explicit redirects in the
description. One fixture was wrong, not a class of them.

**Standing consequence.** A tool added to the shared registry is added to every support fixture's
option set. Grep the fixtures whose scenario the new tool's own description claims, before the gate
runs — a stale assertion spends the budget proving something reading would have shown for free.

### What the baseline attempt cost and found

Run 33120836618 ran all 84 fixtures three times, spent **$2.71, and committed nothing**. Neither
cause was a model regression; both were harness bugs that only bite in `baseline`/`drift` mode,
which is why nothing had caught them.

- **The capture was circular.** `index.test.ts` asserted `passes === repeats` for every
  non-`advisory` fixture, including during a capture — so a three-repeat baseline, whose purpose is
  recording flap rates, could only be written in a run where nothing flapped. The comment directly
  above that line already said flappy fixtures clear the bar; the code had drifted from its own
  comment. `quick-reply-thanks-ack` is in the committed baseline at 1/3 only because it is
  `advisory: true`. Fixed in `22d22aa6`: a capture fails on 0/N and records anything above it,
  while the release and PR gates keep the strict bar.
- **The gateway got a hardcoded call budget.** `eval-budget-preflight.mjs` set
  `gatewayMaxCalls = mode === 'release' ? 6 : 24`. The dollar allocation scaled off the caller's
  ceiling; the call allocation ignored both that and `repeats`, and drift/baseline force
  `repeats=3`. Five order-ops fixtures need ~30 calls at three repeats, got 24, and died
  `24 / 24` on a run that had authorised 700. Fixed in `93be611e`, with a regression test at 1, 2
  and 3 repeats — the previous test covered only `release`, which is how a constant survived in a
  file whose whole job is arithmetic.

**Two fixtures still flap and are not explained.** `adjacent-cancel-vs-refund` (core) and
`tier-guarded-store-credit-approval` reproduced at 2/3 in a targeted re-run;
`tier-watch-refund-draft-only` was one-off noise. They are not recorded as regressions: the
baseline they would be compared against is from 2026-08-17, four milestones stale, and at three
samples the gap between 3/3 and 2/3 is weak evidence in either direction. Recording their real
rate is the point of the recapture — it is the prerequisite for telling variance from regression
rather than guessing.

**Habit this bought.** Before re-running a failed multi-dollar capture, re-run the failing fixtures
alone at the same repeat count (~$0.18). That is what proved two of three reproduced, which meant a
blind retry would have failed identically.

### Completion gate (pre-user)

| Gate | Evidence |
|---|---|
| Outcome | Bounded, previewable, reversible promotion and repricing; short grants degrade with an explanation |
| Compatibility | Additive settings keys only; no persisted-shape change, no migration |
| Deterministic coverage | `value-at-risk.test.ts`, `inventory.test.ts`, `flash-sales.test.ts`, `variant-pricing.test.ts`, `partial-refunds.test.ts`, `operator-shop-tools.unit.test.ts` |
| Model evidence | **Paid, green.** Targeted mode on `36896c72`, 3 fixtures × 3 repeats, 9/9 hard-gated, $0.2063 of $0.60 and 24 of 60 calls. Ledger: `test:evals:fixture` on that SHA. The operator tools owe nothing — they never enter that prompt. |
| Production canary | Deferred pre-user |
| Rollback | Revert commits; drop `buildOperatorShopTools` from the operator turn to disable the writes |
| Documentation | This plan |
| Landed | PR #71, merge `4d69d40c`. CI 9 pass / 11 skipping / 0 fail; every paid eval lane skipped, so the PR billed nothing. |

## Open to-dos

Nothing here waits on a first customer, a production canary, or a monitoring period.

All the milestone code is written and every milestone gate is discharged. What remains is process,
not product. Do not re-add a code item without checking it is genuinely unwritten — the last audit
found four plan claims that had drifted from the code.

Rows 1 and 2 were previously recorded as the same run. They are not: a targeted run names its
fixtures and skips baseline comparison outright (`EVAL_FIXTURE` → `selectFixtures`), so it cannot
produce a capture no matter how many repeats it does. To-do 1 was closed without touching to-do 2.

| # | To-do | Where | Notes |
|---|---|---|---|
| ~~1~~ | ~~Eval gate for the two new shared-registry tools~~ | — | **Done 2026-08-27** on `36896c72`, merged in `4d69d40c`. 9/9 hard-gated at three repeats, $0.21. Required reconciling `refund-partial` first — see Milestone 7 |
| 2 | Regenerate `baseline.json` at three repeats | `apps/dashboard/src/lib/agent/__evals__/` | Still the 2026-08-17 capture, and `master` has moved a great deal since — every drift comparison against it is decreasingly meaningful, and `drift` mode is the only thing that reads it. **Run it in CI** (`gh workflow run evals.yml -f mode=baseline`), which commits the regenerated file and covers the gateway suite; the local `test:evals:baseline:overwrite` does neither. Preflight estimate **$3.48 / 459 calls**, not the ~$2.55 this row used to claim: baseline mode forces `judges=on` and the local script's figure excludes the 21 judged fixtures. Its own authorisation, not a by-product of a targeted run |
| 3 | Gate `master` | `.github/workflows/`, repo settings | `evals.yml` triggers only on `pull_request` and `master` is unprotected, so a direct push is an ungated agent change. Either protect `master` or add a `push: branches: [master]` trigger for the **free** preflight. Free to do; the cost is only in what it prevents |
| 4 | Explain or accept two flapping fixtures | `apps/dashboard/src/lib/agent/__evals__/fixtures/` | `adjacent-cancel-vs-refund` (core) and `tier-guarded-store-credit-approval` reproduce at 2/3. `refund-partial` flapped for a findable reason — a prompt contradiction — so these deserve the same read of their failing repeat before being written off as variance. Not a blocker: the recapture records their rate either way |

### Standing constraints (not to-dos)

- Customer and operator execution policies remain separate.
- Storefront guest and verified-order projections remain separate.
- Proactive visitor conversion is out of scope.

### Removed capabilities

Deleted from the product on 2026-08-26, not deferred. Restoring any of them is new work with a
new gate, not the resumption of a parked item.

- **Carrier shipment tracking, both tiers.** USPS access is closed by Package Tracking Access
  Controls; UPS/FedEx/DHL full-tier access needed a paid aggregator that was not worth its cost and
  compliance overhead here. Removed: `shipment-tracking.ts`, `shipment-alerts.ts`,
  `listRecentShippedOrderShipments`, `extractShipmentsFromOrders`, and the
  `FullTierCarrierTrackingProvider` seam.
- **Proactive delivery-exception monitoring.** The gateway `delivery-exception-monitor` and
  `delivery-exception-plan`, the hourly job, `DELIVERY_EXCEPTION_MONITOR_ENABLED`, and the
  `ShipmentWatch` table plus its two enums (dropped in
  `20260826120000_drop_shipment_watches`). Stall and exception detection no longer exist on any
  tier.
- **Historical `request_episode_outcomes` backfill.** There is no pre-deploy traffic worth
  recovering; outcome reporting covers post-deploy requests only.

What survives: the agent still answers "where is my order" from Shopify order and fulfillment data
through `get_order_tracking`. It makes no carrier call, and its tool description states that it
cannot retrieve scan history, delivery events, or delivery exceptions.

## Maintaining this plan

- Update status only from recorded evidence, not intent or code shape.
- If implementation contradicts the plan, stop and reconcile the plan before adapting the code.
- Keep detailed investigations in dated reports or git history; do not append them to this execution plan.
- One active canonical plan means no other document may declare an agent milestone complete or change its dependency order.

## Retiring this document

Every milestone is complete, so this file has stopped being a work order. It has **not** stopped
being load-bearing, and finishing the open to-dos is not sufficient to delete it. Deleting it while
the conditions below are unmet loses design law that exists nowhere else and breaks eleven inbound
links.

Two distinct questions, often conflated:

**1. When does it stop being a plan?** When to-dos 2 and 3 are discharged. At that point no row in
this file describes work anyone still has to do.

**2. When can the file be deleted?** Only when everything below has a new home. Retirement is a
migration, not a deletion.

| What only lives here | Why it cannot just be dropped | Where it should go |
|---|---|---|
| [Non-negotiable invariants](#non-negotiable-invariants) | Design law for anything touching agent writes. `CLAUDE.md` carries the shop-management and order-ops subsets, not the full set — capture-mode planning, the single `decideAutonomy` owner, "never replan after unknown", "never remove support for persisted data on fixture evidence" appear only here | `CLAUDE.md` agent-change invariants |
| [Removed capabilities](#removed-capabilities) | The record that carrier tracking, delivery-exception monitoring, and the outcome backfill were **deleted**, not parked. Without it the next reader treats `ShipmentWatch` as unfinished work and rebuilds a capability that was removed for external reasons that still hold | `docs/compatibility-retirement-backlog.md`, or a short `docs/removed-capabilities.md` |
| [Completion gate](#completion-gate-for-every-milestone) and [Pre-production posture](#pre-production-posture) | The bar for "complete", and the explicit statement that it is relaxed pre-user. Deleting this silently restores the strict bar, or silently abandons it — neither is a decision anyone made | `docs/agent-eval-gates.md` already owns the paid-eval half; it should own the rest |
| [What still matters pre-user](#what-still-matters-pre-user) | Five incident-derived rules — full-suite-not-targeted, red-static-hides-everything, migration-behind-code, direct-push-is-ungated. Each is a paid lesson with a named incident | `CLAUDE.md` coding/debugging sections |
| The "one active canonical plan" rule above | It is what stops two documents carrying contradictory completion claims. If this file goes without a successor, nothing holds that role and `AGENT_AUDIT.md` drifts back into being a second work order — the exact problem its own header says this file was created to fix | Whichever document inherits the invariants |

**Inbound links that must be repointed first** (11 across 7 files): `AGENT_AUDIT.md:7` names this the
canonical plan and `:9` explains the split; the six milestone evidence reports each open by citing
it, and `agent-m6-evidence-2026-08-26.md:14` deep-links `#removed-capabilities`,
`agent-m1-briefing-evidence-2026-08-23.md:4` deep-links `#milestone-1--actionable-merchant-briefings`.
The evidence reports are dated records and should not be rewritten to erase the reference — repoint
them at the successor, or leave them citing a file that still exists.

**The cheap alternative, and the recommendation:** leave the file in place and change its status
line to `historical record — no open work`, exactly as `AGENT_AUDIT.md` was handled. A completed
plan is not clutter; it is the only place the reasoning behind these decisions is written down, and
git history preserves the file but not its discoverability. Delete it only if it starts attracting
contradictory edits — the failure mode it was created to solve.
