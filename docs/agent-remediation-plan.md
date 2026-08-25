# Shopkeeper — Agent Reliability and Capability Plan

**Status:** canonical execution plan

**Last reconciled:** 2026-08-25

**Current milestone:** 2 — classification lifecycle and compatibility

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
| 2 | Classification lifecycle and compatibility | **Active** | 1 |
| 3 | Immutable outcome attribution | Pending | 1 |
| 4 | Bounded replanning after definite failure | Pending | completed safety foundations |
| 5 | Merchant preference memory | Blocked | 1, 3 |
| 6 | Shipment resolution and attachment vision | Blocked | 3; preference policy for proactive remedies |
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

**Progress:** active. Contract unification is done; the version lifecycle is not.

A database-backed characterization suite compares the email pre-persistence and customer-channel post-persistence orderings, including source alignment, stale-write rejection, and a multi-message email burst.

The `AGENT_CONTEXT_BUDGET_MODE` bullet is closed. Production had been running the flag as `shadow`, which took the legacy unbounded branch until `6c6d79a5` aliased it to `enforce`; the rollout is now finished deliberately and the flag, its legacy branch, its canary, and its comparison eval are removed.

Contract unification is closed in `933019d5` and `18f2f49a`. Of the five divergences the plan listed, three were real and are fixed — the missing staleness guard on the email path's request fields, the schema/token divergence in the model call, and the write-site split. Two were re-read as inherent and are recorded as such rather than left open: burst framing needs a thread the pre-persistence call does not have yet, and `verifiedOrderNames` only reaches the prompt for `shopify_chat`, which the email path never is. Both paths now compose their thread writes from three projections grouped by the guard each field needs, and a unit test requires those projections to consume every persisted classification field exactly once.

Two write-site inconsistencies the grouping exposed, neither on the original list: `classifierSignals` was written at thread creation while the rest of the request contract went through the guarded update, and the email path bypassed the channel filter rule. Both are closed.

**Not claimed complete.** The changed paths carry no production canary and no compatibility inventory, and two of the changes are live behavior changes. Three findings are open: the gateway's Railway replica count decides whether the staleness defect was ever reachable in production; `email-classification.ts` is now the shared classifier module for every channel and its name is the last thing asserting the split this work removed; and a two-message email burst still costs two classifier calls.

Full evidence, reachability analysis, and completion-gate status are in [agent-m2-evidence-2026-08-25.md](agent-m2-evidence-2026-08-25.md).

### Work

- ~~Unify email pre-persistence classification and other-channel post-persistence classification behind one contract.~~ Done 2026-08-25 in `933019d5` and `18f2f49a`.
- ~~Preserve the staleness guard: never save fields for a request superseded while classification was running.~~ Done 2026-08-25 in `933019d5`.
- Verify multi-message email bursts classify once per request episode. *Open: the suite pins the current behavior, which is one inline call plus one on the settled burst.*
- Define supported classifier versions and a retirement procedure: inventory → dual-read/backfill → canary → retirement.
- Add production metrics for classifier version, failure, stale-write rejection, and source alignment.
- ~~Decide the `AGENT_CONTEXT_BUDGET_MODE` rollout, then remove the unused branch.~~ Done 2026-08-25.

### Acceptance

- Channel-contract tests feed equivalent requests through every inbound ordering and compare persisted request identity/facts.
- A version upgrade test starts with live old-version rows and proves uninterrupted cards, digests, and replans.
- No version is retired while an actionable production row still depends on it.

## Milestone 3 — Immutable outcome attribution

**Outcome:** resolution rate and merchant involvement can be measured per request episode without reconstructing mutable thread history.

### Work

- Persist immutable source-message/episode identity, classifier version and request type, plan verdict, execution outcome, escalation, approval/input events, reply provenance, and terminal resolution.
- Link operator recent-activity reporting to these records.
- Report volume, automatic resolution, approval, merchant input, escalation, failure, and namespace-miss rate by request type.

### Acceptance

- The table requested in [agent-phase-a-measurement-2026-08-22.md](agent-phase-a-measurement-2026-08-22.md) is reproducible for an arbitrary time window.
- Replaced plans, answered questions, and multi-request threads retain separate histories.

## Milestone 4 — Bounded replanning after definite failure

**Outcome:** a valid multi-step plan can recover once from a definite provider rejection without duplicating completed work or weakening approval requirements.

### Work

- Distinguish `failed` (definitely no side effect) from `unknown` at the plan level.
- Permit one child plan after `failed`; pass prior committed results and the failure reason.
- Run the child through full validation, autonomy, policy, caps, hashing, and atomic claim.
- Never repeat committed steps, replan after `unknown`, or raise the autonomy tier.

### Acceptance

- Three-step fixture: step two fails definitely, remaining work succeeds once, and the merchant is notified once.
- Unknown-outcome fixture: no replan; escalation occurs; no duplicate side effect.

## Milestone 5 — Merchant preference memory

**Outcome:** Shopkeeper can apply explicit merchant judgment consistently without allowing preferences to override safety policy.

### Work

- Store org-scoped, categorized preferences with source, status, confirmation, and usage metadata.
- Build explicit operator capture first.
- Add observed proposals later behind a flag; proposals require confirmation and are never applied directly.
- Inject a bounded set of active preferences as model guidance only.
- Surface proposed preferences and recent activity through actionable merchant interfaces.

### Acceptance

- An active preference changes a draft.
- A preference attempting to exceed a hard cap still blocks or escalates structurally.
- Proposed preferences cannot affect planning before confirmation.

## Milestone 6 — Shipment resolution and attachment vision

**Outcome:** Shopkeeper can understand shipment evidence and damaged-item images, then recommend a policy-compliant remedy.

### Work

- Implement one carrier provider behind the existing provider interface; verify the current external API before coding.
- Normalize shipment history, exception type, and days since last scan.
- Restore proactive shipment detection only after a working provider exists.
- Use confirmed merchant preferences for proactive remedy selection.
- Hydrate bounded email and TikTok image attachments; treat image text as untrusted input.

### Acceptance

- A six-day shipment stall produces a grounded status and remedy proposal.
- Delivered-but-disputed remains reactive to customer evidence.
- An emailed damage photo reaches the model; instruction-shaped image text cannot alter policy or tool access.

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

- Consolidate order-read tools only if measured tool-call or schema cost justifies the security and migration work. Keep storefront guest and verified-order projections separate.
- Implement partial refunds as a distinct capability with item/quantity selection, calculated amounts, caps, idempotency, and reconciliation. Do not weaken the full-refund tool’s equality check.
- Proactive visitor conversion remains out of scope.
- Customer and operator execution policies remain separate.

## Maintaining this plan

- Update status only from recorded evidence, not intent or code shape.
- If implementation contradicts the plan, stop and reconcile the plan before adapting the code.
- Keep detailed investigations in dated reports or git history; do not append them to this execution plan.
- One active canonical plan means no other document may declare an agent milestone complete or change its dependency order.
