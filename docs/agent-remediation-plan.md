# Shopkeeper — Agent Reliability and Capability Plan

**Status:** canonical execution plan

**Last reconciled:** 2026-08-26 (Milestone 6 attachment vision + delivery preference wiring)

**Current milestone:** 6 — shipment resolution and attachment vision (full-tier carrier provider remains)

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
- **Fetch before building:** check whether the branch is already merged (`git fetch`, open PRs) before starting parallel implementation.

### What to defer until first customer or first production deploy

- Production classifier-version **inventory**, **canary**, and **retirement** procedure.
- Version-upgrade acceptance tests against live old-version rows (no production rows to protect yet).
- Full **release** paid evals as a routine gate on every plumbing change.

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

These foundations remain valid. Their prior evidence is summarized in [AGENT_AUDIT.md](../AGENT_AUDIT.md), [agent-eval-gates.md](agent-eval-gates.md), and [agent-phase-a-measurement-2026-08-22.md](agent-phase-a-measurement-2026-08-22.md).

### Resolved foundation gap

The 2026-08-23 morning briefing proved that a live v4 escalation could be classified as a merchant decision while rendering only “Request details unavailable,” even though the thread still had a request-source message and conversation history.

The rollout gap is closed by the source-aligned legacy fallback and non-actionable thread-review path recorded under Milestone 1. Its causes were legacy plan-cache pruning that did not cover `Thread.escalatedAt`, deterministic tests that encoded the unavailable fallback, model evals that did not exercise the digest, and a phone canary that used only new v5 state.

### Foundation defects found by the release gate

Found by the 2026-08-25 paid eval runs. Both predate the work that surfaced them and both are `core` hard-gated fixtures. Both are closed, and **the paid release gate is green on `master`** as of `1850cebd` — 48/48 hard-gated, verified by a `release`-mode run rather than by the targeted runs that confirmed each fix. Detail and reproduction in [agent-m2-evidence-2026-08-25.md](agent-m2-evidence-2026-08-25.md).

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
| 6 | Shipment resolution and attachment vision | **Active** | 3; preference policy for proactive remedies |
| 7 | Shop-management capabilities | Blocked | 4 and value-at-risk guard |

Efficiency work may proceed only when it does not compete with the active milestone or change its persisted-data surface.

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

**Status:** complete (2026-08-25, pre-user close). Full evidence in [agent-m2-evidence-2026-08-25.md](agent-m2-evidence-2026-08-25.md).

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
- `email-classification.ts` is the shared classifier module for all channels; rename deferred as mechanical cleanup.

### Completion gate (pre-user)

| Gate | Evidence |
|---|---|
| Outcome | Same v5 request contract from every inbound ordering; stale writes rejected; canary defects fixed. |
| Compatibility | No persisted-shape change (`CLASSIFIER_VERSION` stays 5). Version inventory and retirement **deferred to first customer** — see below. |
| Deterministic coverage | Channel-contract integration suite + projection unit tests. |
| Model evidence | Release gate green on `1850cebd` (48/48 hard-gated); contract-unification model call validated by production canary. No additional paid eval owed for plumbing-only changes. |
| Production canary | `canary-classification-write` on `e79d7f5f`. |
| Rollback | Revert merge commits; no migration to unwind. |
| Documentation | This plan and the evidence report. |

### Deferred to first customer launch

These were Milestone 2 bullets that only pay off with real merchant persisted state. They are **not** blockers for Milestone 3:

- Classifier-version **inventory** and **retirement** procedure (inventory → dual-read/backfill → canary → retirement).
- Version-upgrade acceptance test (old-version rows → uninterrupted cards, digests, replans).
- Unified telemetry for classification **failure** and spend-cap skip (write-path telemetry is in place).
- `baseline.json` three-repeat regeneration (drifts that blocked it are closed).
- Rename `email-classification.ts` to a channel-neutral module name.

### Work

