# Shopkeeper — Agent Pipeline Audit (Historical Index)

**Status:** historical evidence; not an execution plan

**Audited:** 2026-08-21, re-verified 2026-08-22

**Canonical plan:** [docs/agent-remediation-plan.md](docs/agent-remediation-plan.md)

The audit originally combined findings, implementation work, status updates, and future capability planning. That made it compete with `docs/agent-remediation-plan.md`, allowed the two documents to carry contradictory completion claims, and obscured the user-visible guarantees behind a long implementation history.

The active work has been consolidated into one concise plan. Use this file only to understand why the completed foundations exist and where to find the original evidence.

## Findings that remain valid

- Autonomy policy must never depend on matching English warning text.
- One function must own the planning/preview autonomy verdict.
- Invalid model plans must be rejected, not repaired sentence by sentence and partially shipped.
- Merchant notifications should render from structured, source-aligned data instead of rewriting model prose.
- Naming, sentence helpers, and policy descriptions need one owner to prevent surface drift.
- File references and passing component tests do not prove an end-to-end product claim.

## Foundations delivered from the audit

- Typed plan signals.
- One `decideAutonomy` owner with execution-time current-state enforcement.
- Plan validation without sequential output repair passes.
- Schema-enforced classifier v5 `RequestFacts`.
- Structured request displays across operator surfaces.
- Shared person naming and text helpers.
- Intent-driven tool selection with a bounded widening fallback.

Current implementation and regression status live only in the canonical plan.

## Superseded conclusion

The audit marked structured rendering complete after deleting prose-repair machinery, migrating fixtures to v5, passing model evals, and delivering a new structured operator card to a phone.

That conclusion was wrong. It assumed open pre-v5 production state was only test data and treated legacy plan-cache pruning as sufficient compatibility coverage. On 2026-08-23, a scheduled production briefing rendered a real v4 escalation as:

> Request details unavailable — open the thread for the original message. I flagged it for you.

and then asked:

> What do you want to do?

The thread still had a request-source message and conversation history. The failure was in persisted-schema rollout and end-to-end notification coverage, not missing source data.

Phase 4 is therefore reopened as Milestone 1 in the canonical plan. No downstream document may rely on the old completion claim.

## Historical sources

- Full pre-consolidation audit: `git show 32dcc391:AGENT_AUDIT.md`
- Earlier model-call audit: `git show 2cc9749c:AGENT_AUDIT.md`
- Measurement report: [docs/agent-phase-a-measurement-2026-08-22.md](docs/agent-phase-a-measurement-2026-08-22.md)
- Eval operating model: [docs/agent-eval-gates.md](docs/agent-eval-gates.md)

These sources are evidence, not current status. If they conflict with the canonical plan or the working tree, re-derive the claim and update the canonical plan.
