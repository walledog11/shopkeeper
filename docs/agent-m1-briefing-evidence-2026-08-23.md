# Milestone 1 briefing evidence — 2026-08-23

This report records deterministic and production evidence for
[Milestone 1](agent-remediation-plan.md#milestone-1--actionable-merchant-briefings).
It contains aggregate counts only. No organization, customer, thread, message,
or plan identifiers are recorded.

## Production inventory

The read-only command below ran against production at
`2026-08-23T21:21:05.858Z`:

```sh
SHOPKEEPER_DB_TARGET=prod npm run audit:agent-briefings
```

| Dimension | Count |
|---|---:|
| Open briefing threads | 67 |
| Organizations represented | 4 |
| Organizations containing both current and legacy rows | 1 |
| Classifier missing | 49 |
| Classifier v2 | 11 |
| Classifier v3 | 4 |
| Classifier v4 | 2 |
| Classifier v5 | 1 |
| Aligned request source available | 3 |
| Request-source pointer missing | 64 |
| Pointer missing but customer-message history exists | 64 |
| Escalated | 1 |
| Not escalated | 66 |
| Cached plan only | 24 |
| Operator plan only | 1 |
| No pending plan signal | 42 |

The merchant-work legacy candidate set contains 46 rows. One has an aligned
request source; the other 45 have customer-message history but no aligned
pointer. They are candidates for conservative pointer backfill or
reclassification, not permission to infer historical facts. No candidate lacks
customer text entirely.

The classifier/source/escalation/plan matrix was:

| Classifier | Source | Escalated | Pending plan | Count |
|---|---|---:|---|---:|
| missing | pointer missing | no | cached | 22 |
| missing | pointer missing | no | none | 27 |
| v2 | pointer missing | no | cached | 1 |
| v2 | pointer missing | no | none | 10 |
| v3 | pointer missing | no | cached | 1 |
| v3 | pointer missing | no | none | 3 |
| v4 | available | yes | operator | 1 |
| v4 | available | no | none | 1 |
| v5 | available | no | none | 1 |

## Deterministic coverage

The briefing fixtures now cover:

- source-aligned v5 facts;
- v4 source fallback for decisions, flagged senders, operator approvals, and
  stale cached-plan approvals;
- missing and malformed classifier state;
- missing source text and the non-actionable thread-review path;
- approval, decision, and flagged-sender items;
- mixed actionable/review items and shared-closer suppression;
- fail-closed approval commands and stable pending digest/plan identity.

Focused database-backed verification passed with 86 tests across
`digest-briefing.test.ts`, `digest.test.ts`, and `request-display.test.ts`.
The scheduled path passed 9 tests, including one delivery containing both v5
and v4 persisted shapes. The full gateway verification passed with 379 unit
tests and 861 integration tests; one integration test was skipped. Repository
script tests passed 62/62, and gateway/repository lint and typechecking passed.

No model behavior changed, so the paid eval gate does not apply.

## Canary

The scheduled-path mixed-shape integration canary passes. After explicit
production-mutation approval, the live canary ran against Linen & Loom on
2026-08-23. It rendered one v5 synthetic item and one v4 source-fallback item,
delivered one real iMessage briefing, persisted and verified both staged thread
identities, restored the operator's prior `pendingDigest`, and deleted both
synthetic customers with their cascading threads/messages.

A post-canary read-only inventory at `2026-08-23T21:28:37.094Z` exactly matched
the pre-canary 67-row inventory, confirming that no staged briefing rows remain.
The first local-credential attempt failed before delivery and also completed the
same restoration and cleanup.

Two independent production warnings were observed. The database does not yet
contain `conversation_attributions`; digest rendering catches that error and
continues without the attribution garnish. A local process using Railway's
environment cannot resolve the private Redis hostname; the canary therefore
sent after the notification layer's bounded fail-open idempotency check. The
operator delivery and durable pending identity both succeeded.

## Rollback

The operational rollback is to set `digestEnabled` to `false` for affected
organizations. This stops scheduled delivery before claiming a digest window.
It does not rewrite or discard pending plans, approvals, or `pendingDigest`.
Manual `SUMMARY` rendering remains available and retains the aligned source-text
fallback.

A database-backed rollback fixture proves all three properties: no scheduled
transport call, exact pending-state preservation, and continued legacy source
rendering.