- ~~Unify email pre-persistence classification and other-channel post-persistence classification behind one contract.~~ Done 2026-08-25 in `933019d5` and `18f2f49a`.
- ~~Preserve the staleness guard: never save fields for a request superseded while classification was running.~~ Done 2026-08-25 in `933019d5`.
- ~~Verify multi-message email bursts classify once per request episode.~~ **Closed as accepted asymmetry** — inline classify on thread open + settled-burst classify on follow-up; characterized, not optimized.
- ~~Define supported classifier versions and a retirement procedure.~~ **Deferred to first customer** — only v5 is written today; nothing to retire.
- ~~Add production metrics for classifier version, failure, stale-write rejection, and source alignment.~~ **Partially done** — write-path events and `audit:classification-alignment` ship; failure/spend-cap telemetry deferred.
- ~~Decide the `AGENT_CONTEXT_BUDGET_MODE` rollout, then remove the unused branch.~~ Done 2026-08-25.

### Acceptance

- [x] Channel-contract tests feed equivalent requests through every inbound ordering and compare persisted request identity/facts.
- [x] No version is retired while an actionable production row still depends on it. (N/A — v5 only; retirement procedure deferred.)
- [ ] Version-upgrade acceptance test — **deferred to first customer launch** (see above).

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
| Compatibility | Additive table and nullable FKs; no migration of legacy thread state required. Historical backfill **deferred to first customer** — see below. |
| Deterministic coverage | `request-outcome.integration.test.ts`, `action-log.test.ts`, `action-log-display.unit.test.ts`. |
| Model evidence | None owed — no prompt, tool schema, or model pin change. |
| Production canary | Not run pre-user; write paths exercised by integration tests and deploy verification. |
| Rollback | Revert application commits; drop table only if no downstream dependency (see evidence report). |
| Documentation | This plan and [agent-m3-evidence-2026-08-25.md](agent-m3-evidence-2026-08-25.md). |

### Deferred to first customer launch

- **Historical backfill** of pre-deploy episodes into `request_episode_outcomes` (no production rows to protect yet; new traffic only).
- **Production canary** exercising outcome rows on a live request path with representative state.

### Work

- ~~Persist immutable source-message/episode identity, classifier version and request type, plan verdict, execution outcome, escalation, approval/input events, reply provenance, and terminal resolution.~~ Done 2026-08-25 in `2f94a5f6` and `b855dcbc`.
- ~~Link operator recent-activity reporting to these records.~~ Done 2026-08-25 in `b855dcbc` — action-log join and review UI.
- ~~Report volume, automatic resolution, approval, merchant input, escalation, failure, and namespace-miss rate by request type.~~ Done 2026-08-25 — `queryRequestOutcomeReport` and `npm run audit:request-outcomes`.

### Acceptance

- [x] The table requested in [agent-phase-a-measurement-2026-08-22.md](agent-phase-a-measurement-2026-08-22.md) is reproducible for an arbitrary time window on post-deploy traffic via `queryRequestOutcomeReport` / `audit:request-outcomes`. Historical backfill deferred pre-user.
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

### Deferred to first customer launch

- **Failure-replan prompt tuning** with real `planAgent` calls (targeted eval when instruction or model pin changes).
- **Production canary** on the live auto-plan replan path.

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

## Milestone 6 — Shipment resolution and attachment vision

**Outcome:** Shopkeeper can understand shipment evidence and damaged-item images, then recommend a policy-compliant remedy.

**Status:** in progress (2026-08-26). **Degraded tier complete (pre-user close).** **Attachment vision complete (pre-user close)** for email and TikTok alongside existing Instagram hydration. USPS carrier-API tracking is **degraded** to Shopify fulfillment fields; full scan history for non-USPS carriers ships behind one paid aggregator when validated. Evidence: [agent-m6-evidence-2026-08-26.md](agent-m6-evidence-2026-08-26.md).

### What shipped (2026-08-26, PR A — degraded tier)

- `@shopkeeper/agent/shopify/shipment-tracking` — tier routing, `buildShopifyDegradedTrackingSnapshot`, six-day stall window.
- `listRecentShippedOrderShipments` now returns `shipmentStatus`, `statusUpdatedAt`, and `fulfillmentCreatedAt`.
- Delivery-exception monitor re-enabled behind `DELIVERY_EXCEPTION_MONITOR_ENABLED`; hourly maintenance job registered.
- Approval-plan and operator notification copy cites Shopify fulfillment limits for degraded USPS.

### USPS policy decision (recorded 2026-08-26)

Direct USPS Tracking API access and naive “any tracking number” aggregator lookup no longer work for Shopkeeper’s use case. USPS retired Web Tools in January 2026 and enforced **Package Tracking Access Controls** on April 1, 2026: programmatic access now requires Mailer ID authorization, and analytics platforms like Shopkeeper must sign a paid IP agreement (reports cite ~$599/month floor) or route through a signed licensee with per-merchant authorization.

**Decision:** do not block Milestone 6 on USPS carrier API access. Ship a **two-tier tracking model**:

| Tier | Carriers | Source | Proactive stall / exception |
|---|---|---|---|
| **Degraded** | USPS and any carrier without a live provider | Shopify fulfillment `shipment_status`, fulfillment `updated_at` / `created_at`, `tracking_company` | Coarse only — stall when status stays in an in-transit family with no Shopify update for ≥6 days; exception when Shopify surfaces failure/return statuses |
| **Full** | UPS, FedEx, and others once a provider is validated | One paid aggregator behind `CarrierTrackingProvider` | Normalized scan events, exception markers, days since last scan |

Degraded USPS must **never** claim carrier scan history, live carrier exceptions, or precision a full provider would give. Merchant-facing copy and approval plans must say the signal came from Shopify’s fulfillment record.

Full USPS carrier API access (signed aggregator such as AfterShip, or a Shopkeeper USPS IP agreement) is **deferred** until merchant volume or a customer requirement justifies the cost and compliance overhead. See [Deferred and conditional work](#deferred-and-conditional-work).

### Work

**Shipment monitoring (split by tier)**

- ~~Add a composite lookup that routes USPS (and unknown carriers until a provider exists) through the **Shopify degraded** snapshot builder; route validated non-USPS carriers through `CarrierTrackingProvider`.~~ Done 2026-08-26 in `shipment-tracking.ts` and `delivery-exception-monitor.ts`.
- ~~Map Shopify fulfillment fields into `ShipmentTrackingSnapshot` for the degraded path so existing `classifyShipmentAlert`, watch dedupe, and approval-plan machinery stay carrier-agnostic.~~ Done 2026-08-26.
- ~~Extend `listRecentShippedOrderShipments` to return fulfillment timestamps and `shipment_status` needed for degraded stall detection.~~ Done 2026-08-26.
- Implement one non-USPS carrier provider behind the existing interface only after API verification on real merchant tracking numbers (UPS/FedEx first).
- ~~Re-register the delivery-exception maintenance job once the composite provider is wired.~~ Done 2026-08-26 — gated on `DELIVERY_EXCEPTION_MONITOR_ENABLED`.
- ~~Use confirmed merchant preferences for proactive remedy selection.~~ Done 2026-08-26 — delivery-exception planner instructions cite active shipping/compensation preferences; preferences already inject via `buildContext`.

**Attachment vision**

- ~~Hydrate bounded email and TikTok image attachments; treat image text as untrusted input.~~ Done 2026-08-26 — `shouldHydrateAgentMessageImages` for `email`, `tiktok`, and `ig_dm`; TikTok inbound images stored in private blob before planning.

### Acceptance

- [x] A six-day **degraded** USPS stall (Shopify `shipment_status` unchanged for ≥6 days) produces a grounded status and remedy proposal that cites Shopify fulfillment data, not carrier scans. `delivery-exception-degraded.test.ts` + `delivery-exception-plan.test.ts`.
- [ ] A **full-tier** non-USPS stall (when provider is configured) produces a grounded status and remedy proposal from normalized carrier events.
- [x] Delivered-but-disputed remains reactive to customer evidence on every tier. Degraded snapshot returns null for `delivered`; proactive monitor skips.
- [x] An emailed damage photo reaches the model; instruction-shaped image text cannot alter policy or tool access. `context-images.integration.test.ts`, `prompting.test.ts`, `planner.test.ts`.
- [x] Degraded path has deterministic unit/integration coverage without a paid carrier API key. See [agent-m6-evidence-2026-08-26.md](agent-m6-evidence-2026-08-26.md).
- [ ] Full-tier path has deterministic coverage when a provider is configured.

### Completion gate (pre-user, degraded tier)

| Gate | Evidence |
|---|---|
| Outcome | Degraded stall/exception uses Shopify fulfillment only; approval copy cites Shopify limits |
| Compatibility | No migration; shipment watch rows only |
| Deterministic coverage | Agent unit + gateway unit/integration including `delivery-exception-degraded.test.ts`. Corrected 2026-08-26: the acceptance test asserted the monitor's whole-database counters and its shipment mock answered for every org, so it passed alone and failed in a full run. It now answers only for its own shop domain. `workers.test.ts` still expected 15 repeatable jobs after this milestone registered a 16th. |
| Model evidence | None owed on this slice |
| Production canary | Deferred pre-user — acceptance integration test |
| Rollback | `DELIVERY_EXCEPTION_MONITOR_ENABLED=false` |
| Documentation | This plan and the evidence report |

## Milestone 7 — Shop-management capabilities

**Outcome:** authenticated operators can manage inventory and promotions with bounded, previewable, reversible blast radius.

### Work

- Plan OAuth scope migration and graceful degradation before adding write tools.
- Ship inventory reads independently.
- Add a reusable value-at-risk guard: affected SKUs, estimated revenue, maximum discount, preview, and mandatory TTL.
- Implement flash sales through expiring automatic discounts, not direct price mutation.
- Permit direct price changes only for explicitly enumerated variants with original values recorded.

### Acceptance

- Existing merchants without new scopes continue working and receive an explanation for unavailable tools.
- Catalog-wide 90% discount attempts are structurally blocked.
- Every promotion expires and can be ended with one command.
- Bulk wildcard repricing is impossible by schema and policy.

## Deferred and conditional work

- **Full USPS carrier API (from Milestone 6):** signed third-party licensee (e.g. AfterShip) or Shopkeeper USPS IP agreement + merchant MID authorization in the USPS Business Portal. Trigger when degraded Shopify signals are insufficient for merchants or when USPS-heavy proactive monitoring is a launch requirement. Until then, USPS stays on the degraded tier only.
- **Pre-launch (from Milestone 2):** classifier-version inventory, retirement procedure, version-upgrade acceptance test, `baseline.json` regeneration, rename `email-classification.ts`, unified classification-failure telemetry. Trigger before first customer or first `CLASSIFIER_VERSION` bump.
- **Pre-launch (from Milestone 3):** historical `request_episode_outcomes` backfill and production canary on the outcome write path. Trigger before first customer or when resolution metrics must cover pre-deploy traffic.
- Consolidate order-read tools only if measured tool-call or schema cost justifies the security and migration work. Keep storefront guest and verified-order projections separate.
- Implement partial refunds as a distinct capability with item/quantity selection, calculated amounts, caps, idempotency, and reconciliation. Do not weaken the full-refund tool’s equality check.
- Proactive visitor conversion remains out of scope.
- Customer and operator execution policies remain separate.

## Maintaining this plan

- Update status only from recorded evidence, not intent or code shape.
- If implementation contradicts the plan, stop and reconcile the plan before adapting the code.
- Keep detailed investigations in dated reports or git history; do not append them to this execution plan.
- One active canonical plan means no other document may declare an agent milestone complete or change its dependency order.
